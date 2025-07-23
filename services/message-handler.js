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
            text: '❌ 抱歉，我只能处理文字和图片消息\n请使用底部菜单进行操作'
          });
          break;
      }
    } catch (error) {
      console.error('❌ 处理消息失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 处理消息时发生错误，请稍后再试'
      });
    }
  }

  // 处理文字消息
  async handleTextMessage(event, user) {
    const text = event.message.text;
    
    // 首先检查用户状态
    const userState = await this.db.getUserState(user.id);
    
    if (userState.state === 'waiting_custom_prompt') {
      // 用户正在个性化生成中输入prompt
      await this.handleCustomPromptReceived(event, user, text, userState.data);
      return;
    }
    
    // 处理Rich Menu动作文字
    if (text.startsWith('action=')) {
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
        text: '💡 请使用底部菜单进行操作：\n\n👋 挥手 - 自动生成挥手微笑视频\n🤝 肩并肩 - 多人互相依靠视频\n🎨 个性化 - 输入创意提示词生成'
      });
    }
  }

  // 处理Rich Menu动作文字
  async handleRichMenuAction(event, user, actionText) {
    try {
      // 解析action文字，格式：action=wave_hello
      const action = actionText.replace('action=', '');
      
      console.log('🎯 Rich Menu动作:', action);

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
        text: '❌ 图片处理失败，请稍后再试'
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
}

module.exports = MessageHandler; 