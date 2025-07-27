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
    
    // 添加用户操作防抖记录
    this.userLastActionTime = new Map();
    
    // 添加用户生成任务开始时间记录（用于2分钟保护机制）
    this.userTaskStartTime = new Map();
    
    // 定期清理超过1小时没有操作的用户记录（防止内存泄漏）
    setInterval(() => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const toDelete = [];
      
      for (const [userId, lastTime] of this.userLastActionTime.entries()) {
        if (lastTime < oneHourAgo) {
          toDelete.push(userId);
        }
      }
      
      toDelete.forEach(userId => {
        this.userLastActionTime.delete(userId);
        this.userTaskStartTime.delete(userId); // 同时清理任务开始时间记录
      });
      
      if (toDelete.length > 0) {
        console.log(`🧹 清理了 ${toDelete.length} 个用户的防抖和任务时间记录`);
      }
    }, 30 * 60 * 1000); // 每30分钟清理一次
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
        // 同时发送配额消息和订阅卡片
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
        await this.lineAdapter.replyMessage(event.replyToken, [quotaMessage, planCarousel]);
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
      
      // 只使用replyMessage发送错误消息
      try {
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('general')
        );
      } catch (replyError) {
        console.error('❌ Reply错误消息失败:', replyError);
        // 记录错误但不再尝试pushMessage
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
      // 🚫 注意：这里违反了禁用pushMessage的规则，但此函数似乎未被使用
      // TODO: 如果需要使用此功能，应重构为使用replyMessage
      // await this.lineAdapter.pushMessage(userId, [carouselMessage]);
      console.log('⚠️ sendDemoVideos函数被调用但pushMessage已禁用');
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
      // 使用差异化的配额耗尽消息
      const quotaInfo = await this.userService.handleInsufficientQuota(user.id);
      const quotaMessage = MessageTemplates.createQuotaExhaustedMessage({
        remaining: quota.remaining,
        total: quota.total,
        planType: quota.planType || quotaInfo.planType,
        resetDate: quotaInfo.resetDate
      });
      
      // 如果是trial用户，同时发送配额消息和升级卡片
      if (!quotaInfo.hasSubscription || quotaInfo.planType === 'trial') {
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
        await this.lineAdapter.replyMessage(event.replyToken, [quotaMessage, planCarousel]);
      } else {
        // Standard用户只发送配额消息
        await this.lineAdapter.replyMessage(event.replyToken, quotaMessage);
      }
      
      return { success: true };
    }

    const messages = MessageTemplates.createActionSelectionMessages('wave');
    const photoUploadReply = this.lineAdapter.createPhotoOnlyQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [...messages, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_wave_photo');
    
    return { success: true };
  }

  async handleGroupVideoAction(event, user) {
    // 检查用户订阅状态
    const quota = await this.videoService.checkVideoQuota(user.id);
    if (!quota.hasQuota) {
      // 使用差异化的配额耗尽消息
      const quotaInfo = await this.userService.handleInsufficientQuota(user.id);
      const quotaMessage = MessageTemplates.createQuotaExhaustedMessage({
        remaining: quota.remaining,
        total: quota.total,
        planType: quota.planType || quotaInfo.planType,
        resetDate: quotaInfo.resetDate
      });
      
      // 如果是trial用户，同时发送配额消息和升级卡片
      if (!quotaInfo.hasSubscription || quotaInfo.planType === 'trial') {
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
        await this.lineAdapter.replyMessage(event.replyToken, [quotaMessage, planCarousel]);
      } else {
        // Standard用户只发送配额消息
        await this.lineAdapter.replyMessage(event.replyToken, quotaMessage);
      }
      
      return { success: true };
    }

    const messages = MessageTemplates.createActionSelectionMessages('group');
    const photoUploadReply = this.lineAdapter.createPhotoOnlyQuickReply();
    
    await this.lineAdapter.replyMessage(event.replyToken, [...messages, photoUploadReply]);
    await this.userService.setUserState(user.id, 'awaiting_group_photo');
    
    return { success: true };
  }

  async handlePersonalizeAction(event, user) {
    // 检查用户订阅状态
    const quota = await this.videoService.checkVideoQuota(user.id);
    if (!quota.hasQuota) {
      // 使用差异化的配额耗尽消息
      const quotaInfo = await this.userService.handleInsufficientQuota(user.id);
      const quotaMessage = MessageTemplates.createQuotaExhaustedMessage({
        remaining: quota.remaining,
        total: quota.total,
        planType: quota.planType || quotaInfo.planType,
        resetDate: quotaInfo.resetDate
      });
      
      // 如果是trial用户，同时发送配额消息和升级卡片
      if (!quotaInfo.hasSubscription || quotaInfo.planType === 'trial') {
        const planCarousel = MessageTemplates.createPaymentOptionsCarousel(user.id);
        await this.lineAdapter.replyMessage(event.replyToken, [quotaMessage, planCarousel]);
      } else {
        // Standard用户只发送配额消息
        await this.lineAdapter.replyMessage(event.replyToken, quotaMessage);
      }
      
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
      console.log('🎬 开始处理确认生成:', { userId: user.line_user_id, userState: user.current_prompt });
      
      // 🚫 首先检查用户是否已有正在处理的任务（防止重复生成）
      const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
      console.log('📋 检查pending任务:', pendingTasks.length);
      
      if (pendingTasks.length > 0) {
        console.log('⚠️ 用户已有pending任务，拒绝创建新任务');
        // 直接回复用户等待消息，不创建新任务
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '🎬 現在動画を生成中です。お待ちください...\n\n⏱️ 複数の動画を同時に生成することはできません。\n\n生成完了まで今しばらくお待ちください。'
        });
        
        // 确保用户在processing menu状态
        await this.lineAdapter.switchToProcessingMenu(user.line_user_id);
        return { success: false, error: 'User already has pending tasks' };
      }

      // 從使用者狀態取出暫存資料
      let prompt = null;
      let imageUrl = null;
      try {
        const cached = JSON.parse(user.current_prompt || '{}');
        prompt = cached.prompt;
        imageUrl = cached.imageUrl;
        console.log('📝 解析用户状态:', { prompt, imageUrl });
      } catch (parseError) {
        console.error('❌ 解析用户状态失败:', parseError);
      }

      // 檢查必要參數：prompt必須存在，imageUrl可以為null
      if (!prompt) {
        console.error('❌ 缺少prompt参数');
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        return { success: false, error: 'Missing prompt' };
      }

      // 验证参数
      console.log('🔍 验证参数...');
      const validation = this.videoService.validateVideoParams(imageUrl, prompt);
      if (!validation.isValid) {
        console.error('❌ 参数验证失败:', validation.errors);
        await this.lineAdapter.replyMessage(event.replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        return { success: false, error: validation.errors.join(', ') };
      }

      // 1. 立即切换到processing menu给用户即时反馈（不消耗replyToken）
      console.log('🔄 切换到processing menu...');
      await this.lineAdapter.switchToProcessingMenu(user.line_user_id);

      // 2. 记录任务开始时间（用于2分钟保护机制）
      this.userTaskStartTime.set(user.line_user_id, Date.now());
      console.log('⏰ 记录任务开始时间');

      // 3. 同步执行：处理现有任务或创建新任务（保留replyToken供后续使用）
      console.log('🚀 开始同步轮询流程...');
      await this.executeVideoGenerationWithPolling(event.replyToken, user, imageUrl, prompt);

      return { success: true, message: 'Video generation completed' };

    } catch (error) {
      console.error('❌ handleConfirmGenerate系统错误:', error);
      
      // 尝试恢复配额（如果有任何pending任务）
      try {
        const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
        if (pendingTasks.length > 0) {
          const VideoGenerator = require('../services/video-generator');
          const videoGenerator = new VideoGenerator(this.videoService.db);
          await videoGenerator.handleVideoFailure(user.line_user_id, pendingTasks[0].id, '系统错误');
        }
      } catch (recoveryError) {
        console.error('❌ 恢复配额失败:', recoveryError);
      }
      
      await this.lineAdapter.replyMessage(event.replyToken, 
        MessageTemplates.createErrorMessage('video_generation')
      );
      await this.lineAdapter.switchToMainMenu(user.line_user_id);
      
      return { success: false, error: error.message };
    }
  }

  // 修改：同步执行整个轮询流程
  async executeVideoGenerationWithPolling(replyToken, user, imageUrl, prompt) {
    console.log('🔄 开始同步轮询流程:', { userId: user.line_user_id });
    
    try {
      // 1. 创建新任务（此时已确保用户没有pending任务）
      console.log('📊 创建新视频任务...');
      const subscription = await this.userService.getUserSubscription(user.id);
      const taskResult = await this.videoService.createVideoTask(user.id, {
        imageUrl,
        prompt,
        subscriptionId: subscription?.id
      });
      
      if (!taskResult.success) {
        console.error('❌ 创建视频任务失败:', taskResult);
        await this.lineAdapter.replyMessage(replyToken, 
          MessageTemplates.createErrorMessage('video_generation')
        );
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        return;
      }
      
      const videoRecordId = taskResult.videoRecordId;
      console.log('📊 新任务创建成功:', { videoRecordId });

      // 2. 等待15秒后开始API调用
      console.log('⏳ 等待15秒后开始API调用...');
      await new Promise(resolve => setTimeout(resolve, 15000));

      const VideoGenerator = require('../services/video-generator');
      const videoGenerator = new VideoGenerator(this.videoService.db);
      
      // 调用KIE.AI API
      console.log('📡 调用KIE.AI API...');
      const apiResult = await videoGenerator.callRunwayApi(imageUrl, prompt);
      console.log('📡 API调用结果:', apiResult);
      
      if (!apiResult.success) {
        // API调用失败，恢复配额并通知用户
        console.log('❌ API调用失败，恢复配额');
        await videoGenerator.handleVideoFailure(user.line_user_id, videoRecordId, apiResult.error);
        
        await this.lineAdapter.replyMessage(replyToken, {
          type: 'text',
          text: '❌ 動画生成に失敗しました。利用枠は消費されておりません。\n\n📱 メインメニューに戻ります。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        return;
      }

      // 更新任务ID
      const taskId = apiResult.taskId;
      await this.videoService.db.query(
        'UPDATE videos SET task_id = $1 WHERE id = $2',
        [taskId, videoRecordId]
      );

      // 3. 同步轮询直到完成（最多5分钟）
      console.log('🔄 开始同步轮询，最大5分钟..., taskId:', taskId);
      const maxPollingTime = 5 * 60 * 1000; // 5分钟
      const pollInterval = 10000; // 10秒
      const startTime = Date.now();
      
      let finalResult = null;
      let pollErrorCount = 0;
      const maxPollErrors = 5; // 最多允许5次轮询错误
      
      while (Date.now() - startTime < maxPollingTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        console.log(`🔍 轮询检查 (${Math.floor((Date.now() - startTime) / 1000)}s)...`);
        
        try {
          const status = await videoGenerator.checkTaskStatus(taskId);
          console.log('📊 任务状态:', status);
          
          if (status.state === 'success') {
            // 生成成功 - 问题1修复：扣除配额
            console.log('✅ 视频生成成功！');
            await this.videoService.db.updateVideoStatus(taskId, 'completed', status.videoUrl);
            
            // 扣除用户配额
            console.log('💰 扣除用户配额...');
            await this.videoService.db.useVideoQuota(user.id);
            
            finalResult = {
              success: true,
              videoUrl: status.videoUrl,
              thumbnailUrl: status.thumbnailUrl
            };
            break;
          } else if (status.state === 'failed' || status.state === 'error') {
            // 生成失败，恢复配额
            console.log('❌ 视频生成失败:', status.message);
            await videoGenerator.handleVideoFailure(user.line_user_id, videoRecordId, status.message);
            finalResult = {
              success: false,
              error: status.message || '動画生成に失敗しました'
            };
            break;
          }
          
          // 重置错误计数器（成功轮询）
          pollErrorCount = 0;
          console.log('⏳ 继续轮询...');
          // 继续轮询...
        } catch (pollError) {
          console.error('❌ 轮询错误:', pollError);
          pollErrorCount++;
          
          // 如果轮询错误次数过多，认为任务失败并恢复配额
          if (pollErrorCount >= maxPollErrors) {
            console.error('❌ 轮询错误次数过多，恢复配额');
            await videoGenerator.handleVideoFailure(user.line_user_id, videoRecordId, '轮询服务异常');
            finalResult = {
              success: false,
              error: '動画生成サービスに接続できません'
            };
            break;
          }
          
          // 继续轮询，不立即失败
        }
      }

      // 4. 处理结果并使用replyToken发送
      console.log('📊 轮询结束，处理结果:', finalResult);
      if (finalResult) {
        if (finalResult.success) {
          // 成功：发送视频和完成消息
          console.log('✅ 发送成功结果');
          const videoMessage = MessageTemplates.createVideoMessage(finalResult.videoUrl, finalResult.thumbnailUrl);
          const completionMessage = MessageTemplates.createVideoCompletionMessage();
          
          await this.lineAdapter.replyMessage(replyToken, [videoMessage, completionMessage]);
          await this.lineAdapter.switchToMainMenu(user.line_user_id);
        } else {
          // 失败：发送错误消息
          console.log('❌ 发送失败结果');
          await this.lineAdapter.replyMessage(replyToken, {
            type: 'text',
            text: `❌ 動画生成に失敗しました。利用枠は消費されておりません。\n\n📱 メインメニューに戻ります。\n\nエラー: ${finalResult.error}`
          });
          await this.lineAdapter.switchToMainMenu(user.line_user_id);
        }
      } else {
        // 5分钟超时
        console.log('⏰ 轮询超时');
                  await this.lineAdapter.replyMessage(replyToken, {
            type: 'text',
            text: '⏰ 動画生成に時間がかかっています。\n\n📱 下の処理中メニューをタップして進行状況を確認してください。'
          });
          // 保持在processing menu，不切换到主菜单
        }

      // 5. 清理任务开始时间记录（无论成功失败都清理）
      this.userTaskStartTime.delete(user.line_user_id);
      console.log('🧹 清理任务开始时间记录');

    } catch (error) {
      console.error('❌ 轮询流程系统错误:', error);
      
      // 确保在系统错误时恢复配额
      try {
        const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
        if (pendingTasks.length > 0) {
          const VideoGenerator = require('../services/video-generator');
          const videoGenerator = new VideoGenerator(this.videoService.db);
          await videoGenerator.handleVideoFailure(user.line_user_id, pendingTasks[0].id, '系统错误');
        }
      } catch (recoveryError) {
        console.error('❌ 恢复配额失败:', recoveryError);
      }
      
      try {
        await this.lineAdapter.replyMessage(replyToken, {
          type: 'text',
          text: '❌ システムエラーが発生しました。利用枠は消費されておりません。\n\n📱 メインメニューに戻ります。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } catch (replyError) {
        console.error('❌ 发送错误消息失败:', replyError);
      }
      
      // 确保在错误情况下也清理任务开始时间记录
      this.userTaskStartTime.delete(user.line_user_id);
    }
  }

  // 新增：继续现有任务的轮询
  async continueExistingTaskPolling(replyToken, user, task) {
    console.log('🔄 继续现有任务轮询:', { taskId: task.task_id, videoRecordId: task.id });
    
    try {
      const VideoGenerator = require('../services/video-generator');
      const videoGenerator = new VideoGenerator(this.videoService.db);

      // 直接开始轮询（不等待15秒，因为任务已经在进行中）
      console.log('🔄 开始现有任务轮询...');
      const maxPollingTime = 5 * 60 * 1000; // 5分钟
      const pollInterval = 10000; // 10秒
      const startTime = Date.now();
      
      let finalResult = null;
      let pollErrorCount = 0;
      const maxPollErrors = 5;
      
      while (Date.now() - startTime < maxPollingTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        console.log(`🔍 现有任务轮询检查 (${Math.floor((Date.now() - startTime) / 1000)}s)...`);
        
        try {
          const status = await videoGenerator.checkTaskStatus(task.task_id);
          console.log('📊 现有任务状态:', status);
          
          if (status.state === 'success') {
            // 生成成功 - 扣除配额
            console.log('✅ 现有任务视频生成成功！');
            await this.videoService.db.updateVideoStatus(task.task_id, 'completed', status.videoUrl);
            
            // 扣除用户配额
            console.log('💰 扣除用户配额...');
            await this.videoService.db.useVideoQuota(user.id);
            
            finalResult = {
              success: true,
              videoUrl: status.videoUrl,
              thumbnailUrl: status.thumbnailUrl
            };
            break;
          } else if (status.state === 'failed' || status.state === 'error') {
            // 生成失败，恢复配额
            console.log('❌ 现有任务视频生成失败:', status.message);
            await videoGenerator.handleVideoFailure(user.line_user_id, task.id, status.message);
            finalResult = {
              success: false,
              error: status.message || '動画生成に失敗しました'
            };
            break;
          }
          
          // 重置错误计数器
          pollErrorCount = 0;
          console.log('⏳ 继续现有任务轮询...');
        } catch (pollError) {
          console.error('❌ 现有任务轮询错误:', pollError);
          pollErrorCount++;
          
          if (pollErrorCount >= maxPollErrors) {
            console.error('❌ 现有任务轮询错误次数过多，恢复配额');
            await videoGenerator.handleVideoFailure(user.line_user_id, task.id, '轮询服务异常');
            finalResult = {
              success: false,
              error: '動画生成サービスに接続できません'
            };
            break;
          }
        }
      }

      // 处理结果并使用replyToken发送
      console.log('📊 现有任务轮询结束，处理结果:', finalResult);
      if (finalResult) {
        if (finalResult.success) {
          // 成功：发送视频和完成消息
          console.log('✅ 发送现有任务成功结果');
          const videoMessage = MessageTemplates.createVideoMessage(finalResult.videoUrl, finalResult.thumbnailUrl);
          const completionMessage = MessageTemplates.createVideoCompletionMessage();
          
          await this.lineAdapter.replyMessage(replyToken, [videoMessage, completionMessage]);
          await this.lineAdapter.switchToMainMenu(user.line_user_id);
        } else {
          // 失败：发送错误消息
          console.log('❌ 发送现有任务失败结果');
          await this.lineAdapter.replyMessage(replyToken, {
            type: 'text',
            text: `❌ 動画生成に失敗しました。利用枠は消費されておりません。\n\n📱 メインメニューに戻ります。\n\nエラー: ${finalResult.error}`
          });
          await this.lineAdapter.switchToMainMenu(user.line_user_id);
        }
      } else {
        // 超时
        console.log('⏰ 现有任务轮询超时');
        await this.lineAdapter.replyMessage(replyToken, {
          type: 'text',
          text: '⏰ 動画生成に時間がかかっています。\n\n📱 下の処理中メニューをタップして進行状況を確認してください。'
        });
        // 保持在processing menu
      }

    } catch (error) {
      console.error('❌ 现有任务轮询系统错误:', error);
      
      // 确保在系统错误时恢复配额
      const VideoGenerator = require('../services/video-generator');
      const videoGeneratorForError = new VideoGenerator(this.videoService.db);
      await videoGeneratorForError.handleVideoFailure(user.line_user_id, task.id, '系统错误');
      
      try {
        await this.lineAdapter.replyMessage(replyToken, {
          type: 'text',
          text: '❌ システムエラーが発生しました。利用枠は消費されておりません。\n\n📱 メインメニューに戻ります。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } catch (replyError) {
        console.error('❌ 发送现有任务错误消息失败:', replyError);
      }
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
      console.log('🔍 开始检查视频状态:', { userId: user.line_user_id });
      
      // 0. 防抖机制：防止用户快速重复点击CHECK_STATUS
      const userId = user.line_user_id;
      const currentTime = Date.now();
      const lastActionTime = this.userLastActionTime.get(userId) || 0;
      const timeSinceLastAction = currentTime - lastActionTime;
      
      // 如果距离上次点击少于5秒，直接忽略（不消耗replyToken）
      if (timeSinceLastAction < 5000) {
        console.log(`⚡ 用户 ${userId} 点击过于频繁，忽略请求 (间隔: ${timeSinceLastAction}ms)`);
        return { success: true, message: 'Request ignored due to debounce' };
      }
      
      // 更新最后操作时间
      this.userLastActionTime.set(userId, currentTime);
      
      // 🛡️ 2分钟保护机制：检查任务是否在2分钟内刚开始
      const taskStartTime = this.userTaskStartTime.get(userId);
      if (taskStartTime) {
        const taskRunningTime = currentTime - taskStartTime;
        const twoMinutes = 2 * 60 * 1000; // 2分钟
        
        if (taskRunningTime < twoMinutes) {
          const remainingTime = Math.ceil((twoMinutes - taskRunningTime) / 1000);
          console.log(`🛡️ 任务在2分钟保护期内 (已运行: ${Math.floor(taskRunningTime/1000)}s, 剩余: ${remainingTime}s)`);
          
          await this.lineAdapter.replyMessage(event.replyToken, {
            type: 'text',
            text: `🎬 動画を生成中です...\n\n⏱️ 生成には時間がかかります。あと約${remainingTime}秒お待ちください。\n\n🚫 頻繁にタップする必要はありません。`
          });
          
          return { success: true, message: 'Task in 2-minute protection period' };
        }
        
        console.log(`⚠️ 任务超过2分钟，允许强制检查 (已运行: ${Math.floor(taskRunningTime/1000)}s)`);
      }
      
      // 1. 先清理超过2小时的过期任务
      try {
        const cleanupResult = await this.videoService.db.query(
          `UPDATE videos SET status = 'failed' 
           WHERE user_id = (SELECT id FROM users WHERE line_user_id = $1) 
           AND status IN ('pending', 'processing') 
           AND created_at < NOW() - INTERVAL '2 hours'`,
          [user.line_user_id]
        );
        if (cleanupResult.rowCount > 0) {
          console.log('🧹 清理了', cleanupResult.rowCount, '个过期任务');
        }
      } catch (cleanupError) {
        console.error('❌ 清理过期任务失败:', cleanupError);
      }
      
      // 2. 检查用户是否有正在进行的视频任务
      const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
      console.log('📋 检查pending任务:', pendingTasks.length);
      
      if (pendingTasks.length > 0) {
        console.log('⚠️ 用户已有pending任务，检查任务状态');
        // 先切换menu给视觉反馈
        await this.lineAdapter.switchToProcessingMenu(user.line_user_id);
        
        const task = pendingTasks[0];
        const taskAge = Date.now() - new Date(task.created_at).getTime();
        const isRecentTask = taskAge < 7 * 60 * 1000; // 7分钟内的任务
        
        if (isRecentTask) {
          // 任务很新，提示用户等待
          console.log('⏳ 检测到正在进行的新任务，提示等待');
          await this.lineAdapter.replyMessage(event.replyToken, {
            type: 'text',
            text: '🎬 動画を生成中です...\n\n⏱️ 生成処理中のため、今しばらくお待ちください。\n\n生成完了次第、自動的にお送りします。'
          });
          return { success: true, message: 'Task is actively processing, advised to wait' };
        } else {
          // 任务较旧，可能需要重新轮询，使用当前replyToken继续处理
          console.log('🔄 任务较旧，使用当前replyToken继续轮询');
          if (task.task_id) {
            // 有task_id，直接进入轮询流程
            await this.continueExistingTaskPolling(event.replyToken, user, task);
            return { success: true, message: 'Continued existing task polling' };
          } else {
            // 没有task_id，任务可能失败了，提示用户
            await this.lineAdapter.replyMessage(event.replyToken, {
              type: 'text',
              text: '⚠️ 前回の動画生成でエラーが発生した可能性があります。\n\n🔄 新しい動画生成を開始してください。'
            });
            await this.lineAdapter.switchToMainMenu(user.line_user_id);
            return { success: false, error: 'Previous task seems failed' };
          }
        }
      } else {
        // 没有pending任务，提示用户没有正在进行的任务
        console.log('ℹ️ 用户没有pending任务');
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '📋 現在生成中の動画はありません。\n\n🎬 新しい動画を生成したい場合は、メインメニューから開始してください。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
        return { success: true, message: 'No pending tasks found' };
      }



    } catch (error) {
      console.error('❌ 状态检查系统错误:', error);
      
      try {
        const pendingTasks = await this.videoService.db.getUserPendingTasks(user.line_user_id);
        if (pendingTasks.length > 0) {
          const task = pendingTasks[0];
          const VideoGenerator = require('../services/video-generator');
          const videoGenerator = new VideoGenerator(this.videoService.db);
          await videoGenerator.handleVideoFailure(user.line_user_id, task.id, '状态确认系统错误');
        }
      } catch (recoveryError) {
        console.error('❌ 恢复配额失败:', recoveryError);
      }
      
      try {
        await this.lineAdapter.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ システムエラーが発生しました。利用枠は消費されておりません。\n\n📱 メインメニューに戻ります。'
        });
        await this.lineAdapter.switchToMainMenu(user.line_user_id);
      } catch (replyError) {
        console.error('❌ 发送错误消息失败:', replyError);
      }
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