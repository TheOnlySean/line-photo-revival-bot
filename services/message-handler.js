const VideoGenerator = require('./video-generator');
const ImageUploader = require('./image-uploader');

class MessageHandler {
  constructor(client, db, lineBot) {
    this.client = client;
    this.db = db;
    this.lineBot = lineBot;
    this.videoGenerator = new VideoGenerator(db);
    this.imageUploader = new ImageUploader();
  }

  // 处理用户添加好友事件
  async handleFollow(event) {
    const userId = event.source.userId;
    console.log('👋 新用户添加好友:', userId);

    try {
      // 获取用户资料
      const profile = await this.client.getProfile(userId);
      console.log('👤 用户资料:', profile);

      // 创建或更新用户记录
      const user = await this.db.createLineUser(
        userId,
        profile.displayName,
        profile.pictureUrl
      );

      // 记录交互日志
      await this.db.logInteraction(userId, user.id, 'follow', {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl
      });

      // 发送欢迎消息
      await this.lineBot.sendWelcomeMessage(event.replyToken);

    } catch (error) {
      console.error('❌ 处理添加好友事件失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 系统繁忙，请稍后再试'
      });
    }
  }

  // 处理用户取消关注事件
  async handleUnfollow(event) {
    const userId = event.source.userId;
    console.log('👋 用户取消关注:', userId);

    try {
      const user = await this.db.getUserByLineId(userId);
      if (user) {
        await this.db.logInteraction(userId, user.id, 'unfollow', {});
      }
    } catch (error) {
      console.error('❌ 处理取消关注事件失败:', error);
    }
  }

  // 处理消息事件
  async handleMessage(event) {
    const userId = event.source.userId;
    const messageType = event.message.type;

    console.log('💬 收到消息:', messageType, event.message);

    try {
      // 确保用户存在于数据库中
      const user = await this.ensureUserExists(userId);

      // 检查是否有待处理的动作
      if (global.pendingAction && (Date.now() - global.pendingAction.timestamp) < 300000) { // 5分钟有效
        console.log('🎯 检测到待处理动作:', global.pendingAction);
        await this.handlePendingAction(event, user, global.pendingAction);
        global.pendingAction = null; // 清除待处理动作
        return;
      }

      switch (messageType) {
        case 'text':
          await this.handleTextMessage(event, user);
          break;
          
        case 'image':
          await this.handleImageMessage(event, user);
          break;
          
        default:
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ 申し訳ございませんが、テキストと画像のみ対応しております\n\n📱 下部メニューをご利用ください'
          });
          break;
      }
    } catch (error) {
      console.error('❌ 处理消息失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }

  // 处理文字消息
  async handleTextMessage(event, user) {
    const text = event.message.text.trim();
    
    console.log('📝 收到文字消息:', text);
    
    // 首先检查用户状态
    const userState = await this.db.getUserState(user.id);
    
    if (userState.state === 'waiting_custom_prompt') {
      // 用户正在个性化生成中输入prompt
      await this.handleCustomPromptReceived(event, user, text, userState.data);
      return;
    }
    
    // 处理Rich Menu动作关键字
    if (this.isRichMenuActionKeyword(text)) {
      await this.handleRichMenuActionKeyword(event, user, text);
      return;
    }
    
    // 处理Rich Menu动作文字（支持多种格式）
    if (this.isRichMenuAction(text)) {
      await this.handleRichMenuAction(event, user, text);
      return;
    }
    
    // 简单关键字回复
    if (text.includes('帮助') || text.includes('help')) {
      await this.sendHelpMessage(event.replyToken);
    } else if (text.includes('点数') || text.includes('余额')) {
      await this.sendUserInfo(event.replyToken, user);
    } else {
      // 默认引导用户使用菜单
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '💡 下部メニューをご利用ください：\n\n👋 手を振る - 自然な手振り動画\n🤝 寄り添う - 温かい寄り添い動画\n🎨 パーソナライズ - オリジナル創作動画'
      });
    }
  }

  // 检查是否为Rich Menu动作关键字
  isRichMenuActionKeyword(text) {
    const keywords = [
      'WAVE_ACTION',
      'GROUP_ACTION', 
      'CUSTOM_ACTION',
      'CREDITS_ACTION',
      'SHARE_ACTION',
      'STATUS_CHECK'
    ];
    
    return keywords.includes(text);
  }

  // 检查是否为Rich Menu动作文字
  isRichMenuAction(text) {
    // 支持多种格式
    const actionPatterns = [
      'action=',
      '手を振る',
      '寄り添う', 
      'パーソナライズ生成',
      'ポイント購入',
      '友達にシェア',
      'wave_hello',
      'group_support',
      'custom_generate',
      'buy_credits',
      'share_bot'
    ];
    
    return actionPatterns.some(pattern => text.includes(pattern));
  }

  // 处理Rich Menu动作关键字
  async handleRichMenuActionKeyword(event, user, keyword) {
    try {
      console.log('🎯 处理Rich Menu关键字:', keyword);

      switch (keyword) {
        case 'WAVE_ACTION':
          await this.handleWaveActionKeyword(event, user);
          break;
          
        case 'GROUP_ACTION':
          await this.handleGroupActionKeyword(event, user);
          break;
          
        case 'CUSTOM_ACTION':
          await this.handleCustomActionKeyword(event, user);
          break;
          
        case 'CREDITS_ACTION':
          await this.handleCreditsActionKeyword(event, user);
          break;
          
        case 'SHARE_ACTION':
          await this.handleShareActionKeyword(event, user);
          break;
          
        case 'STATUS_CHECK':
          await this.handleStatusCheck(event, user);
          break;
          
        default:
          console.log('⚠️ 未知关键字:', keyword);
          break;
      }
    } catch (error) {
      console.error('❌ 处理Rich Menu关键字失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }

  // 处理Rich Menu动作文字
  async handleRichMenuAction(event, user, actionText) {
    try {
      console.log('🎯 Rich Menu原始文字:', actionText);
      
      // 将文字映射到对应的动作
      let action = this.mapTextToAction(actionText);
      
      console.log('🎯 映射后的动作:', action);

      switch (action) {
        case 'wave_hello':
          await this.handleWaveHello(event, user);
          break;
          
        case 'group_support':
          await this.handleGroupSupport(event, user);
          break;
          
        case 'custom_generate':
          await this.handleCustomGenerate(event, user);
          break;
          
        case 'buy_credits':
          await this.handleBuyCredits(event, user);
          break;
          
        case 'share_bot':
          await this.handleShareBot(event, user);
          break;
          
        default:
          console.log('⚠️ 未知Rich Menu动作:', action);
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ 未知操作，请使用底部菜单重新选择'
          });
          break;
      }
    } catch (error) {
      console.error('❌ 处理Rich Menu动作失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 处理操作时发生错误，请稍后再试'
      });
    }
  }

  // 将用户输入文字映射到对应的动作
  mapTextToAction(text) {
    // 如果是action=格式，直接解析
    if (text.startsWith('action=')) {
      return text.replace('action=', '');
    }
    
    // 根据日文按钮文字映射
    const actionMap = {
      '手を振る': 'wave_hello',
      '寄り添う': 'group_support', 
      'パーソナライズ生成': 'custom_generate',
      'ポイント購入': 'buy_credits',
      '友達にシェア': 'share_bot',
      // 英文版本
      'wave_hello': 'wave_hello',
      'group_support': 'group_support',
      'custom_generate': 'custom_generate', 
      'buy_credits': 'buy_credits',
      'share_bot': 'share_bot'
    };
    
    // 寻找匹配的键
    for (const [key, value] of Object.entries(actionMap)) {
      if (text.includes(key)) {
        return value;
      }
    }
    
    return 'unknown';
  }

  // 处理待处理的动作
  async handlePendingAction(event, user, pendingAction) {
    try {
      const { action } = pendingAction;
      
      console.log('🎯 处理待处理动作:', action);

      // 根据动作类型发送相应的日语消息
      const actionMessages = {
        wave: '📸 写真をアップロードしていただければ、すぐに手振り動画の制作を開始いたします！\n\n✨ 自然な笑顔で手を振る素敵な動画を作成いたします。',
        group: '👥 複数人の写真をアップロードしていただければ、すぐに寄り添い動画の制作を開始いたします！\n\n💕 温かい雰囲気の素敵な動画を作成いたします。',
        custom: '🎨 写真をアップロードしていただければ、すぐにパーソナライズ動画の制作を開始いたします！\n\n💭 その後、ご希望の動画内容をお聞かせください。',
        credits: '💎 ポイント購入についてのご案内\n\n現在のポイント: ' + user.credits + 'ポイント\n\n🌐 詳しい料金プランは公式サイトをご確認ください：https://angelsphoto.ai',
        share: '🎁 写真復活サービスを友達にシェアしていただき、ありがとうございます！\n\n✨ より多くの方に素敵な動画体験をお届けします。'
      };

      const message = actionMessages[action];
      if (!message) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 無効なアクションです。下部メニューをご利用ください。'
        });
        return;
      }

      // 对于credits和share，直接发送消息
      if (action === 'credits') {
        await this.handleBuyCredits(event, user);
        return;
      }
      
      if (action === 'share') {
        await this.handleShareBot(event, user);
        return;
      }

      // 对于其他动作，设置用户状态并发送引导消息
      await this.db.setUserState(user.id, `waiting_${action}_photo`, { action });
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: message
      });

      await this.db.logInteraction(user.line_id, user.id, `${action}_guide_sent`, { message });

    } catch (error) {
      console.error('❌ 处理待处理动作失败:', error);
      throw error;
    }
  }

  // 处理个性化生成中用户输入的自定义prompt
  async handleCustomPromptReceived(event, user, customPrompt, stateData) {
    try {
      // 检查点数
      if (user.credits < 2) {
        await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 2);
        return;
      }

      const imageUrl = stateData?.imageUrl;
      if (!imageUrl) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 找不到您上传的图片，请重新开始个性化生成'
        });
        await this.db.clearUserState(user.id);
        return;
      }

      // 创建个性化确认卡片
      const confirmCard = this.lineBot.createCustomVideoConfirmCard(imageUrl, customPrompt, 2);

      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '🎨 准备生成您的个性化AI视频！'
        },
        confirmCard
      ]);

      // 清除用户状态
      await this.db.clearUserState(user.id);

      await this.db.logInteraction(user.line_id, user.id, 'custom_prompt_received', {
        prompt: customPrompt,
        imageUrl: imageUrl
      });

    } catch (error) {
      console.error('❌ 处理自定义prompt失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 处理提示词时发生错误，请稍后再试'
      });
    }
  }

  // 处理图片消息
  async handleImageMessage(event, user) {
    try {
      // 获取用户当前状态
      const userState = await this.db.getUserState(user.id);

      // 下载并上传图片
      const imageBuffer = await this.client.getMessageContent(event.message.id);
      const imageUrl = await this.imageUploader.uploadImage(imageBuffer);

      console.log('🖼️ 用户状态:', userState.state, '图片URL:', imageUrl);

      // 支持新的URI流程状态
      if (userState.state && userState.state.startsWith('waiting_') && userState.state.endsWith('_photo')) {
        // 用户正在特定的流程中（来自URI点击）
        const action = userState.state.replace('waiting_', '').replace('_photo', '');
        await this.handlePhotoWithAction(event, user, imageUrl, action);
        return;
      }

      switch (userState.state) {
        case 'waiting_wave_photo':
          await this.handleWavePhotoReceived(event, user, imageUrl);
          break;

        case 'waiting_group_photo':
          await this.handleGroupPhotoReceived(event, user, imageUrl);
          break;

        case 'waiting_custom_input':
          await this.handleCustomPhotoReceived(event, user, imageUrl);
          break;

        default:
          // 默认情况：用户直接发送图片但没有选择功能
          await this.handleGeneralImageUpload(event, user, imageUrl);
          break;
      }

    } catch (error) {
      console.error('❌ 处理图片消息失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 写真の処理に失敗しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }

  // 处理挥手照片接收
  async handleWavePhotoReceived(event, user, imageUrl) {
    // 检查点数
    if (user.credits < 1) {
      await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 1);
      return;
    }

    // 自动使用挥手微笑的prompt生成视频
    const wavePrompt = "A person waving hand with a warm smile, gentle and natural movement, friendly greeting gesture";
    
    const confirmCard = this.lineBot.createPresetVideoConfirmCard(imageUrl, wavePrompt, "👋 挥手微笑", 1);

    await this.client.replyMessage(event.replyToken, [
      {
        type: 'text',
        text: '👋 准备生成挥手微笑视频！'
      },
      confirmCard
    ]);

    // 清除用户状态
    await this.db.clearUserState(user.id);
  }

  // 处理肩并肩照片接收
  async handleGroupPhotoReceived(event, user, imageUrl) {
    // 检查点数
    if (user.credits < 1) {
      await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 1);
      return;
    }

    // 自动使用肩并肩的prompt生成视频
    const groupPrompt = "People standing together with warm interaction, shoulder to shoulder, showing mutual support and closeness, gentle movements expressing togetherness";
    
    const confirmCard = this.lineBot.createPresetVideoConfirmCard(imageUrl, groupPrompt, "🤝 肩并肩互相依靠", 1);

    await this.client.replyMessage(event.replyToken, [
      {
        type: 'text',
        text: '🤝 准备生成肩并肩互相依靠视频！'
      },
      confirmCard
    ]);

    // 清除用户状态
    await this.db.clearUserState(user.id);
  }

  // 处理个性化生成照片接收
  async handleCustomPhotoReceived(event, user, imageUrl) {
    // 检查点数
    if (user.credits < 2) {
      await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 2);
      return;
    }

    // 保存图片URL到用户状态数据中，等待用户输入prompt
    await this.db.setUserState(user.id, 'waiting_custom_prompt', { imageUrl: imageUrl });

    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📸 图片已收到！\n\n💭 现在请发送您的创意提示词\n例如：\n• "在海滩上快乐地奔跑"\n• "在咖啡厅里优雅地看书"\n• "在花园里轻松地散步"'
    });
  }

  // 处理一般图片上传（用户没有选择具体功能）
  async handleGeneralImageUpload(event, user, imageUrl) {
    // 检查点数
    if (user.credits < 1) {
      await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 1);
      return;
    }

    // 显示功能选择菜单
    const selectionCard = this.lineBot.createImageFunctionSelectionCard(imageUrl);

    await this.client.replyMessage(event.replyToken, [
      {
        type: 'text',
        text: '📸 图片已收到！请选择生成类型：'
      },
      selectionCard
    ]);
  }

  // 发送点数不足消息的辅助方法
  async sendInsufficientCreditsMessage(replyToken, currentCredits, neededCredits) {
    const insufficientCard = this.lineBot.createInsufficientCreditsCard(currentCredits, neededCredits);
    await this.client.replyMessage(replyToken, [
      {
        type: 'text',
        text: `💸 您的点数不足，需要${neededCredits}点数`
      },
      insufficientCard
    ]);
  }

  // 处理Postback事件
  async handlePostback(event) {
    const userId = event.source.userId;
    const data = this.parsePostbackData(event.postback.data);

    console.log('🎯 收到Postback:', data);

    try {
      const user = await this.ensureUserExists(userId);

      switch (data.action) {
        case 'wave_hello':
          await this.handleWaveHello(event, user);
          break;
          
        case 'group_support':
          await this.handleGroupSupport(event, user);
          break;
          
        case 'custom_generate':
          await this.handleCustomGenerate(event, user);
          break;
          
        case 'buy_credits':
          await this.handleBuyCredits(event, user);
          break;
          
        case 'share_bot':
          await this.handleShareBot(event, user);
          break;
          
        case 'demo_generate':
          await this.handleDemoGenerate(event, user, data.demo_id);
          break;
          
        case 'confirm_generate':
          await this.handleConfirmGenerate(event, user, data);
          break;
          
        case 'confirm_preset_generate':
          await this.handleConfirmPresetGenerate(event, user, data);
          break;

        case 'confirm_custom_generate':
          await this.handleConfirmCustomGenerate(event, user, data);
          break;

        // 新的URI流程确认动作
        case 'confirm_wave_generate':
          await this.handleConfirmWaveGenerate(event, user, data);
          break;
          
        case 'confirm_group_generate':
          await this.handleConfirmGroupGenerate(event, user, data);
          break;
          
        case 'confirm_custom_generate':
          await this.handleConfirmCustomGenerate(event, user, data);
          break;

        case 'select_wave':
          await this.handleSelectWave(event, user, data);
          break;

        case 'select_group':
          await this.handleSelectGroup(event, user, data);
          break;

        case 'select_custom':
          await this.handleSelectCustom(event, user, data);
          break;
          
        case 'cancel':
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: '✅ 操作已取消'
          });
          break;
          
        default:
          console.log('⚠️ 未知Postback动作:', data.action);
          break;
      }
    } catch (error) {
      console.error('❌ 处理Postback失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 处理请求时发生错误，请稍后再试'
      });
    }
  }

  // 处理免费体验
  async handleFreeTrial(event, user) {
    try {
      const demoContents = await this.db.getDemoContents();
      
      if (demoContents.length === 0) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 暂时没有可用的演示内容，请稍后再试'
        });
        return;
      }

      const carousel = this.lineBot.createDemoSelectionCarousel(demoContents);
      
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '🎁 选择一张照片体验高性价比AI视频生成：'
        },
        carousel
      ]);

      await this.db.logInteraction(user.line_id, user.id, 'demo_view', {
        contentCount: demoContents.length
      });

    } catch (error) {
      console.error('❌ 处理免费体验失败:', error);
      throw error;
    }
  }

  // 处理确认生成视频
  async handleConfirmGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 再次检查用户点数
      if (user.credits < 1) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 点数不足，无法生成视频'
        });
        return;
      }

      // 显示生成进度消息
      await this.lineBot.sendProcessingMessage(event.replyToken);
      
      // 扣除点数
      await this.db.updateUserCredits(user.id, -1);
      
      // 异步开始视频生成（带进度更新）
      this.startVideoGeneration(user, imageUrl);

      await this.db.logInteraction(user.line_id, user.id, 'video_generation_started', {
        imageUrl: imageUrl,
        creditsUsed: 1
      });

    } catch (error) {
      console.error('❌ 处理确认生成失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 生成视频时发生错误，请稍后再试'
      });
    }
  }

  // 开始视频生成（异步处理带进度更新）
  async startVideoGeneration(user, imageUrl) {
    try {
      // 定期发送进度更新
      const progressInterval = setInterval(async () => {
        const randomProgress = Math.floor(Math.random() * 30) + 20; // 20-50%的随机进度
        await this.lineBot.sendGenerationStatusUpdate(user.line_id, 'processing', randomProgress);
      }, 15000); // 每15秒更新一次进度

      // 调用视频生成服务
      const result = await this.videoGenerator.generateVideo(
        imageUrl,
        'A person with natural expressions and subtle movements, high quality video generation'
      );

      // 清除进度更新定时器
      clearInterval(progressInterval);

      if (result.success) {
        // 发送完成状态
        await this.lineBot.sendGenerationStatusUpdate(user.line_id, 'completed');
        
        // 发送视频
        await this.client.pushMessage(user.line_id, [
          {
            type: 'text',
            text: '🎉 您的专属AI视频已生成完成！'
          },
          {
            type: 'video',
            originalContentUrl: result.videoUrl,
            previewImageUrl: imageUrl
          },
          {
            type: 'text',
            text: '💡 如需生成更多视频，请点击底部菜单的"生成视频"按钮'
          }
        ]);

        // 保存视频记录
        await this.db.saveVideo(user.id, {
          originalImageUrl: imageUrl,
          videoUrl: result.videoUrl,
          prompt: 'User uploaded photo generation',
          model: 'runway',
          status: 'completed'
        });

        await this.db.logInteraction(user.line_id, user.id, 'video_generation_completed', {
          videoUrl: result.videoUrl,
          success: true
        });

      } else {
        // 清除进度更新定时器
        clearInterval(progressInterval);
        
        // 生成失败，退还点数
        await this.db.updateUserCredits(user.id, 1);

        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: `❌ 视频生成失败: ${result.error}\n💰 已退还1点到您的账户`
        });

        await this.db.logInteraction(user.line_id, user.id, 'video_generation_failed', {
          error: result.error,
          creditsRefunded: 1
        });
      }

    } catch (error) {
      console.error('❌ 视频生成过程出错:', error);
      
      // 退还点数
      await this.db.updateUserCredits(user.id, 1);

      await this.client.pushMessage(user.line_id, {
        type: 'text',
        text: '❌ 视频生成过程中发生错误\n💰 已退还1点到您的账户\n请稍后再试'
      });
    }
  }

  // 处理挥手功能 - 上传照片自动生成挥手视频
  async handleWaveHello(event, user) {
    try {
      // 检查用户点数
      if (user.credits < 1) {
        const insufficientCard = this.lineBot.createInsufficientCreditsCard(user.credits, 1);
        await this.client.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: '💸 您的点数不足，无法生成挥手视频'
          },
          insufficientCard
        ]);
        return;
      }

      const waveGuide = this.lineBot.createWavePhotoGuideMessage();
      
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '👋 挥手微笑视频生成\n\n📸 请上传人物照片，我们将自动生成挥手微笑的视频：'
        },
        waveGuide
      ]);

      // 设置用户状态为等待挥手照片
      await this.db.setUserState(user.id, 'waiting_wave_photo');

      await this.db.logInteraction(user.line_id, user.id, 'wave_hello_request', {
        credits: user.credits
      });

    } catch (error) {
      console.error('❌ 处理挥手功能失败:', error);
      throw error;
    }
  }

  // 处理肩并肩功能 - 上传照片自动生成肩并肩视频
  async handleGroupSupport(event, user) {
    try {
      // 检查用户点数
      if (user.credits < 1) {
        const insufficientCard = this.lineBot.createInsufficientCreditsCard(user.credits, 1);
        await this.client.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: '💸 您的点数不足，无法生成肩并肩视频'
          },
          insufficientCard
        ]);
        return;
      }

      const groupGuide = this.lineBot.createGroupPhotoGuideMessage();
      
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '🤝 肩并肩互相依靠视频生成\n\n📸 请上传多人照片，我们将自动生成温馨互动的视频：'
        },
        groupGuide
      ]);

      // 设置用户状态为等待肩并肩照片
      await this.db.setUserState(user.id, 'waiting_group_photo');

      await this.db.logInteraction(user.line_id, user.id, 'group_support_request', {
        credits: user.credits
      });

    } catch (error) {
      console.error('❌ 处理肩并肩功能失败:', error);
      throw error;
    }
  }

  // 处理个性化生成
  async handleCustomGenerate(event, user) {
    try {
      // 检查用户点数
      if (user.credits < 2) { // 个性化生成消耗更多点数
        const insufficientCard = this.lineBot.createInsufficientCreditsCard(user.credits, 2);
        await this.client.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: '💸 个性化生成需要2点数，您的点数不足'
          },
          insufficientCard
        ]);
        return;
      }

      const customGuide = this.lineBot.createCustomGenerateGuideMessage();
      
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '🎨 个性化AI视频生成\n\n1️⃣ 请先上传您的照片\n2️⃣ 然后发送您的创意提示词'
        },
        customGuide
      ]);

      // 设置用户状态为等待个性化生成的照片和prompt
      await this.db.setUserState(user.id, 'waiting_custom_input');

      await this.db.logInteraction(user.line_id, user.id, 'custom_generate_request', {
        credits: user.credits
      });

    } catch (error) {
      console.error('❌ 处理个性化生成请求失败:', error);
      throw error;
    }
  }

  // 处理确认预设prompt生成
  async handleConfirmPresetGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      const prompt = decodeURIComponent(data.prompt);
      const creditsNeeded = parseInt(data.credits);
      
      // 再次检查用户点数
      if (user.credits < creditsNeeded) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: `❌ 点数不足，需要${creditsNeeded}点数`
        });
        return;
      }

      // 显示生成进度消息
      await this.lineBot.sendProcessingMessage(event.replyToken);
      
      // 扣除点数
      await this.db.updateUserCredits(user.id, -creditsNeeded);
      
      // 异步开始视频生成
      this.startVideoGenerationWithPrompt(user, imageUrl, prompt, creditsNeeded);

      await this.db.logInteraction(user.line_id, user.id, 'preset_video_generation_started', {
        imageUrl: imageUrl,
        prompt: prompt,
        creditsUsed: creditsNeeded
      });

    } catch (error) {
      console.error('❌ 处理预设生成确认失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 生成视频时发生错误，请稍后再试'
      });
    }
  }

  // 处理确认自定义prompt生成
  async handleConfirmCustomGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      const customPrompt = decodeURIComponent(data.prompt);
      const creditsNeeded = parseInt(data.credits);
      
      // 再次检查用户点数
      if (user.credits < creditsNeeded) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: `❌ 点数不足，需要${creditsNeeded}点数`
        });
        return;
      }

      // 显示生成进度消息
      await this.lineBot.sendProcessingMessage(event.replyToken);
      
      // 扣除点数
      await this.db.updateUserCredits(user.id, -creditsNeeded);
      
      // 异步开始视频生成
      this.startVideoGenerationWithPrompt(user, imageUrl, customPrompt, creditsNeeded);

      await this.db.logInteraction(user.line_id, user.id, 'custom_video_generation_started', {
        imageUrl: imageUrl,
        prompt: customPrompt,
        creditsUsed: creditsNeeded
      });

    } catch (error) {
      console.error('❌ 处理个性化生成确认失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 生成视频时发生错误，请稍后再试'
      });
    }
  }

  // 处理图片功能选择 - 挥手
  async handleSelectWave(event, user, data) {
    const imageUrl = decodeURIComponent(data.image_url);
    const wavePrompt = "A person waving hand with a warm smile, gentle and natural movement, friendly greeting gesture";
    
    const confirmCard = this.lineBot.createPresetVideoConfirmCard(imageUrl, wavePrompt, "👋 挥手微笑", 1);

    await this.client.replyMessage(event.replyToken, [
      {
        type: 'text',
        text: '👋 准备生成挥手微笑视频！'
      },
      confirmCard
    ]);
  }

  // 处理图片功能选择 - 肩并肩
  async handleSelectGroup(event, user, data) {
    const imageUrl = decodeURIComponent(data.image_url);
    const groupPrompt = "People standing together with warm interaction, shoulder to shoulder, showing mutual support and closeness, gentle movements expressing togetherness";
    
    const confirmCard = this.lineBot.createPresetVideoConfirmCard(imageUrl, groupPrompt, "🤝 肩并肩互相依靠", 1);

    await this.client.replyMessage(event.replyToken, [
      {
        type: 'text',
        text: '🤝 准备生成肩并肩互相依靠视频！'
      },
      confirmCard
    ]);
  }

  // 处理图片功能选择 - 个性化
  async handleSelectCustom(event, user, data) {
    const imageUrl = decodeURIComponent(data.image_url);
    
    // 设置用户状态为等待自定义prompt，并保存图片URL
    await this.db.setUserState(user.id, 'waiting_custom_prompt', { imageUrl: imageUrl });

    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '🎨 个性化生成已选择！\n\n💭 现在请发送您的创意提示词\n例如：\n• "在海滩上快乐地奔跑"\n• "在咖啡厅里优雅地看书"\n• "在花园里轻松地散步"'
    });
  }

  // 使用指定prompt开始视频生成
  async startVideoGenerationWithPrompt(user, imageUrl, prompt, creditsUsed) {
    try {
      // 定期发送进度更新
      const progressInterval = setInterval(async () => {
        const randomProgress = Math.floor(Math.random() * 30) + 20; // 20-50%的随机进度
        await this.lineBot.sendGenerationStatusUpdate(user.line_id, 'processing', randomProgress);
      }, 15000); // 每15秒更新一次进度

      // 调用视频生成服务
      const result = await this.videoGenerator.generateVideo(imageUrl, prompt);

      // 清除进度更新定时器
      clearInterval(progressInterval);

      if (result.success) {
        // 发送完成状态
        await this.lineBot.sendGenerationStatusUpdate(user.line_id, 'completed');
        
        // 发送视频
        await this.client.pushMessage(user.line_id, [
          {
            type: 'text',
            text: '🎉 您的专属AI视频已生成完成！'
          },
          {
            type: 'video',
            originalContentUrl: result.videoUrl,
            previewImageUrl: imageUrl
          },
          {
            type: 'text',
            text: '💡 如需生成更多视频，请使用底部菜单选择功能'
          }
        ]);

        // 保存视频记录
        await this.db.saveVideo(user.id, {
          originalImageUrl: imageUrl,
          videoUrl: result.videoUrl,
          prompt: prompt,
          model: 'runway',
          status: 'completed'
        });

        await this.db.logInteraction(user.line_id, user.id, 'video_generation_completed', {
          videoUrl: result.videoUrl,
          prompt: prompt,
          success: true
        });

      } else {
        // 清除进度更新定时器
        clearInterval(progressInterval);
        
        // 生成失败，退还点数
        await this.db.updateUserCredits(user.id, creditsUsed);

        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: `❌ 视频生成失败: ${result.error}\n💰 已退还${creditsUsed}点到您的账户`
        });

        await this.db.logInteraction(user.line_id, user.id, 'video_generation_failed', {
          error: result.error,
          creditsRefunded: creditsUsed
        });
      }

    } catch (error) {
      console.error('❌ 视频生成过程出错:', error);
      
      // 退还点数
      await this.db.updateUserCredits(user.id, creditsUsed);

      await this.client.pushMessage(user.line_id, {
        type: 'text',
        text: `❌ 视频生成过程中发生错误\n💰 已退还${creditsUsed}点到您的账户\n请稍后再试`
      });
    }
  }

  // 处理充值点数功能
  async handleBuyCredits(event, user) {
    try {
      const buyCreditsMessage = {
        type: 'flex',
        altText: '点数充值指南',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '💎 点数充值',
                weight: 'bold',
                size: 'xl',
                color: '#FF6B35',
                align: 'center'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'lg',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'baseline',
                    contents: [
                      {
                        type: 'text',
                        text: '当前点数:',
                        size: 'sm',
                        color: '#666666',
                        flex: 3
                      },
                      {
                        type: 'text',
                        text: `${user.credits}点`,
                        size: 'sm',
                        weight: 'bold',
                        color: '#FF6B35',
                        flex: 2
                      }
                    ]
                  },
                  {
                    type: 'text',
                    text: '💡 更多充值选项请访问官网',
                    size: 'sm',
                    color: '#666666',
                    align: 'center',
                    margin: 'lg'
                  }
                ]
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '🌐 访问官网充值',
                  uri: 'https://angelsphoto.ai'
                },
                style: 'primary',
                color: '#FF6B35'
              }
            ]
          }
        }
      };
      
      await this.client.replyMessage(event.replyToken, buyCreditsMessage);

      await this.db.logInteraction(user.line_id, user.id, 'buy_credits_view', {
        currentCredits: user.credits
      });

    } catch (error) {
      console.error('❌ 处理充值点数功能失败:', error);
      throw error;
    }
  }

  // 处理分享Bot功能
  async handleShareBot(event, user) {
    try {
      const shareMessage = this.lineBot.createShareBotMessage();
      
      await this.client.replyMessage(event.replyToken, shareMessage);

      await this.db.logInteraction(user.line_id, user.id, 'share_bot', {
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ 处理分享功能失败:', error);
      throw error;
    }
  }

  // 处理生成视频请求
  async handleGenerateVideoRequest(event, user) {
    try {
      // 检查用户点数
      if (user.credits < 1) {
        const insufficientCard = this.lineBot.createInsufficientCreditsCard(user.credits, 1);
        await this.client.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: '💸 您的点数不足，无法生成视频'
          },
          insufficientCard
        ]);
        return;
      }

      // 发送上传引导消息
      const uploadGuide = this.lineBot.createUploadGuideMessage();
      
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '🎬 开始创建您的专属AI视频！\n\n📸 请上传一张清晰的照片：'
        },
        uploadGuide
      ]);

      await this.db.logInteraction(user.line_id, user.id, 'generate_request', {
        credits: user.credits
      });

    } catch (error) {
      console.error('❌ 处理生成视频请求失败:', error);
      throw error;
    }
  }

  // 处理演示视频生成
  async handleDemoGenerate(event, user, demoId) {
    try {
      const demoContents = await this.db.getDemoContents();
      const demo = demoContents.find(d => d.id == demoId);
      
      if (!demo) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 找不到指定的演示内容'
        });
        return;
      }

      // 发送处理中消息
      await this.lineBot.sendProcessingMessage(event.replyToken);

      // 延迟发送，模拟真实处理时间
      setTimeout(async () => {
        try {
          await this.client.pushMessage(user.line_id, [
            {
              type: 'text',
              text: `✅ 视频生成完成！\n\n📸 ${demo.title}\n🎬 这是您的AI生成视频：`
            },
            {
              type: 'video',
              originalContentUrl: demo.video_url,
              previewImageUrl: demo.image_url
            },
            {
              type: 'text',
              text: '🎉 体验完成！\n\n💎 想要生成更多个性化视频？\n请点击"充值点数"购买点数后上传您的照片'
            }
          ]);

          // 记录交互
          await this.db.logInteraction(user.line_id, user.id, 'demo_generate', {
            demoId: demo.id,
            demoTitle: demo.title
          });

        } catch (error) {
          console.error('❌ 发送演示视频失败:', error);
          await this.client.pushMessage(user.line_id, {
            type: 'text',
            text: '❌ 视频发送失败，请稍后再试'
          });
        }
      }, 3000); // 3秒后发送

    } catch (error) {
      console.error('❌ 处理演示生成失败:', error);
      throw error;
    }
  }

  // 处理生成视频请求
  async handleGenerateVideo(event, user) {
    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📸 请上传您的照片\n\n💡 建议：\n• 清晰的人物照片\n• 正面或侧面肖像\n• 光线充足\n• 建议尺寸：512x512或以上'
    });
  }

  // 处理确认生成
  async handleConfirmGenerate(event, user, imageUrl) {
    try {
      // 检查点数
      if (user.credits < 1) {
        const insufficientCard = this.lineBot.createInsufficientCreditsCard(user.credits, 1);
        await this.client.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: '💸 您的点数不足'
          },
          insufficientCard
        ]);
        return;
      }

      // 发送处理中消息
      await this.lineBot.sendProcessingMessage(event.replyToken);

      // 扣除点数
      await this.db.updateUserCredits(user.id, -1);

      // 创建视频生成记录
      const videoRecord = await this.db.createVideoGeneration(
        user.id,
        `Photo revival from ${imageUrl}`,
        false,
        1
      );

      // 开始生成视频
      await this.videoGenerator.generateVideo(user.line_id, imageUrl, videoRecord.id);

      // 记录交互
      await this.db.logInteraction(user.line_id, user.id, 'video_request', {
        imageUrl: imageUrl,
        videoId: videoRecord.id
      });

    } catch (error) {
      console.error('❌ 处理确认生成失败:', error);
      throw error;
    }
  }

  // 处理充值点数
  async handleBuyCredits(event, user) {
    // TODO: 集成支付系统
    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '💎 充值功能开发中...\n\n📞 如需充值，请联系客服\n或访问我们的官网完成充值'
    });
  }

  // 处理查看点数
  async handleCheckCredits(event, user) {
    await this.sendUserInfo(event.replyToken, user);
  }

  // 处理我的视频
  async handleMyVideos(event, user) {
    try {
      const videos = await this.db.query(
        'SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [user.id]
      );

      if (videos.rows.length === 0) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '📹 您还没有生成过视频\n\n点击"生成视频"开始创作您的第一个AI视频！'
        });
        return;
      }

      let message = '📹 您的最近视频：\n\n';
      videos.rows.forEach((video, index) => {
        const status = video.status === 'completed' ? '✅' : 
                      video.status === 'processing' ? '⏳' : '❌';
        message += `${index + 1}. ${status} ${video.original_prompt}\n`;
        message += `   ${new Date(video.created_at).toLocaleDateString()}\n\n`;
      });

      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: message
      });

    } catch (error) {
      console.error('❌ 获取用户视频失败:', error);
      throw error;
    }
  }

  // 发送帮助消息
  async sendHelpMessage(replyToken) {
    await this.client.replyMessage(replyToken, {
      type: 'text',
      text: '💡 写真復活使用指南：\n\n🎁 免费体验\n   • 选择预设照片体验高性价比AI视频生成\n   • 完全免费，立即生成\n\n🎬 生成视频\n   • 上传您的照片\n   • 消耗1点数\n   • 生成个性化视频\n\n💎 充值点数\n   • 购买点数生成更多视频\n   • 新用户注册即送100点数\n\n📊 查看信息\n   • 查看剩余点数\n   • 查看生成历史\n\n❓ 如有疑问，请联系客服'
    });
  }

  // 发送用户信息
  async sendUserInfo(replyToken, user) {
    const userCard = await this.lineBot.createUserInfoCard(user);
    await this.client.replyMessage(replyToken, [
      {
        type: 'text',
        text: '📊 您的账户信息：'
      },
      userCard
    ]);
  }

  // 确保用户存在于数据库中
  async ensureUserExists(lineUserId) {
    let user = await this.db.getUserByLineId(lineUserId);
    
    if (!user) {
      try {
        const profile = await this.client.getProfile(lineUserId);
        user = await this.db.createLineUser(
          lineUserId,
          profile.displayName,
          profile.pictureUrl
        );
      } catch (error) {
        console.error('❌ 创建用户失败:', error);
        // 创建基础用户记录
        user = await this.db.createLineUser(lineUserId, 'LINE用户', null);
      }
    }
    
    return user;
  }

  // 解析Postback数据
  parsePostbackData(data) {
    const params = {};
    const pairs = data.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      params[key] = decodeURIComponent(value || '');
    }
    
    return params;
  }
  // 处理特定动作的照片（URI流程）
  async handlePhotoWithAction(event, user, imageUrl, action) {
    try {
      console.log('🎯 处理特定动作的照片:', action, imageUrl);

      // 创建确认卡片
      const confirmationCard = this.createActionConfirmationCard(imageUrl, action, user);
      
      const actionMessages = {
        wave: '📸 素敵な写真ですね！\n\n✨ 手を振る動画を生成いたします。',
        group: '📸 素敵な写真ですね！\n\n💕 寄り添い動画を生成いたします。',
        custom: '📸 素敵な写真ですね！\n\n🎨 パーソナライズ動画を生成いたします。'
      };

      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: actionMessages[action] || '📸 写真を受信しました！'
        },
        confirmationCard
      ]);

      // 更新用户状态为等待确认
      await this.db.setUserState(user.id, `confirming_${action}`, { 
        imageUrl, 
        action 
      });

      await this.db.logInteraction(user.line_id, user.id, `${action}_photo_received`, {
        imageUrl,
        fromUri: true
      });

    } catch (error) {
      console.error('❌ 处理特定动作照片失败:', error);
      throw error;
    }
  }

    // 处理挥手生成确认（URI流程）
  async handleConfirmWaveGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 检查点数
      if (user.credits < 1) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '💸 ポイントが不足しています。\n\n現在のポイント: 0\n必要なポイント: 1\n\n🌐 ポイント購入は公式サイトをご確認ください。'
        });
        return;
      }

      // 扣除点数
      await this.db.updateUserCredits(user.id, -1);
      
      // 清除用户状态
      await this.db.clearUserState(user.id);
      
      // 切换到生成中Rich Menu
      await this.lineBot.switchToProcessingMenu(user.line_id);
      
      // 发送生成中的确认消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎬 手振り動画の生成を開始いたします！\n\n⏱️ 生成には約30-60秒かかります。完成次第お送りいたします。'
      });

      // 异步生成视频
      this.generateVideoAsync(user, imageUrl, 'wave');
      
    } catch (error) {
      console.error('❌ 处理挥手生成确认失败:', error);
      throw error;
    }
  }

  // 处理肩并肩生成确认（URI流程）
  async handleConfirmGroupGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 检查点数
      if (user.credits < 1) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '💸 ポイントが不足しています。\n\n現在のポイント: 0\n必要なポイント: 1\n\n🌐 ポイント購入は公式サイトをご確認ください。'
        });
        return;
      }

      // 扣除点数
      await this.db.updateUserCredits(user.id, -1);
      
      // 清除用户状态
      await this.db.clearUserState(user.id);
      
      // 切换到生成中Rich Menu
      await this.lineBot.switchToProcessingMenu(user.line_id);
      
      // 发送生成中的确认消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎬 寄り添い動画の生成を開始いたします！\n\n⏱️ 生成には約30-60秒かかります。完成次第お送りいたします。'
      });

      // 异步生成视频
      this.generateVideoAsync(user, imageUrl, 'group');
      
    } catch (error) {
      console.error('❌ 处理肩并肩生成确认失败:', error);
      throw error;
    }
  }

  // 处理个性化生成确认（URI流程）  
  async handleConfirmCustomGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 检查点数
      if (user.credits < 2) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '💸 ポイントが不足しています。\n\n現在のポイント: ' + user.credits + '\n必要なポイント: 2\n\n🌐 ポイント購入は公式サイトをご確認ください。'
        });
        return;
      }

      // 设置用户状态为等待自定义提示词
      await this.db.setUserState(user.id, 'waiting_custom_prompt', { 
        imageUrl,
        action: 'custom'
      });
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎨 パーソナライズ動画生成を開始いたします！\n\n💭 ご希望の動画内容を日本語でお教えください。\n\n例：\n「海辺で微笑みながら手を振る」\n「カフェで本を読んでいる」\n「桜の下で踊っている」'
      });
      
    } catch (error) {
      console.error('❌ 处理个性化生成确认失败:', error);
      throw error;
    }
  }

  // 异步生成视频
  async generateVideoAsync(user, imageUrl, type) {
    try {
      console.log('🎬 开始异步生成视频:', type, imageUrl);
      
      const prompts = {
        wave: 'A person naturally waving hand with a warm smile, subtle head movement, friendly gesture, high quality portrait video',
        group: 'People standing close together in a warm, supportive pose, gentle movements showing closeness and friendship, heartwarming scene'
      };
      
      const prompt = prompts[type] || prompts.wave;
      
      // 调用视频生成API
      const result = await this.videoGenerator.generateVideo({
        imageUrl,
        prompt,
        model: 'runway' // 使用高性价比的Runway模型
      });
      
      // 切换回主要Rich Menu
      await this.lineBot.switchToMainMenu(user.line_id);
      
      if (result.success) {
        // 生成成功，发送视频给用户
        await this.client.pushMessage(user.line_id, [
          {
            type: 'text',
            text: '✅ 動画生成が完了いたしました！\n\n🎬 素敵な動画をお楽しみください！'
          },
          {
            type: 'video',
            originalContentUrl: result.videoUrl,
            previewImageUrl: imageUrl
          }
        ]);

        await this.db.logInteraction(user.line_id, user.id, 'video_generated', {
          type,
          imageUrl,
          videoUrl: result.videoUrl,
          success: true
        });
        
      } else {
        // 生成失败，退还点数
        const refundAmount = type === 'custom' ? 2 : 1;
        await this.db.updateUserCredits(user.id, refundAmount);
        
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: `❌ 動画生成に失敗いたしました。\n\n💰 ${refundAmount}ポイントを返却いたしました。\n\n少々お待ちいただいてから再度お試しください。`
        });

        await this.db.logInteraction(user.line_id, user.id, 'video_generation_failed', {
          type,
          error: result.error,
          refundAmount
        });
      }
      
    } catch (error) {
      console.error('❌ 异步视频生成失败:', error);
      
      // 切换回主要Rich Menu
      await this.lineBot.switchToMainMenu(user.line_id);
      
      // 出错时退还点数
      const refundAmount = type === 'custom' ? 2 : 1;
      await this.db.updateUserCredits(user.id, refundAmount);
      
      await this.client.pushMessage(user.line_id, {
        type: 'text',
        text: `❌ 動画生成中にエラーが発生いたしました。\n\n💰 ${refundAmount}ポイントを返却いたしました。`
      });
    }
  }

  // 创建动作确认卡片
  createActionConfirmationCard(imageUrl, action, user) {
    const actionInfo = {
      wave: {
        title: '手振り動画生成',
        description: '自然な笑顔で手を振る動画',
        icon: '👋',
        cost: 1
      },
      group: {
        title: '寄り添い動画生成',
        description: '温かい雰囲気の寄り添い動画',
        icon: '🤝',
        cost: 1
      },
      custom: {
        title: 'パーソナライズ動画生成',
        description: 'オリジナルの創作動画',
        icon: '🎨',
        cost: 2
      }
    };

    const info = actionInfo[action];
    if (!info) return null;

    return {
      type: 'flex',
      altText: `${info.title}確認`,
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: imageUrl,
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${info.icon} ${info.title}`,
              weight: 'bold',
              size: 'lg',
              color: '#333333'
            },
            {
              type: 'text',
              text: info.description,
              size: 'sm',
              color: '#666666',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: `消費ポイント:`,
                  size: 'sm',
                  color: '#666666',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `${info.cost}ポイント`,
                  size: 'sm',
                  color: '#FF6B35',
                  weight: 'bold',
                  flex: 1
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: `残りポイント:`,
                  size: 'sm',
                  color: '#666666',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `${user.credits}ポイント`,
                  size: 'sm',
                  color: '#42C76A',
                  weight: 'bold',
                  flex: 1
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: `🎬 生成開始 (${info.cost}ポイント)`,
                data: `action=confirm_${action}_generate&image_url=${encodeURIComponent(imageUrl)}`
              },
              style: 'primary',
              color: '#42C76A'
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '❌ キャンセル',
                data: 'action=cancel'
              },
              style: 'secondary'
            }
          ]
        }
      }
    };
  }

  // 处理挥手动作关键字
  async handleWaveActionKeyword(event, user) {
    // 设置用户状态
    await this.db.setUserState(user.id, 'waiting_wave_photo', { action: 'wave' });
    
    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '👋【手振り動画生成】が選択されました\n\n📸 写真をアップロードしていただければ、すぐに手を振る動画の制作を開始いたします！\n\n✨ 自然な笑顔で手を振る素敵な動画を作成いたします。'
    });

    await this.db.logInteraction(user.line_id, user.id, 'wave_action_selected', {});
  }

  // 处理肩并肩动作关键字
  async handleGroupActionKeyword(event, user) {
    // 设置用户状态
    await this.db.setUserState(user.id, 'waiting_group_photo', { action: 'group' });
    
    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '🤝【寄り添い動画生成】が選択されました\n\n📸 写真をアップロードしていただければ、すぐに寄り添い動画の制作を開始いたします！\n\n💕 温かい雰囲気の素敵な動画を作成いたします。'
    });

    await this.db.logInteraction(user.line_id, user.id, 'group_action_selected', {});
  }

  // 处理个性化动作关键字
  async handleCustomActionKeyword(event, user) {
    // 设置用户状态
    await this.db.setUserState(user.id, 'waiting_custom_photo', { action: 'custom' });
    
    await this.client.replyMessage(event, {
      type: 'text',
      text: '🎨【パーソナライズ動画生成】が選択されました\n\n📸 写真をアップロードしていただければ、すぐにパーソナライズ動画の制作を開始いたします！\n\n💭 その後、ご希望の動画内容をお聞かせください。'
    });

    await this.db.logInteraction(user.line_id, user.id, 'custom_action_selected', {});
  }

  // 处理充值动作关键字
  async handleCreditsActionKeyword(event, user) {
    await this.handleBuyCredits(event, user);
  }

  // 处理分享动作关键字
  async handleShareActionKeyword(event, user) {
    await this.handleShareBot(event, user);
  }

  // 处理状态检查
  async handleStatusCheck(event, user) {
    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '🎬 動画を生成中です...\n\n⏱️ もうしばらくお待ちください。完成次第お送りいたします。'
    });
  }

  // 更新确认卡片样式（白色框风格）
  createActionConfirmationCard(imageUrl, action, user) {
    const actionInfo = {
      wave: {
        title: '手振り動画生成',
        description: '自然な笑顔で手を振る動画',
        icon: '👋',
        cost: 1
      },
      group: {
        title: '寄り添い動画生成',
        description: '温かい雰囲気の寄り添い動画',
        icon: '🤝',
        cost: 1  
      },
      custom: {
        title: 'パーソナライズ動画生成',
        description: 'オリジナルの創作動画',
        icon: '🎨',
        cost: 2
      }
    };

    const info = actionInfo[action];
    if (!info) return null;

    return {
      type: 'flex',
      altText: `${info.title}確認`,
      contents: {
        type: 'bubble',
        styles: {
          body: {
            backgroundColor: '#FFFFFF'
          },
          footer: {
            backgroundColor: '#FFFFFF'
          }
        },
        hero: {
          type: 'image',
          url: imageUrl,
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'text',
              text: '以下の内容で動画を生成します',
              size: 'md',
              color: '#333333',
              weight: 'bold'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  contents: [
                    {
                      type: 'text',
                      text: '選択したテイスト：',
                      size: 'sm',
                      color: '#666666',
                      flex: 5
                    },
                    {
                      type: 'text',
                      text: info.title,
                      size: 'sm',
                      color: '#333333',
                      weight: 'bold',
                      flex: 7
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  contents: [
                    {
                      type: 'text',
                      text: '消費ポイント：',
                      size: 'sm',
                      color: '#666666',
                      flex: 5
                    },
                    {
                      type: 'text',
                      text: `${info.cost}ポイント`,
                      size: 'sm',
                      color: '#FF6B35',
                      weight: 'bold',
                      flex: 7
                    }
                  ]
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '動画を生成する',
                data: `action=confirm_${action}_generate&image_url=${encodeURIComponent(imageUrl)}`
              },
              style: 'primary',
              color: '#42C76A',
              height: 'md'
            }
          ]
        }
      }
    };
  }
}

module.exports = MessageHandler; 