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
      console.log('�� 用户添加好友:', userId);

      // 获取用户profile
      const profile = await this.lineAdapter.getUserProfile(userId);
      
      // 业务逻辑：处理用户关注
      const followResult = await this.userService.handleUserFollow(userId, profile.displayName);
      
      if (!followResult.success) {
        throw new Error(followResult.error);
      }

      // 发送欢迎消息 + 试用提示
      const welcomeMessage = MessageTemplates.createWelcomeMessage();
      const introMessage = MessageTemplates.createTextMessage('🎁 **無料体験をお試しください！**\n\n📸 下記のサンプル写真からお選びください：');
      
      // 确保用户有Rich Menu
      await this.lineAdapter.ensureUserHasRichMenu(userId);
      console.log('🔍 Rich Menu设置完成');

      // 直接在同一个 reply 中发送演示视频选项，避免 push 速率/配额限制
      const { trialPhotos } = require('../config/demo-trial-photos');
      const carouselMessage = MessageTemplates.createDemoVideoCarousel(trialPhotos);

      await this.lineAdapter.replyMessage(event.replyToken, [welcomeMessage, introMessage, carouselMessage]);
      console.log('✅ 欢迎+提示+演示视频 一并发送成功');

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
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
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
          const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
          await this.lineAdapter.replyMessage(event.replyToken, planCarousel);
          return { success: true };
        case 'UPGRADE_TO_STANDARD':
          return await this.handleUpgradeToStandard(event, user);
        case 'CANCEL_UPGRADE':
          return await this.handleCancelUpgrade(event, user);
        case 'CANCEL_SUBSCRIPTION':
          return await this.handleCancelSubscription(event, user);
        case 'CONFIRM_CANCEL_SUBSCRIPTION':
          return await this.handleConfirmCancelSubscription(event, user);
        case 'CANCEL_SUBSCRIPTION_CANCEL':
          return await this.handleCancelSubscriptionCancel(event, user);
        case 'CHECK_STATUS':
          return await this.handleCheckVideoStatus(event, user);
        case 'NO_PHOTO':
          return await this.handleNoPhotoAction(event, user);
        case 'OFFICIAL_SITE':
          return await this.handleOfficialSite(event, user);
        case 'SHARE_FRIENDS':
          return await this.handleShareFriends(event, user);
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
      console.log('🎁 开始发送演示视频到用户:', userId);
      console.log('🔍 当前时间:', new Date().toISOString());
      
      const { trialPhotos } = require('../config/demo-trial-photos');
      console.log('📋 加载演示视频配置，共', trialPhotos.length, '个视频');
      
      const carouselMessage = MessageTemplates.createDemoVideoCarousel(trialPhotos);
      console.log('✅ 轮播消息创建成功，卡片数量:', carouselMessage.contents.contents.length);
      
      console.log('📤 准备发送消息到用户:', userId);
      await this.lineAdapter.pushMessage(userId, [carouselMessage]);
      console.log('✅ 演示视频选项发送完成');
    } catch (error) {
      console.error('❌ 发送演示视频选项失败:', error);
      console.error('错误详情:', error.stack);
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
      const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
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
      const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
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
      const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
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

      // 1. 立即切换到processing menu给用户即时反馈
      await this.lineAdapter.switchToProcessingMenu(user.line_user_id);

      // 2. 创建视频任务
      const subscription = await this.userService.getUserSubscription(user.id);
      const taskResult = await this.videoService.createVideoTask(user.id, {
        imageUrl,
        prompt,
        subscriptionId: subscription?.id
      });

      if (!taskResult.success) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        return { success: false, error: 'Failed to create video task' };
      }

      // 3. 启动视频生成并获取taskId
      const VideoGenerator = require('../services/video-generator');
      const videoGenerator = new VideoGenerator(this.videoService.db);
      
      // 调用KIE.AI API
      const apiResult = await videoGenerator.callRunwayApi(imageUrl, prompt);
      if (!apiResult.success) {
        // API调用失败，恢复配额并通知用户
        await this.videoService.handleVideoFailure(taskResult.videoRecordId, apiResult.error, true);
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: `❌ 動画生成に失敗しました。\n\n詳細: ${apiResult.error}\n\n✅ 利用枠は消費されておりません。`
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        return { success: false, error: apiResult.error };
      }

      // 4. 同步轮询5分钟
      const maxPollingTime = 5 * 60 * 1000; // 5分钟
      const pollInterval = 10000; // 10秒
      const startTime = Date.now();
      
      let finalResult = null;
      let pollErrorCount = 0;
      const maxPollErrors = 5; // 最多允许5次轮询错误
      
      while (Date.now() - startTime < maxPollingTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const status = await videoGenerator.checkTaskStatus(apiResult.taskId);
          
          if (status.state === 'success') {
            // 生成成功
            await this.videoService.updateVideoStatus(taskResult.videoRecordId, 'completed', status.videoUrl);
            finalResult = {
              success: true,
              videoUrl: status.videoUrl,
              thumbnailUrl: status.thumbnailUrl
            };
            break;
          } else if (status.state === 'failed' || status.state === 'error') {
            // 生成失败，恢复配额
            await this.videoService.handleVideoFailure(taskResult.videoRecordId, status.message, true);
            finalResult = {
              success: false,
              error: status.message || '動画生成に失敗しました'
            };
            break;
          }
          
          // 重置错误计数器（成功轮询）
          pollErrorCount = 0;
          // 继续轮询...
        } catch (pollError) {
          console.error('❌ 轮询错误:', pollError);
          pollErrorCount++;
          
          // 如果轮询错误次数过多，认为任务失败并恢复配额
          if (pollErrorCount >= maxPollErrors) {
            console.error('❌ 轮询错误次数过多，恢复配额');
            await this.videoService.handleVideoFailure(taskResult.videoRecordId, '轮询服务异常', true);
            finalResult = {
              success: false,
              error: '動画生成サービスに接続できません'
            };
            break;
          }
          
          // 继续轮询，不立即失败
        }
      }

      // 5. 处理结果
      if (finalResult) {
        if (finalResult.success) {
          // 成功：发送视频
          const completedMessages = MessageTemplates.createVideoStatusMessages('completed', {
            videoUrl: finalResult.videoUrl,
            thumbnailUrl: finalResult.thumbnailUrl
          });
          await this.lineAdapter.replyMessage(event.replyToken, completedMessages);
        } else {
          // 失败：发送错误信息
          await this.lineAdapter.replyMessage(event.replyToken, {
            type: 'text',
            text: `❌ 動画生成に失敗しました。\n\n詳細: ${finalResult.error}\n\n✅ 利用枠は消費されておりません。`
          });
        }
        // 切换回主菜单
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } else {
        // 超时：告知用户点击processing menu查询进度
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '🎬 動画生成中です...\n\n⏱️ 生成に通常より時間がかかっています。\n\n📱 下のメニューをタップして進捗を確認できます。'
        });
        // 保持processing menu，等待用户点击查询
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
      try {
        // 🚨 重要：如果已经创建了视频任务，必须恢复配额
        if (taskResult && taskResult.success && taskResult.videoRecordId) {
          console.log('🔄 系统错误，恢复用户配额:', taskResult.videoRecordId);
          await this.videoService.handleVideoFailure(taskResult.videoRecordId, '系统错误', true);
        }
        
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ システムエラーが発生しました。\n\n✅ 利用枠は消費されておりません。\n\n🔄 しばらくしてから再度お試しください。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } catch (replyError) {
        console.error('❌ 发送错误回复失败:', replyError);
      }
      return { success: false, error: error.message };
    }
  }

  async handleDemoGenerate(event, user, data) {
    try {
      const photoId = data.photo_id;
      
      // 1. 并行执行：立即切换processing menu + 准备demo数据
      const [_, selectedPhoto] = await Promise.all([
        // 立即切换到处理中菜单 - 给用户即时反馈
        this.lineAdapter.switchToProcessingMenu(user.line_user_id),
        // 同时准备demo视频信息
        (() => {
          const { trialPhotos } = require('../config/demo-trial-photos');
          return trialPhotos.find(photo => photo.id === photoId);
        })()
      ]);

      // 2. 等待15秒（模拟生成过程）
      await new Promise(resolve => setTimeout(resolve, 15000));

      // 3. 处理demo视频
      if (selectedPhoto) {
        // 4. 创建完成消息序列
        const demoCompletedMessages = MessageTemplates.createVideoStatusMessages('demo_completed', {
          videoUrl: selectedPhoto.demo_video_url,
          thumbnailUrl: selectedPhoto.image_url
        });
        
        // 5. 组合所有消息（completed + guide）
        const allMessages = [];
        
        // 添加完成消息
        if (Array.isArray(demoCompletedMessages)) {
          allMessages.push(...demoCompletedMessages);
        } else {
          allMessages.push(demoCompletedMessages);
        }
        
        // 添加指导消息
        allMessages.push({
          type: 'text',
          text: '✅ テスト動画の生成が完了しました！\n\nいかがでしょうか？ご自身の写真で動画を生成したい場合は、下のメニューからお選びください。'
        });

        // 6. 并行执行：发送消息 + 切换回主菜单
        await Promise.all([
          // 使用replyMessage发送完整消息序列（完全免费）
          this.lineAdapter.replyMessage(event.replyToken, allMessages),
          // 同时切换回主菜单
          this.lineAdapter.switchToMainMenu(user.line_user_id)
        ]);
      } else {
        // 处理错误情况
        console.error('❌ 找不到指定的demo照片:', photoId);
        const errorMessage = MessageTemplates.createErrorMessage('video_generation');
        await Promise.all([
          this.lineAdapter.replyMessage(event.replyToken, errorMessage),
          this.lineAdapter.switchToMainMenu(user.line_user_id)
        ]);
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ 处理演示生成失败:', error);
      // 如果出错，尝试切换回主菜单并发送错误消息
      try {
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        const errorMessage = MessageTemplates.createErrorMessage('video_generation');
        await this.lineAdapter.replyMessage(event.replyToken, errorMessage);
      } catch (recoveryError) {
        console.error('❌ 错误恢复也失败:', recoveryError);
        // 静默失败
      }
      throw error;
    }
  }

  async handleCouponAction(event, user) {
    try {
      console.log(`🎫 用户 ${user.id} 点击优惠券按钮`);
      
      // 檢查用戶訂閱狀態
      const subscription = await this.userService.getUserSubscription(user.id);
      console.log('📋 用户订阅状态:', subscription);
      
      if (!subscription) {
        // 沒有訂閱，顯示訂閱計劃選項
        console.log('💳 显示支付选项卡片');
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
        await this.lineAdapter.replyMessage(event.replyToken, planCarousel);
      } else {
        // 已有訂閱，顯示當前狀態
        if (subscription.plan_type === 'standard') {
          // Standard 用戶，僅顯示狀態
          console.log('⭐ 显示Standard订阅状态卡片');
          const statusMessage = MessageTemplates.createSubscriptionStatusMessage(subscription);
          await this.lineAdapter.replyMessage(event.replyToken, statusMessage);
        } else if (subscription.plan_type === 'trial') {
          // Trial 用戶，詢問是否升級
          console.log('🆙 显示Trial升级提示卡片');
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
      const standardUrl = process.env.STRIPE_STANDARD_URL || 'https://buy.stripe.com/fZu6oGfwvaNU9Th2HZcs80b';
      
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

  async handleCancelSubscription(event, user) {
    try {
      console.log(`🚫 用户 ${user.id} 请求取消订阅`);
      
      // 调用API获取客户门户链接
      const axios = require('axios');
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://line-photo-revival-bot.vercel.app';
      
      try {
        const response = await axios.get(`${baseUrl}/api/payment/create-portal-session?userId=${user.id}`);
        
        if (response.data.success) {
          // 发送包含Stripe客户门户链接的消息
          const portalMessage = MessageTemplates.createFlexMessage(
            'サブスクリプション管理',
            {
              type: 'bubble',
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🏪 サブスクリプション管理',
                    weight: 'bold',
                    size: 'lg',
                    color: '#333333'
                  },
                  {
                    type: 'separator',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: 'Stripeの安全なページでサブスクリプションを管理できます。',
                    size: 'sm',
                    color: '#666666',
                    margin: 'md',
                    wrap: true
                  },
                  {
                    type: 'text',
                    text: '• サブスクリプションの解約\n• お支払い方法の変更\n• 請求履歴の確認',
                    size: 'sm',
                    color: '#666666',
                    margin: 'md',
                    wrap: true
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
                    color: '#FF6B6B',
                    action: {
                      type: 'uri',
                      uri: response.data.portal_url,
                      label: '🏪 管理ページを開く'
                    }
                  }
                ]
              }
            }
          );
          
          await this.lineAdapter.replyMessage(event.replyToken, portalMessage);
        } else {
          throw new Error(response.data.error);
        }
      } catch (apiError) {
        console.error('❌ 获取客户门户链接失败:', apiError);
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createTextMessage('❌ 申し訳ございません。サブスクリプション管理ページへのアクセスに問題が発生しました。\n\nしばらくしてから再度お試しください。')
        );
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ 处理取消订阅请求失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('❌ 申し訳ございません。処理中にエラーが発生しました。しばらくしてから再度お試しください。')
      );
      return { success: false, error: error.message };
    }
  }

  async handleConfirmCancelSubscription(event, user) {
    try {
      console.log(`✅ 用户 ${user.id} 确认取消订阅`);
      
      // 调用API取消订阅
      const axios = require('axios');
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      
      const response = await axios.post(`${baseUrl}/api/cancel-subscription`, {
        userId: user.id
      });
      
      if (response.data.success) {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createTextMessage('✅ サブスクリプションを解約いたしました。\n\nご利用いただき、ありがとうございました。')
        );
      } else {
        throw new Error(response.data.error);
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ 确认取消订阅失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('❌ 申し訳ございません。解約処理中にエラーが発生しました。しばらくしてから再度お試しください。')
      );
      return { success: false, error: error.message };
    }
  }

  async handleCancelSubscriptionCancel(event, user) {
    try {
      console.log(`❌ 用户 ${user.id} 取消了取消订阅操作`);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('✅ 解約をキャンセルしました。\n\n引き続きサービスをご利用ください。')
      );
      return { success: true };
    } catch (error) {
      console.error('❌ 处理取消取消订阅失败:', error);
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createTextMessage('❌ 申し訳ございません。処理中にエラーが発生しました。')
      );
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

  async handleCheckVideoStatus(event, user) {
    try {
      // 1. 检查用户是否有正在进行的视频任务
      const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
      
      if (pendingTasks.length === 0) {
        // 没有正在生成的视频，切换到主菜单并提示
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '📱 現在生成中の動画はありません。\n\nメインメニューに戻りました。'
        });
        return { success: true, message: 'No pending tasks, switched to main menu' };
      }

      // 2. 获取任务信息
      const task = pendingTasks[0]; // 假设只有一个任务
      const VideoGenerator = require('../services/video-generator');
      const videoGenerator = new VideoGenerator(this.videoService.db);

      // 3. 继续轮询直到完成（最多5分钟）
      const maxPollingTime = 5 * 60 * 1000; // 5分钟
      const pollInterval = 10000; // 10秒
      const startTime = Date.now();
      
      let finalResult = null;
      let pollErrorCount = 0;
      const maxPollErrors = 5; // 最多允许5次轮询错误
      
      while (Date.now() - startTime < maxPollingTime) {
        try {
          const status = await videoGenerator.checkTaskStatus(task.task_id);
          
          if (status.state === 'success') {
            // 生成成功
            await this.videoService.updateVideoStatus(task.id, 'completed', status.videoUrl);
            finalResult = {
              success: true,
              videoUrl: status.videoUrl,
              thumbnailUrl: status.thumbnailUrl
            };
            break;
          } else if (status.state === 'failed' || status.state === 'error') {
            // 生成失败，恢复配额
            await this.videoService.handleVideoFailure(task.id, status.message, true);
            finalResult = {
              success: false,
              error: status.message || '動画生成に失敗しました'
            };
            break;
          }
          
          // 重置错误计数器（成功轮询）
          pollErrorCount = 0;
          // 继续轮询前等待
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (pollError) {
          console.error('❌ 轮询错误:', pollError);
          pollErrorCount++;
          
          // 如果轮询错误次数过多，认为任务失败并恢复配额
          if (pollErrorCount >= maxPollErrors) {
            console.error('❌ 轮询错误次数过多，恢复配额');
            await this.videoService.handleVideoFailure(task.id, '轮询服务异常', true);
            finalResult = {
              success: false,
              error: '動画生成サービスに接続できません'
            };
            break;
          }
          
          // 继续轮询，不立即失败
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }

      // 4. 处理结果并用replyMessage回复
      if (finalResult) {
        if (finalResult.success) {
          // 成功：发送视频
          const completedMessages = MessageTemplates.createVideoStatusMessages('completed', {
            videoUrl: finalResult.videoUrl,
            thumbnailUrl: finalResult.thumbnailUrl
          });
          await this.lineAdapter.replyMessage(event.replyToken, completedMessages);
        } else {
          // 失败：发送错误信息
          await this.lineAdapter.replyMessage(event.replyToken, {
            type: 'text',
            text: `❌ 動画生成に失敗しました。\n\n詳細: ${finalResult.error}\n\n✅ ご安心ください。利用枠は消費されておりません。\n\n🔄 しばらくしてから再度お試しいただくか、別の写真でお試しください。`
          });
        }
        // 切换回主菜单
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } else {
        // 再次超时：告知用户稍后再试
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '🎬 動画生成中です...\n\n⏱️ 生成にさらに時間がかかっています。\n\n🔄 しばらくお待ちいただいてから、再度メニューをタップしてください。'
        });
        // 保持processing menu状态
      }

      return { success: true };
    } catch (error) {
      console.error('❌ 处理状态确认失败:', error);
      try {
        // 🚨 重要：如果有pending任务，系统错误时也要恢复配额
        const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
        if (pendingTasks.length > 0) {
          const task = pendingTasks[0];
          console.log('🔄 状态确认系统错误，恢复用户配额:', task.id);
          await this.videoService.handleVideoFailure(task.id, '状态确认系统错误', true);
        }
        
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 進捗確認中にエラーが発生しました。\n\n✅ 利用枠は消費されておりません。\n\n🔄 しばらくしてから再度お試しください。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } catch (replyError) {
        console.error('❌ 发送错误回复失败:', replyError);
      }
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