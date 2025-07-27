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
   * 处理非图片文件消息
   */
  async handleNonImageFile(event) {
    try {
      const fileType = event.message.type;
      let fileTypeText = '';
      
      switch (fileType) {
        case 'video':
          fileTypeText = '動画ファイル';
          break;
        case 'audio':
          fileTypeText = '音声ファイル';
          break;
        case 'file':
          fileTypeText = 'ファイル';
          break;
        default:
          fileTypeText = 'ファイル';
      }
      
      const message = MessageTemplates.createTextMessage(
        `📋 ${fileTypeText}を受信しました。\n\n` +
        `⚠️ 動画生成には画像ファイル（JPG、PNG等）が必要です。\n\n` +
        `📸 画像をアップロードしてください。`
      );
      
      await this.lineAdapter.replyMessage(event.replyToken, message);
      return { success: true };
    } catch (error) {
      console.error('❌ 处理非图片文件失败:', error);
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
        case 'switch_to_main_menu':
          return await this.handleSwitchToMainMenu(event, user);
        case 'COUPON':
          return await this.handleCouponAction(event, user);
        case 'CHANGE_PLAN':
          // 處理計劃更改請求，顯示訂閱選項
          const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
          await this.lineAdapter.replyMessage(event.replyToken, planCarousel);
          return { success: true };
        case 'UPGRADE_TO_STANDARD':
          return await this.handleUpgradeToStandard(event, user);
        case 'CANCEL_UPGRADE':
          return await this.handleCancelUpgrade(event, user);
        case 'NO_PHOTO':
          return await this.handleNoPhotoAction(event, user);
        case 'WEBSITE':
          return await this.handleWebsiteAction(event, user);
        case 'SHARE':
          return await this.handleShareAction(event, user);
        case 'CHECK_STATUS':
          return await this.handleCheckStatusAction(event, user);
        default:
          await this.lineAdapter.replyMessage(event.replyToken, 
            MessageTemplates.createTextMessage('🤔 申し訳ございません。下部のメニューからご利用ください。')
          );
          return { success: true };
      }
    } catch (error) {
      console.error('❌ 处理Postback失败:', error);
      
      // 尝试获取用户信息用于push消息，避免重复使用replyToken
      try {
        const userId = event.source.userId;
        await this.lineAdapter.pushMessage(userId, 
          MessageTemplates.createErrorMessage('general')
        );
      } catch (pushError) {
        console.error('❌ 发送错误消息失败:', pushError);
        // 如果push也失败了，尝试reply（但可能会失败）
        try {
          await this.lineAdapter.replyMessage(event.replyToken, 
            MessageTemplates.createErrorMessage('general')
          );
        } catch (replyError) {
          console.error('❌ Reply错误消息也失败:', replyError);
        }
      }
      
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
      // 獲取用戶配額信息
      const quota = await this.videoService.checkVideoQuota(user.id);
      
      const confirmationCard = MessageTemplates.createGenerationConfirmCard(imageUrl, prompt, quota);
      await this.lineAdapter.replyMessage(event.replyToken, confirmationCard);
      // 將圖片與prompt暫存於用戶狀態，供確認按鈕後讀取
      await this.userService.setUserState(
        user.id,
        'awaiting_confirm',
        JSON.stringify({ prompt, imageUrl })
      );
      
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
    // 检查用户订阅状态
    const quota = await this.videoService.checkVideoQuota(user.id);
    if (!quota.hasQuota) {
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('🙇‍♀️ 申し訳ございません。動画生成サービスをご利用いただくには、まずプランにご加入いただく必要がございます。\n\n下記からお好みのプランをお選びください。')
      );
      
      // 推送订阅选项卡片
      const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
      await this.lineAdapter.pushMessage(user.line_user_id, planCarousel);
      return { success: true };
    }

    const messages = MessageTemplates.createActionSelectionMessages('wave');
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [...messages, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_wave_photo');
    
    return { success: true };
  }

  async handleGroupVideoAction(event, user) {
    // 检查用户订阅状态
    const quota = await this.videoService.checkVideoQuota(user.id);
    if (!quota.hasQuota) {
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('🙇‍♀️ 申し訳ございません。動画生成サービスをご利用いただくには、まずプランにご加入いただく必要がございます。\n\n下記からお好みのプランをお選びください。')
      );
      
      // 推送订阅选项卡片
      const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
      await this.lineAdapter.pushMessage(user.line_user_id, planCarousel);
      return { success: true };
    }

    const messages = MessageTemplates.createActionSelectionMessages('group');
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [...messages, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_group_photo');
    
    return { success: true };
  }

  async handlePersonalizeAction(event, user) {
    // 检查用户订阅状态
    const quota = await this.videoService.checkVideoQuota(user.id);
    if (!quota.hasQuota) {
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('🙇‍♀️ 申し訳ございません。動画生成サービスをご利用いただくには、まずプランにご加入いただく必要がございます。\n\n下記からお好みのプランをお選びください。')
      );
      
      // 推送订阅选项卡片
      const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
      await this.lineAdapter.pushMessage(user.line_user_id, planCarousel);
      return { success: true };
    }

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
            data: 'action=INPUT_CUSTOM_PROMPT',
            inputOption: 'openKeyboard'
          }
        }
      ]
    };

    await this.lineAdapter.replyMessage(event.replyToken, messages);
    await this.userService.setUserState(user.id, 'awaiting_custom_prompt_selection');
    
    return { success: true };
  }

  async handleCustomPromptInput(event, user, promptText) {
    const confirmMessage = MessageTemplates.createTextMessage(`✅ プロンプトを設定しました：\n"${promptText}"`);
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [confirmMessage, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_photo', promptText);
    
    return { success: true };
  }

  async handleRandomPromptAction(event, user) {
    const randomPrompt = this.videoService.generateRandomPrompt();
    const confirmMessage = MessageTemplates.createTextMessage(`✨ ランダムプロンプト：\n"${randomPrompt}"`);
    const photoUploadReply = this.lineAdapter.createPhotoUploadQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [confirmMessage, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_photo', randomPrompt);
    
    return { success: true };
  }

  async handleInputCustomPromptAction(event, user) {
    try {
      // 設置用戶狀態為等待自定義prompt輸入
      await this.userService.setUserState(user.id, 'awaiting_custom_prompt');
      
      // 發送簡潔的引導消息
      const instructionMessage = MessageTemplates.createTextMessage(
        '✏️ 動画のスタイルや雰囲気を入力してください：'
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
      // 先检查用户是否已有正在进行的任务
      const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
      if (pendingTasks.length > 0) {
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '🎬 現在動画を生成中です。お待ちください...\n\n⏱️ 生成完了まで今しばらくお待ちください。複数の動画を同時に生成することはできません。'
        });
        return { success: false, error: 'User already has pending tasks' };
      }

      // 從使用者狀態取出暫存資料
      let prompt = null;
      let imageUrl = null;
      try {
        const cached = JSON.parse(user.current_prompt || '{}');
        prompt = cached.prompt;
        imageUrl = cached.imageUrl;
      } catch (_) {}

      // 檢查必要參數：prompt必須存在，imageUrl可以為null
      if (!prompt) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        return { success: false, error: 'Missing prompt' };
      }

      // 验证参数
      const validation = this.videoService.validateVideoParams(imageUrl, prompt);
      if (!validation.isValid) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        return { success: false, error: validation.errors.join(', ') };
      }

      // 立即回覆開始生成並切換到processing menu
      const startMessage = MessageTemplates.createVideoStatusMessages('starting');
      await this.lineAdapter.replyMessage(event.replyToken, startMessage);
      
      // 立即切換到處理中菜單，不管用戶當前狀態
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

      // 清除用户状态
      await this.userService.clearUserState(user.id);

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
    try {
      // 檢查用戶訂閱狀態
      const subscription = await this.userService.getUserSubscription(user.id);
      
      if (!subscription) {
        // 沒有訂閱，顯示訂閱計劃選項
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel();
        await this.lineAdapter.replyMessage(event.replyToken, planCarousel);
      } else {
        // 已有訂閱，顯示當前狀態
        if (subscription.plan_type === 'standard') {
          // Standard 用戶，僅顯示狀態
          const statusMessage = MessageTemplates.createSubscriptionStatusMessage(subscription);
          await this.lineAdapter.replyMessage(event.replyToken, statusMessage);
        } else if (subscription.plan_type === 'trial') {
          // Trial 用戶，詢問是否升級
          const upgradeCard = MessageTemplates.createUpgradePromptCard(subscription);
          await this.lineAdapter.replyMessage(event.replyToken, upgradeCard);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ 處理優惠券動作失敗:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('system_error')
      );
      return { success: false, error: error.message };
    }
  }

  async handleWebsiteAction(event, user) {
    const websiteCard = MessageTemplates.createWebsiteCard();
    await this.lineAdapter.replyMessage(event.replyToken, websiteCard);
    return { success: true };
  }

  async handleShareAction(event, user) {
    const shareCard = MessageTemplates.createShareCard();
    await this.lineAdapter.replyMessage(event.replyToken, shareCard);
    return { success: true };
  }

  async handleUpgradeToStandard(event, user) {
    try {
      // 顯示 Standard Plan 訂閱選項
      const standardUrl = process.env.STRIPE_STANDARD_URL || 'https://buy.stripe.com/bJe9AS843aNUd5t5Ubcs807';
      
      const upgradeMessage = {
        type: 'flex',
        altText: '⬆️ Standard Plan 升級',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '⬆️ Standard Plan',
                weight: 'bold',
                size: 'xl',
                color: '#42C76A'
              },
              {
                type: 'text',
                text: '¥2,980/月で100本の動画生成',
                size: 'md',
                color: '#666666',
                margin: 'md'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#42C76A',
                action: {
                  type: 'uri',
                  label: '今すぐアップグレード',
                  uri: standardUrl
                }
              }
            ]
          }
        }
      };
      
      await this.lineAdapter.replyMessage(event.replyToken, upgradeMessage);
      return { success: true };
    } catch (error) {
      console.error('❌ 處理升級失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async handleCancelUpgrade(event, user) {
    try {
      const cancelMessage = MessageTemplates.createTextMessage('✅ アップグレードをキャンセルしました。\n\n現在のTrial Planを引き続きご利用ください。');
      await this.lineAdapter.replyMessage(event.replyToken, cancelMessage);
      return { success: true };
    } catch (error) {
      console.error('❌ 處理取消升級失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async handleNoPhotoAction(event, user) {
    try {
      // 檢查用戶是否有 prompt
      if (!user.current_prompt) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('system_error')
        );
        return { success: false, error: 'No prompt found' };
      }
      
      // 獲取用戶配額信息
      const quota = await this.videoService.checkVideoQuota(user.id);
      
      // 使用 null 作為 imageUrl，顯示確認卡片
      const confirmationCard = MessageTemplates.createGenerationConfirmCard(null, user.current_prompt, quota);
      await this.lineAdapter.replyMessage(event.replyToken, confirmationCard);
       
      // 將 prompt 和 無圖片 狀態暫存
      await this.userService.setUserState(
        user.id,
        'awaiting_confirm',
        JSON.stringify({ prompt: user.current_prompt, imageUrl: null })
      );
      
      return { success: true };
    } catch (error) {
      console.error('❌ 處理No Photo動作失敗:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('system_error')
      );
      return { success: false, error: error.message };
    }
  }

  async handleCheckStatusAction(event, user) {
    try {
      // 發送正在檢查進度的消息
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('🔄 動画生成の進捗を確認中です...')
      );
      
      // 首先检查用户是否有正在进行的视频任务
      const db = require('../config/database');
      const pendingTasks = await db.getUserPendingTasks(user.line_user_id);
      
      if (pendingTasks.length === 0) {
        // 没有正在生成的视频，切换到主菜单并提示
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        
        await this.lineAdapter.pushMessage(user.line_user_id, 
          MessageTemplates.createTextMessage('📱 現在生成中の動画はありません。\n\nメインメニューに戻りました。')
        );
        
        return { success: true, message: 'No pending tasks, switched to main menu' };
      }
      
      // 檢查該用戶的待處理視頻任務
      const lineAdapter = this.lineAdapter; // 保存this引用
      const videoGenerator = new (require('../services/video-generator'))(
        require('../config/database'),
        async (eventType, data) => {
          if (eventType === 'video_completed') {
            const { lineUserId, videoUrl, thumbnailUrl } = data;
            const message = {
              type: 'video',
              originalContentUrl: videoUrl,
              previewImageUrl: thumbnailUrl || videoUrl
            };
            
            await lineAdapter.pushMessage(lineUserId, [
              { type: 'text', text: '✅ 動画生成が完了しました！' },
              message
            ]);
            
            // 切換回主菜單
            try {
              const switchResult = await lineAdapter.switchToMainMenu(lineUserId);
              console.log('📋 視頻完成後菜單切換結果:', switchResult);
            } catch (menuError) {
              console.error('❌ 視頻完成後菜單切換失敗:', menuError);
            }
          } else if (eventType === 'video_failed') {
            const { lineUserId, errorMessage, quotaRestored } = data;
            
            // 创建包含配额信息的失败消息
            let failedText = '❌ 申し訳ございません。動画生成に失敗しました。\n\n';
            
            // 添加具体错误信息（如果有的话）
            if (errorMessage && errorMessage !== '视频生成失败' && errorMessage !== '系统错误，请稍后再试') {
              failedText += `詳細: ${errorMessage}\n\n`;
            }
            
            // 重要：添加配额未扣除的提示
            if (quotaRestored) {
              failedText += '✅ ご安心ください。今回の生成で利用枠は消費されておりません。\n\n';
            }
            
            failedText += '🔄 しばらくしてから再度お試しいただくか、別の写真でお試しください。';
            
            await lineAdapter.pushMessage(lineUserId, [{
              type: 'text',
              text: failedText
            }]);
            
            // 切換回主菜單
            try {
              const switchResult = await lineAdapter.switchToMainMenu(lineUserId);
              console.log('📋 視頻失敗後菜單切換結果:', switchResult);
            } catch (menuError) {
              console.error('❌ 視頻失敗後菜單切換失敗:', menuError);
            }
          }
        }
      );
      
      // 檢查用戶的待處理任務
      await videoGenerator.checkPendingTasks(user.line_user_id);
      
      return { success: true };
    } catch (error) {
      console.error('❌ 處理狀態確認失敗:', error);
      // 使用 push 而不是 reply，因为 replyToken 可能已经被使用过了
      await this.lineAdapter.pushMessage(user.line_user_id, 
        MessageTemplates.createTextMessage('❌ 進捗確認中にエラーが発生しました。しばらくしてから再度お試しください。')
      );
      return { success: false, error: error.message };
    }
  }

  async handleSwitchToMainMenu(event, user) {
    try {
      await this.lineAdapter.switchToMainMenu(user.line_user_id);
      return { success: true };
    } catch (error) {
      console.error('❌ 切换到主菜单失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('system_error')
      );
      return { success: false, error: error.message };
    }
  }
}

module.exports = EventHandler; 