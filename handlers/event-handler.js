const LineAdapter = require('../adapters/line-adapter');
const VideoService = require('../core/video-service');
const UserService = require('../core/user-service');
const MessageTemplates = require('../utils/message-templates');
const db = require('../config/database');

/**
 * 事件处理协调器 - 协调LINE Adapter和业务逻辑层
 * 职责：接收LINE事件，调用业务服务，返回响应消息
 */
class EventHandler {
  constructor() {
    this.lineAdapter = new LineAdapter();
    this.videoService = new VideoService(db);
    this.userService = new UserService(db);
  }

  /**
   * 处理用户关注事件
   */
  async handleFollow(event) {
    try {
      const userId = event.source.userId;
      console.log('👋 新用户添加好友:', userId);

      // 获取用户profile
      const profile = await this.lineAdapter.getUserProfile(userId);
      
      // 业务逻辑：处理用户关注
      const followResult = await this.userService.handleUserFollow(userId, profile.displayName);
      
      if (!followResult.success) {
        throw new Error(followResult.error);
      }

      // 发送欢迎消息
      const welcomeMessage = MessageTemplates.createWelcomeMessage();
      await this.lineAdapter.replyMessage(event.replyToken, welcomeMessage);

      // 确保用户有Rich Menu
      await this.lineAdapter.ensureUserHasRichMenu(userId);

      // 发送演示视频选项
      try {
        await this.sendDemoVideos(userId);
        console.log('✅ 演示视频选项发送成功');
      } catch (demoError) {
        console.error('❌ 发送演示视频选项失败:', demoError);
        // 发送简化版本
        await this.lineAdapter.pushMessage(userId, 
          MessageTemplates.createTextMessage('🎁 無料体験をご希望の場合は、下部メニューからお気軽にお選びください！')
        );
      }

      return { success: true };
    } catch (error) {
      console.error('❌ 处理用户关注失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理文本消息
   */
  async handleTextMessage(event) {
    try {
      const userId = event.source.userId;
      const messageText = event.message.text;

      console.log(`📝 收到文本消息: ${messageText} from ${userId}`);

      // 获取用户信息
      const user = await this.userService.getUserWithState(userId);
      if (!user) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('system')
        );
        return { success: false, error: 'User not found' };
      }

      // 调试命令
      if (messageText === '狀態' || messageText === 'debug') {
        const debugInfo = await this.userService.generateUserDebugInfo(user);
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createTextMessage(debugInfo)
        );
        return { success: true };
      }

      // 根据用户状态处理消息
      switch (user.current_state) {
        case 'awaiting_custom_prompt':
          return await this.handleCustomPromptInput(event, user, messageText);
          
        case 'awaiting_photo':
          const photoUploadMessage = this.lineAdapter.createPhotoUploadQuickReply('📸 写真をアップロードしてください：');
          await this.lineAdapter.replyMessage(event.replyToken, photoUploadMessage);
          return { success: true };

        default:
          await this.lineAdapter.replyMessage(event.replyToken, 
            MessageTemplates.createTextMessage('🤔 申し訳ございません。下部のメニューからご利用ください。')
          );
          return { success: true };
      }
    } catch (error) {
      console.error('❌ 处理文本消息失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('general')
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理图片消息
   */
  async handleImageMessage(event) {
    try {
      const userId = event.source.userId;
      console.log('📸 收到图片消息:', userId);

      // 获取用户信息
      const user = await this.userService.getUserWithState(userId);
      if (!user) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('system')
        );
        return { success: false, error: 'User not found' };
      }

      console.log('📸 用户状态:', user.current_state);

      // 检查用户订阅配额
      const quota = await this.videoService.checkVideoQuota(user.id);
      if (!quota.hasQuota) {
        const quotaInfo = await this.userService.handleInsufficientQuota(user.id);
        const quotaMessage = MessageTemplates.createInsufficientQuotaCard({
          remaining: quota.remaining,
          total: quota.total,
          planType: quotaInfo.planType,
          needsUpgrade: quotaInfo.needsUpgrade,
          resetDate: quotaInfo.resetDate
        });
        await this.lineAdapter.replyMessage(event.replyToken, quotaMessage);
        // 推送订阅选项卡片
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
        await this.lineAdapter.pushMessage(user.line_user_id, planCarousel);
        return { success: true };
      }

      // 上传图片
      const imageUrl = await this.lineAdapter.uploadImage(event.message.id);
      if (!imageUrl) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('image_upload')
        );
        return { success: false, error: 'Image upload failed' };
      }

      console.log('✅ 图片上传成功:', imageUrl);

      // 根据用户状态决定后续流程
      const prompts = this.videoService.getPresetPrompts();
      
      switch (user.current_state) {
        case 'awaiting_wave_photo':
          return await this.showGenerationConfirmation(event, user, imageUrl, prompts.wave);
        case 'awaiting_group_photo':
          return await this.showGenerationConfirmation(event, user, imageUrl, prompts.group);
        case 'awaiting_photo':
          // 个性化流程，已有prompt
          if (user.current_prompt) {
            return await this.showGenerationConfirmation(event, user, imageUrl, user.current_prompt);
          } else {
            return await this.showPromptOptions(event, user, imageUrl);
          }
        default:
          // 默认情况：显示动作选择
          await this.lineAdapter.replyMessage(event.replyToken, 
            MessageTemplates.createTextMessage('📸 写真を受信しました！\n\n下部のメニューから動作を選択してください：\n\n👋 手振り - 自然な挨拶動画\n🤝 寄り添い - 温かい寄り添い動画\n🎨 個性化 - カスタム動画')
          );
          return { success: true };
      }
    } catch (error) {
      console.error('❌ 处理图片消息失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('image_upload')
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理Postback事件
   */
  async handlePostback(event) {
    try {
      const userId = event.source.userId;
      const postbackData = this.lineAdapter.parsePostbackData(event.postback.data);

      console.log('📊 收到Postback:', postbackData);

      // 获取用户信息
      let user = await this.userService.getUserWithState(userId);
      if (!user) {
        // 自动创建用户（可能是重新加好友或数据库缺失）
        const profile = await this.lineAdapter.getUserProfile(userId).catch(() => ({ displayName: 'User' }));
        await this.userService.ensureUserExists(userId, profile.displayName);
        user = await this.userService.getUserWithState(userId);
      }

      // 根据action类型处理
      switch (postbackData.action) {
        case 'WAVE_VIDEO':
          return await this.handleWaveVideoAction(event, user);
        case 'GROUP_VIDEO':
          return await this.handleGroupVideoAction(event, user);
        case 'PERSONALIZE':
          return await this.handlePersonalizeAction(event, user);
        case 'INPUT_CUSTOM_PROMPT':
          return await this.handleInputCustomPromptAction(event, user);
        case 'RANDOM_PROMPT':
          return await this.handleRandomPromptAction(event, user);
        case 'confirm_generate':
          return await this.handleConfirmGenerate(event, user, postbackData);
        case 'demo_generate':
          return await this.handleDemoGenerate(event, user, postbackData);
        case 'COUPON':
          return await this.handleCouponAction(event, user);
        case 'CHANGE_PLAN':
          // 處理計劃更改請求，顯示訂閱選項
          const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
          await this.lineAdapter.replyMessage(event.replyToken, planCarousel);
          return { success: true };
        case 'WEBSITE':
          return await this.handleWebsiteAction(event, user);
        case 'SHARE':
          return await this.handleShareAction(event, user);
        default:
          await this.lineAdapter.replyMessage(event.replyToken, 
            MessageTemplates.createTextMessage('🤔 申し訳ございません。下部のメニューからご利用ください。')
          );
          return { success: true };
      }
    } catch (error) {
      console.error('❌ 处理Postback失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('general')
      );
      return { success: false, error: error.message };
    }
  }

  // ===== 私有辅助方法 =====

  /**
   * 发送演示视频选项
   */
  async sendDemoVideos(userId) {
    try {
      const { trialPhotos } = require('../config/demo-trial-photos');
      
      const introMessage = MessageTemplates.createTextMessage('🎁 **無料体験をお試しください！**\n\n📸 下記のサンプル写真からお選びください：');
      const carouselMessage = MessageTemplates.createDemoVideoCarousel(trialPhotos);
      
      await this.lineAdapter.pushMessage(userId, [introMessage, carouselMessage]);
      console.log('✅ 演示视频选项发送完成');
    } catch (error) {
      console.error('❌ 发送演示视频选项失败:', error);
      throw error;
    }
  }

  /**
   * 显示生成确认卡片
   */
  async showGenerationConfirmation(event, user, imageUrl, prompt) {
    try {
      const confirmationCard = MessageTemplates.createGenerationConfirmCard(imageUrl, prompt);
      await this.lineAdapter.replyMessage(event.replyToken, confirmationCard);
      
      // 清除用户状态
      await this.userService.clearUserState(user.id);
      
      return { success: true };
    } catch (error) {
      console.error('❌ 显示确认卡片失败:', error);
      throw error;
    }
  }

  /**
   * 显示prompt选项（简化版）
   */
  async showPromptOptions(event, user, imageUrl) {
    try {
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('📸 写真を受信しました！\n\n下部のメニューから「個性化」を選択してプロンプトを設定してください。')
      );
      return { success: true };
    } catch (error) {
      console.error('❌ 显示prompt选项失败:', error);
      throw error;
    }
  }

  // ===== 动作处理方法 =====

  async handleWaveVideoAction(event, user) {
    const messages = MessageTemplates.createActionSelectionMessages('wave');
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [...messages, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_wave_photo');
    
    return { success: true };
  }

  async handleGroupVideoAction(event, user) {
    const messages = MessageTemplates.createActionSelectionMessages('group');
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [...messages, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_group_photo');
    
    return { success: true };
  }

  async handlePersonalizeAction(event, user) {
    const messages = MessageTemplates.createActionSelectionMessages('personalize');
    
    // 添加Quick Reply选项
    messages[0].quickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '🎲 ランダムプロンプト',
            data: 'action=RANDOM_PROMPT'
          }
        },
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '✏️ 自分で入力する',
            data: 'action=INPUT_CUSTOM_PROMPT'
          }
        }
      ]
    };

    await this.lineAdapter.replyMessage(event.replyToken, messages);
    await this.userService.setUserState(user.id, 'awaiting_custom_prompt_selection');
    
    return { success: true };
  }

  async handleCustomPromptInput(event, user, promptText) {
    const confirmMessage = MessageTemplates.createTextMessage(`✅ プロンプトを設定しました：\n"${promptText}"\n\n📸 次に写真をアップロードしてください：`);
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [confirmMessage, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_photo', promptText);
    
    return { success: true };
  }

  async handleRandomPromptAction(event, user) {
    const randomPrompt = this.videoService.generateRandomPrompt();
    const confirmMessage = MessageTemplates.createTextMessage(`✨ ランダムプロンプト：\n"${randomPrompt}"\n\n📸 写真をアップロードしてください：`);
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [confirmMessage, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_photo', randomPrompt);
    
    return { success: true };
  }

  async handleInputCustomPromptAction(event, user) {
    try {
      // 设置用户状态为等待自定义prompt输入
      await this.userService.setUserState(user.id, 'awaiting_custom_prompt');
      
      // 发送引导消息，引导用户输入自定义prompt
      const instructionMessage = MessageTemplates.createTextMessage(
        '✏️ **カスタムプロンプト入力**\n\n動画のスタイルや雰囲気を自由に入力してください：\n\n例：\n・ゆっくりと微笑む\n・懐かしい雰囲気で\n・映画のようなドラマチックに\n\n下記にご入力ください：'
      );
      
      await this.lineAdapter.replyMessage(event.replyToken, instructionMessage);
      
      return { success: true };
    } catch (error) {
      console.error('❌ 处理自定义prompt输入失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('general')
      );
      return { success: false, error: error.message };
    }
  }

  async handleConfirmGenerate(event, user, data) {
    try {
      const imageUrl = data.image_url;
      const prompt = data.prompt;

      // 验证参数
      const validation = this.videoService.validateVideoParams(imageUrl, prompt);
      if (!validation.isValid) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        return { success: false, error: validation.errors.join(', ') };
      }

      // 开始视频生成
      const startMessage = MessageTemplates.createVideoStatusMessages('starting');
      await this.lineAdapter.replyMessage(event.replyToken, startMessage);
      
      // 切换到处理中菜单
      await this.lineAdapter.switchToProcessingMenu(user.line_user_id);

      // 创建和启动视频任务
      const subscription = await this.userService.getUserSubscription(user.id);
      const taskResult = await this.videoService.createVideoTask(user.id, {
        imageUrl,
        prompt,
        subscriptionId: subscription?.id
      });

      if (taskResult.success) {
        await this.videoService.startVideoGeneration(
          taskResult.videoRecordId, 
          user.line_user_id, 
          imageUrl, 
          prompt
        );
      }

      // 记录交互
      await this.userService.logUserInteraction(user.line_user_id, user.id, 'video_generation_started', {
        imageUrl, prompt, videoRecordId: taskResult.videoRecordId
      });

      return { success: true };
    } catch (error) {
      console.error('❌ 处理确认生成失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('video_generation')
      );
      return { success: false, error: error.message };
    }
  }

  async handleDemoGenerate(event, user, data) {
    try {
      const photoId = data.photo_id;
      
      const processingMessage = MessageTemplates.createVideoStatusMessages('processing');
      await this.lineAdapter.replyMessage(event.replyToken, processingMessage);
      
      // 切换到处理中菜单
      await this.lineAdapter.switchToProcessingMenu(user.line_user_id);

      // 生成演示视频
      const demoResult = await this.videoService.generateDemoVideo(photoId);
      
      if (demoResult.success) {
        const completedMessages = MessageTemplates.createVideoStatusMessages('demo_completed', {
          videoUrl: demoResult.videoUrl,
          thumbnailUrl: demoResult.thumbnailUrl
        });
        
        await this.lineAdapter.pushMessage(user.line_user_id, completedMessages);
      } else {
        await this.lineAdapter.pushMessage(user.line_user_id, 
          MessageTemplates.createErrorMessage('video_generation')
        );
      }
      
      // 切换回主菜单
      await this.lineAdapter.switchToMainMenu(user.line_user_id);
      
      return { success: true };
    } catch (error) {
      console.error('❌ 处理演示生成失败:', error);
      return { success: false, error: error.message };
    }
  }

  async handleCouponAction(event, user) {
    // 直接顯示訂閱計劃選項，就像配額不足時一樣
    const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
    await this.lineAdapter.replyMessage(event.replyToken, planCarousel);
    return { success: true };
  }

  async handleWebsiteAction(event, user) {
    const websiteCard = MessageTemplates.createWebsiteCard();
    await this.lineAdapter.replyMessage(event.replyToken, websiteCard);
    return { success: true };
  }

  async handleShareAction(event, user) {
    const shareCard = MessageTemplates.createShareCard(this.lineAdapter.channelId || 'your-channel-id');
    await this.lineAdapter.replyMessage(event.replyToken, shareCard);
    return { success: true };
  }
}

module.exports = EventHandler; 