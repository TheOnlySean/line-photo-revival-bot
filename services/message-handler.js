const VideoGenerator = require('./video-generator');
const ImageUploader = require('./image-uploader');
const { openai, TRANSLATION_SYSTEM_PROMPT } = require('../config/openai-config');

class MessageHandler {
  constructor(client, db, lineBot) {
    this.client = client;
    this.db = db;
    this.lineBot = lineBot;
    this.videoGenerator = new VideoGenerator(db, lineBot);
    this.imageUploader = new ImageUploader();
  }

  // 处理用户添加好友事件
  async handleFollow(event) {
    const userId = event.source.userId;
    console.log('👋 新用户添加好友:', userId);

    try {
      // 🔧 修复: 立即清理用户相关的所有状态，防止旧任务干扰
      console.log('🧹 清理用户状态和pending任务...');
      
      // 清理全局pending状态
      if (global.pendingAction && global.pendingAction.userId === userId) {
        console.log('🗑️ 清理用户的全局pending动作');
        global.pendingAction = null;
      }
      
      // 获取用户资料
      const profile = await this.client.getProfile(userId);
      console.log('👤 用户资料:', profile);

      // 创建或更新用户记录
      const user = await this.db.createLineUser(
        userId,
        profile.displayName,
        profile.pictureUrl
      );

      // 🔧 检查是否有待发送的视频（用户重新关注时）
      try {
        console.log('🔍 检查用户是否有待发送的视频...');
        await this.videoGenerator.checkAndSendPendingVideos(userId);
      } catch (pendingError) {
        console.warn('⚠️ 检查待发送视频失败（不影响关注流程）:', pendingError.message);
      }

      // 记录交互日志
      await this.db.logInteraction(userId, user.id, 'follow', {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl
      });

      // 发送欢迎消息和免费试用选项
      console.log('🎁 开始发送欢迎消息和免费试用选项给新用户:', userId);
      await this.lineBot.sendWelcomeMessage(event.replyToken, userId);
      console.log('✅ 欢迎消息发送完成');

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
    console.log('👤 用户信息:', { id: user.id, line_id: user.line_id });
    
    // 調試功能：如果用戶輸入"状態"，顯示當前狀態
    if (text === '状態' || text === 'debug') {
      const userState = await this.db.getUserState(user.id);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: `🔍 調試信息：\n用戶ID: ${user.id}\n當前狀態: ${userState ? userState.state : 'null'}\n狀態數據: ${JSON.stringify(userState?.data || {}, null, 2)}`
      });
      return;
    }
    
    // 首先检查用户状态
    const userState = await this.db.getUserState(user.id);
    console.log('🔍 用户当前状态:', userState);
    
    // 检查用户状态是否存在
    if (userState && userState.state) {
      if (userState.state === 'waiting_custom_prompt_selection') {
        // 用户正在选择提示词设置方式
        console.log('🎯 处理提示词选择状态');
        await this.handleCustomPromptSelection(event, user, text, userState.data);
        return;
      }
      
      if (userState.state === 'waiting_custom_prompt_input') {
        // 用户正在输入个性化生成的初始提示词
        console.log('✏️ 处理自定义提示词输入状态');
        await this.handleCustomPromptInput(event, user, text, userState.data);
        return;
      }
      
      if (userState.state === 'waiting_custom_prompt') {
        // 用户正在个性化生成中输入prompt (旧流程保留)
        await this.handleCustomPromptReceived(event, user, text, userState.data);
        return;
      }
      
      if (userState.state === 'waiting_custom_photo_upload') {
        // 用户在等待照片上传状态下发送文字，检查是否是"Nashi"
        if (text === 'Nashi' || text === '🚫 写真なし' || text.includes('写真なし')) {
          await this.handleCustomVideoGenerationWithoutPhoto(event, user, userState.data);
        } else {
          // 其他文字输入，重新提示选择
          const photoSelectionMessage = this.lineBot.createCustomPhotoUploadQuickReply(
            '❌ 無効な選択です。下記のボタンから選択してください：'
          );
          await this.client.replyMessage(event.replyToken, photoSelectionMessage);
        }
        return;
      }
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
    } else if (text.includes('检查状态') || text.includes('状态检查') || text.includes('チェック') || text.toLowerCase().includes('check')) {
      // 🔧 新增：手动检查视频生成状态
      await this.handleStatusCheck(event, user);
    } else {
      // 默认引导用户使用菜单
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '💡 下部メニューをご利用ください：\n\n👋 手を振る - 自然な手振り動画\n🤝 寄り添う - 温かい寄り添い動画\n🎨 パーソナライズ - オリジナル創作動画\n\n🔍 「检查状态」と送信すると進行中の動画をチェックできます'
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

  // 处理用户选择提示词设置方式
  async handleCustomPromptSelection(event, user, text, stateData) {
    try {
      console.log('🎯 用户选择提示词方式:', text);
      console.log('🔍 用户当前状态数据:', stateData);
      
      if (text === 'RANDOM_PROMPT' || text === '🎲 ランダム') {
        // 用户选择随机生成提示词
        await this.handleRandomPromptGeneration(event, user, stateData);
      } else if (text === 'INPUT_CUSTOM_PROMPT' || text === '✏️ 自分で入力する' || text === '自分で入力する') {
        // 用户选择自定义输入提示词
        await this.handleCustomPromptInputMode(event, user, stateData);
      } else if (text === 'reset' || text === 'リセット') {
        // 用户要求重置状态
        await this.handleResetUserState(event, user);
      } else {
        // 无效选择，重新提示（添加重置选项）
        console.log('❌ 收到无效选择，用户输入:', text);
        const promptSelectionMessage = this.lineBot.createCustomPromptSelectionQuickReply(
          '❌ 無効な選択です。下記からプロンプトの設定方法をお選びください：\n\n💡 問題が続く場合は「リセット」と入力してください'
        );
        await this.client.replyMessage(event.replyToken, promptSelectionMessage);
      }
      
    } catch (error) {
      console.error('❌ 处理提示词选择失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // 处理随机提示词生成
  async handleRandomPromptGeneration(event, user, stateData) {
    try {
      console.log('🎲 生成随机提示词');
      
      // 生成随机提示词
      const randomPrompt = this.generateRandomPrompt();
      console.log('🎲 随机提示词:', randomPrompt);
      
      // 使用OpenAI翻译日语提示词为英语
      const englishPrompt = await this.translatePromptToEnglish(randomPrompt);
      console.log('🌐 翻译结果:', { 
        original: randomPrompt, 
        english: englishPrompt 
      });

      // 设置用户状态为等待照片选择
      await this.db.setUserState(user.id, 'waiting_custom_photo_or_none', { 
        action: 'custom',
        originalPrompt: randomPrompt,
        englishPrompt: englishPrompt,
        isRandom: true
      });
      
      // 设置用户状态为等待照片上传（这样相机/相册选择后能正确处理）
      await this.db.setUserState(user.id, 'waiting_custom_photo_upload', { 
        action: 'custom',
        originalPrompt: randomPrompt,
        englishPrompt: englishPrompt,
        isRandom: true
      });

      // 发送随机提示词和照片选择菜单
      const photoSelectionMessage = this.lineBot.createCustomPhotoUploadQuickReply(
        `🎲 ランダムプロンプトを生成しました：\n「${randomPrompt}」\n\n📸 次に、参考画像をアップロードしてください（オプション）：`
      );

      await this.client.replyMessage(event.replyToken, photoSelectionMessage);

      await this.db.logInteraction(user.line_id, user.id, 'random_prompt_generated', {
        randomPrompt: randomPrompt,
        englishPrompt: englishPrompt
      });

    } catch (error) {
      console.error('❌ 处理随机提示词生成失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ ランダムプロンプトの生成に失敗しました。もう一度お試しください。'
      });
    }
  }

  // 处理切换到自定义输入模式
  async handleCustomPromptInputMode(event, user, stateData) {
    try {
      console.log('✏️ 切换到自定义输入模式');
      console.log('📊 准备设置的状态数据:', stateData);
      
      // 设置用户状态为等待提示词输入
      await this.db.setUserState(user.id, 'waiting_custom_prompt_input', stateData);
      console.log('✅ 用户状态已设置为 waiting_custom_prompt_input');
      
      // 验证状态设置是否成功
      const verifyState = await this.db.getUserState(user.id);
      console.log('🔍 验证设置的状态:', verifyState);
      
      // 发送输入提示消息（隐藏Rich Menu，让用户更方便输入）
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✏️ プロンプト（提示詞）を入力してください。\n\n📝 例：\n・「海辺で楽しく走る」\n・「カフェで本を読む」\n・「花園で散歩する」\n・「笑顔で手を振る」\n\n💡 入力後、参考画像のアップロード選択に進みます。'
      });

      await this.db.logInteraction(user.line_id, user.id, 'custom_input_mode_selected', {
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ 处理自定义输入模式失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // 处理来自postback的自定义输入提示词选择
  async handleInputCustomPromptPostback(event, user) {
    try {
      console.log('✏️ 处理postback: 用户选择自定义输入提示词');
      
      // 获取用户当前状态
      const userState = await this.db.getUserState(user.id);
      console.log('🔍 当前用户状态:', userState);
      
      // 确保传递 action: 'custom' 给处理函数
      const stateData = {
        ...(userState?.data || {}),
        action: 'custom'
      };
      
      console.log('🎯 传递给处理函数的状态数据:', stateData);
      
      // 调用相同的处理逻辑
      await this.handleCustomPromptInputMode(event, user, stateData);

    } catch (error) {
      console.error('❌ 处理自定义输入postback失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // 处理来自postback的随机prompt选择
  async handleRandomPromptPostback(event, user) {
    try {
      console.log('🎲 处理postback: 用户选择随机生成提示词');
      
      // 获取用户当前状态
      const userState = await this.db.getUserState(user.id);
      console.log('🔍 当前用户状态:', userState);
      
      // 检查用户是否在等待提示词选择状态
      if (userState && userState.state === 'waiting_custom_prompt_selection') {
        // 生成随机提示词
        const randomPrompt = this.generateRandomPrompt();
        console.log('🎲 生成的随机提示词:', randomPrompt);
        
        // 模擬用戶發送這個 prompt，創建一個模擬的 event
        const simulatedEvent = {
          type: 'message',
          message: {
            type: 'text',
            text: randomPrompt
          },
          replyToken: event.replyToken,
          source: event.source
        };
        
        // 直接調用 prompt 輸入處理邏輯
        await this.handleCustomPromptInput(simulatedEvent, user, randomPrompt, userState.data);
        
      } else {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 現在はプロンプト選択を待機していません。パーソナライズ生成を最初からやり直してください。'
        });
      }

    } catch (error) {
      console.error('❌ 处理随机prompt postback失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // 处理来自postback的无照片选择
  async handleNoPhotoPostback(event, user) {
    try {
      console.log('🚫 处理postback: 用户选择无照片生成');
      
      // 获取用户当前状态
      const userState = await this.db.getUserState(user.id);
      console.log('🔍 当前用户状态:', userState);
      
      // 检查用户是否在等待照片上传状态
      if (userState && userState.state === 'waiting_custom_photo_upload') {
        await this.handleCustomVideoGenerationWithoutPhoto(event, user, userState.data);
      } else {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 現在は写真のアップロードを待機していません。パーソナライズ生成を最初からやり直してください。'
        });
      }

    } catch (error) {
      console.error('❌ 处理无照片postback失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // 处理用户状态重置
  async handleResetUserState(event, user) {
    try {
      console.log('🔄 重置用户状态');
      
      // 清除用户状态
      await this.db.clearUserState(user.id);
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✅ 状態をリセットしました。\n\n🎨 パーソナライズ生成を再開するには、Rich Menuから「個性化」を選択してください。'
      });

      await this.db.logInteraction(user.line_id, user.id, 'user_state_reset', {
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ 重置用户状态失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 状態のリセットに失敗しました。もう一度お試しください。'
      });
    }
  }

  // 生成随机提示词
  generateRandomPrompt() {
    const randomPrompts = [
      '海辺で楽しく走る',
      'カフェで本を読む',
      '花園で散歩する',
      '笑顔で手を振る',
      '公園でピクニックを楽しむ',
      '夕日を見つめる',
      '雨の中を歩く',
      '桜の下で踊る',
      '街角でコーヒーを飲む',
      '図書館で勉強する',
      '森の中を散策する',
      'ビーチでヨガをする',
      '料理を作る',
      '音楽を聴いて踊る',
      '山頂で景色を眺める',
      '友達と笑い合う',
      '猫と遊ぶ',
      '星空を見上げる',
      '写真を撮る',
      'お茶を飲んでリラックスする'
    ];
    
    const randomIndex = Math.floor(Math.random() * randomPrompts.length);
    return randomPrompts[randomIndex];
  }

  // 处理用户输入的个性化提示词（新流程）
  async handleCustomPromptInput(event, user, customPrompt, stateData) {
    try {
      console.log('🎨 收到用户输入的提示词:', customPrompt);
      
      // 使用OpenAI翻译日语提示词为英语
      const englishPrompt = await this.translatePromptToEnglish(customPrompt);
      console.log('🌐 翻译结果:', { 
        original: customPrompt, 
        english: englishPrompt 
      });

      // 设置用户状态为等待照片上传（这样相机/相册选择后能正确处理）
      await this.db.setUserState(user.id, 'waiting_custom_photo_upload', { 
        action: 'custom',
        originalPrompt: customPrompt,
        englishPrompt: englishPrompt
      });
      
      // 发送照片上传选择消息，使用新的快捷回复菜单
      const photoSelectionMessage = this.lineBot.createCustomPhotoUploadQuickReply(
        `💭 プロンプトを受信しました：\n「${customPrompt}」\n\n📸 次に、参考画像をアップロードしてください（オプション）：`
      );

      await this.client.replyMessage(event.replyToken, photoSelectionMessage);

      await this.db.logInteraction(user.line_id, user.id, 'custom_prompt_input_received', {
        originalPrompt: customPrompt,
        englishPrompt: englishPrompt
      });

    } catch (error) {
      console.error('❌ 处理提示词输入失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ プロンプトの処理に失敗しました。もう一度お試しください。'
      });
    }
  }

  // 处理用户选择照片上传或无照片
  async handleCustomPhotoChoice(event, user, text, stateData) {
    try {
      console.log('📷 用户照片选择:', text);
      
      if (text === 'Nashi' || text === '🚫 写真なし' || text.includes('写真なし')) {
        // 用户选择不上传照片，直接生成视频
        await this.handleCustomVideoGenerationWithoutPhoto(event, user, stateData);
      } else {
        // 对于其他输入（包括相机和相册选择后的文字），重新提示选择
        // 注意：相机和相册选择会直接触发图片上传，不会到达这里
        const photoSelectionMessage = this.lineBot.createCustomPhotoUploadQuickReply(
          '❌ 無効な選択です。下記のボタンから選択してください：'
        );
        await this.client.replyMessage(event.replyToken, photoSelectionMessage);
      }
      
    } catch (error) {
      console.error('❌ 处理照片选择失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // 处理无照片的个性化视频生成
  async handleCustomVideoGenerationWithoutPhoto(event, user, stateData) {
    try {
      console.log('🎬 开始无照片的个性化视频生成');
      
      const { originalPrompt, englishPrompt } = stateData;
      
      // 检查点数
      if (user.credits < 2) {
        await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 2);
        return;
      }

      // 先发送生成开始消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: `🎬 「${originalPrompt}」の動画生成を開始いたします！\n\n⏱️ 参考画像なしでの生成のため、プロンプトの内容に基づいて動画を作成いたします。\n\n生成には約30-60秒かかります。完成次第お送りいたします。\n\n💡 下部の「生成中...」メニューで進捗をご確認いただけます。`
      });
      
      // 然后切换到处理中Rich Menu（不再重复发送消息）
      await this.lineBot.switchToProcessingMenuSilent(user.line_id);

      // 扣除点数
      await this.db.updateUserCredits(user.id, -2);
      
      // 清除用户状态
      await this.db.clearUserState(user.id);

      // 异步开始视频生成（无照片）
      await this.startVideoGenerationWithoutPhoto(user, englishPrompt, originalPrompt);
      
    } catch (error) {
      console.error('❌ 无照片视频生成失败:', error);
      
      // 切换回主菜单
      try {
        await this.lineBot.switchToMainMenu(user.line_id);
      } catch (menuError) {
        console.warn('⚠️ 切换菜单失败:', menuError.message);
      }
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 動画生成の開始に失敗しました。しばらくしてから再度お試しください。'
      });
    }
  }

  // 处理个性化生成中用户输入的自定义prompt（增强版）
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

      // 🔧 将日语prompt转换为英语（适合Runway模型）- 混合翻译
      const englishPrompt = await this.translatePromptToEnglish(customPrompt);
      console.log('🌐 混合翻译结果:', { 
        original: customPrompt, 
        english: englishPrompt 
      });

      // 创建个性化确认卡片（显示日语，但内部使用英语）
      const confirmCard = this.lineBot.createCustomVideoConfirmCard(
        imageUrl, 
        englishPrompt,  // 传递英语prompt给API
        2,
        customPrompt    // 显示原始日语给用户
      );

      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text', 
          text: `🎨 您的创意内容：\n「${customPrompt}」\n\n✨ 即将为您生成独特的AI视频！`
        },
        confirmCard
      ]);

      // 清除用户状态
      await this.db.clearUserState(user.id);

      await this.db.logInteraction(user.line_id, user.id, 'custom_prompt_received', {
        originalPrompt: customPrompt,
        englishPrompt: englishPrompt,
        imageUrl: imageUrl
      });

    } catch (error) {
      console.error('❌ 处理自定义prompt失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 处理失败，请重新尝试'
      });
    }
  }





  // 处理图片消息
  async handleImageMessage(event, user) {
    try {
      // 获取用户当前状态
      const userState = await this.db.getUserState(user.id);

      // 下载并上传图片（增强错误处理）
      console.log('📥 开始下载Line图片:', event.message.id);
      const imageStream = await this.client.getMessageContent(event.message.id);
      
      // 将stream转换为buffer
      const chunks = [];
      for await (const chunk of imageStream) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);
      
      console.log('📊 下载的图片大小:', imageBuffer.length, 'bytes');
      
      // 验证图片buffer是否有效
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('图片下载失败：获取到空的图片数据');
      }
      
      // 验证图片格式
      if (!this.imageUploader.isValidImageFormat(imageBuffer)) {
        throw new Error('不支持的图片格式，请上传JPG或PNG格式的图片');
      }
      
      const imageUrl = await this.imageUploader.uploadImage(imageBuffer);

      console.log('🖼️ 用户状态:', userState.state, '图片URL:', imageUrl);

      // 检查用户状态，确定要执行哪个照片处理流程
      switch (userState.state) {
        case 'waiting_wave_photo':
          await this.handlePhotoUploadForAction(event, user, imageUrl, 'wave');
          break;
        case 'waiting_group_photo':
          await this.handlePhotoUploadForAction(event, user, imageUrl, 'group');
          break;
        case 'waiting_custom_photo':
          await this.handlePhotoUploadForAction(event, user, imageUrl, 'custom');
          break;
        case 'waiting_custom_photo_upload':
          // 新的个性化生成流程：用户已输入提示词，现在上传照片
          await this.handleCustomPhotoUpload(event, user, imageUrl, userState.data);
          break;
        default:
          // 如果没有明确状态，但用户发送了图片，可以提供一个通用的选择
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

  /**
   * 统一处理所有需要上传照片的动作
   * @param {object} event - LINE webhook event
   * @param {object} user - 用户信息
   * @param {string} imageUrl - 上传后的图片URL
   * @param {string} action - 动作类型 ('wave', 'group', 'custom')
   */
  async handlePhotoUploadForAction(event, user, imageUrl, action) {
    try {
      console.log(`📸 收到 ${action} 类型的照片:`, imageUrl);

      // 检查点数是否足够
      const requiredCredits = action === 'custom' ? 2 : 1;
      if (user.credits < requiredCredits) {
        await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, requiredCredits);
        return;
      }

      // 生成白色确认卡片
      const confirmationCard = this.createActionConfirmationCard(imageUrl, action, user);

      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '📸 写真を受信しました！\n\n以下の内容で動画を生成しますか？'
        },
        confirmationCard
      ]);

      // 清除用户之前的状态，防止重复触发
      await this.db.clearUserState(user.id);

    } catch (error) {
      console.error(`❌ 处理 ${action} 照片失败:`, error);
      throw error; // 向上层抛出错误，由 handleImageMessage 统一处理回复
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

      // 🔧 修复: 使用await替代setTimeout，避免异步任务泄漏
      console.log('⏳ 等待3秒模拟处理时间...');
      await this.sleep(3000);
      
      try {
        console.log('📤 发送演示视频给用户:', user.line_id);
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
        console.log('✅ 演示视频发送成功');

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

      // 立即切换到处理中Rich Menu，提供即时视觉反馈
      console.log('🔄 立即切换到处理中菜单...');
      await this.lineBot.switchToProcessingMenu(user.line_id);
      
      // 发送处理中消息
      console.log('📤 发送处理中消息...');
      await this.lineBot.sendProcessingMessage(event.replyToken);

      // 扣除点数
      console.log('💰 扣除点数: 1');
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
      console.log('👤 新用户检测到，开始创建:', lineUserId);
      try {
        const profile = await this.client.getProfile(lineUserId);
        user = await this.db.createLineUser(
          lineUserId,
          profile.displayName,
          profile.pictureUrl
        );
        console.log('✅ 新用户创建成功:', user.id);
      } catch (error) {
        console.error('❌ 创建用户失败:', error);
        // 创建基础用户记录
        user = await this.db.createLineUser(lineUserId, 'LINE用户', null);
      }
      
      // 为新用户自动绑定Rich Menu
      try {
        console.log('🎨 为新用户设置Rich Menu...');
        await this.lineBot.ensureUserHasRichMenu(lineUserId);
      } catch (menuError) {
        console.error('⚠️ 设置Rich Menu失败，但不影响主要功能:', menuError.message);
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
      console.log('🚀 开始预设视频生成确认:', data);
      
      const imageUrl = decodeURIComponent(data.image_url);
      const prompt = decodeURIComponent(data.prompt);
      const creditsNeeded = parseInt(data.credits);
      
      // 再次检查用户点数
      if (user.credits < creditsNeeded) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: `❌ ポイントが不足しています。${creditsNeeded}ポイントが必要です`
        });
        return;
      }

      // 先发送处理中消息
      console.log('📤 发送处理中消息...');
      await this.lineBot.sendProcessingMessage(event.replyToken);
      
      // 然后切换到处理中Rich Menu（静默模式）
      console.log('🔄 切换到处理中菜单...');
      await this.lineBot.switchToProcessingMenuSilent(user.line_id);
      
      // 扣除点数
      console.log('💰 扣除点数:', creditsNeeded);
      await this.db.updateUserCredits(user.id, -creditsNeeded);
      
      // 异步开始视频生成（await确保任务启动）
      console.log('🎬 开始视频生成流程...');
      await this.startVideoGenerationWithPrompt(user, imageUrl, prompt, creditsNeeded);

      await this.db.logInteraction(user.line_user_id, user.id, 'preset_video_generation_started', {
        imageUrl: imageUrl,
        prompt: prompt,
        creditsUsed: creditsNeeded
      });
      
      console.log('✅ 预设视频生成确认处理完成');

    } catch (error) {
      console.error('❌ 处理预设生成确认失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 動画生成中にエラーが発生しました。しばらくしてから再度お試しください'
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

      // 先发送处理中消息
      console.log('📤 发送处理中消息...');
      await this.lineBot.sendProcessingMessage(event.replyToken);
      
      // 然后切换到处理中Rich Menu（静默模式）
      console.log('🔄 切换到处理中菜单...');
      await this.lineBot.switchToProcessingMenuSilent(user.line_id);
      
      // 扣除点数
      console.log('💰 扣除点数:', creditsNeeded);
      await this.db.updateUserCredits(user.id, -creditsNeeded);
      
      // 异步开始视频生成（await确保任务启动）
      await this.startVideoGenerationWithPrompt(user, imageUrl, customPrompt, creditsNeeded);

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
    const wavePrompt = "smile and wave hand";
    
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
    const groupPrompt = "Rely on each other";
    
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

  // 处理新流程中的照片上传（已有提示词）
  async handleCustomPhotoUpload(event, user, imageUrl, stateData) {
    try {
      console.log('📸 新流程照片上传:', imageUrl);
      
      const { originalPrompt, englishPrompt } = stateData;
      
      // 检查点数
      if (user.credits < 2) {
        await this.sendInsufficientCreditsMessage(event.replyToken, user.credits, 2);
        return;
      }

      // 先发送生成开始消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: `🎬 「${originalPrompt}」の動画生成を開始いたします！\n\n📸 アップロードいただいた画像を参考に動画を作成いたします。\n\n⏱️ 生成には約30-60秒かかります。完成次第お送りいたします。\n\n💡 下部の「生成中...」メニューで進捗をご確認いただけます。`
      });
      
      // 然后切换到处理中Rich Menu（不再重复发送消息）
      await this.lineBot.switchToProcessingMenuSilent(user.line_id);

      // 扣除点数
      await this.db.updateUserCredits(user.id, -2);
      
      // 清除用户状态
      await this.db.clearUserState(user.id);

      // 异步开始视频生成（有照片）
      await this.startVideoGenerationWithPrompt(user, imageUrl, englishPrompt, 2, originalPrompt);
      
    } catch (error) {
      console.error('❌ 处理新流程照片上传失败:', error);
      
      // 切换回主菜单
      try {
        await this.lineBot.switchToMainMenu(user.line_id);
      } catch (menuError) {
        console.warn('⚠️ 切换菜单失败:', menuError.message);
      }
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 動画生成の開始に失敗しました。しばらくしてから再度お試しください。'
      });
    }
  }

  // 开始无照片的视频生成
  async startVideoGenerationWithoutPhoto(user, englishPrompt, originalPrompt) {
    try {
      console.log('🎬 开始无照片视频生成:', { englishPrompt, originalPrompt });

      // 创建视频记录
      const videoRecord = await this.db.createVideoGeneration(
        user.id,
        englishPrompt,  // 英语prompt
        false,          // is_demo
        2               // creditsUsed
      );
      console.log('✅ 视频记录已创建:', videoRecord.id);

      // 调用视频生成器（无照片模式）
      await this.videoGenerator.generateVideoWithoutPhoto(
        user.line_id, 
        videoRecord.id, 
        englishPrompt
      );

      console.log('✅ 无照片视频生成任务已提交，轮询机制将自动处理');

    } catch (error) {
      console.error('❌ 无照片视频生成失败:', error);
      
      // 切换回主菜单
      try {
        await this.lineBot.switchToMainMenu(user.line_id);
      } catch (menuError) {
        console.warn('⚠️ 切换菜单失败:', menuError.message);
      }
      
      // 发送错误消息
      try {
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: '❌ 動画生成に失敗しました。しばらくしてから再度お試しください。\n\n💡 ポイントは返却されました。'
        });
        
        // 退还点数
        await this.db.updateUserCredits(user.id, 2);
        
      } catch (sendError) {
        console.error('❌ 发送错误消息失败:', sendError.message);
      }
    }
  }

  // 使用指定prompt开始视频生成（修复版）
  async startVideoGenerationWithPrompt(user, imageUrl, prompt, creditsUsed, originalPrompt = null) {
    try {
      console.log('🎬 开始使用自定义prompt生成视频:', { prompt, creditsUsed });

      // 🔧 先创建视频记录
      const videoRecord = await this.db.createVideoGeneration(
        user.id,
        prompt,  // 英语prompt，已经翻译过
        false,   // is_demo
        creditsUsed
      );
      console.log('✅ 视频记录已创建:', videoRecord.id);

      // 🔧 调用修改后的generateVideo方法（传递prompt参数）
      await this.videoGenerator.generateVideo(
        user.line_id, 
        imageUrl, 
        videoRecord.id, 
        prompt  // 传递英语prompt给KIE.AI
      );

      console.log('✅ 自定义视频生成任务已提交，轮询机制将自动处理');

    } catch (error) {
      console.error('❌ 自定义prompt视频生成失败:', error);
      
      // 切换回主菜单
      try {
        await this.lineBot.switchToMainMenu(user.line_id);
      } catch (menuError) {
        console.warn('⚠️ 切换菜单失败:', menuError.message);
      }
      
      // 发送错误消息
      try {
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: '❌ 视频生成失败，请稍后重试\n\n💡 您的点数已保留，未被扣除'
        });
      } catch (sendError) {
        console.error('❌ 发送错误消息失败:', sendError.message);
      }
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
  async handleGenerateVideo(event, user) {
    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📸 请上传您的照片\n\n💡 建议：\n• 清晰的人物照片\n• 正面或侧面肖像\n• 光线充足\n• 建议尺寸：512x512或以上'
    });
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
    const startTime = Date.now(); // 性能監控開始
    const userId = event.source.userId;
    
    try {
      // 獲取用戶信息
      const user = await this.ensureUserExists(userId);
      
      const data = this.parsePostbackData(event.postback.data);
      console.log('📨 Postback接收:', data);

      switch (data.action) {
        case 'wave':
          await this.handleRichMenuWaveAction(event, user);
          break;

        case 'group':
          await this.handleRichMenuGroupAction(event, user);
          break;

        case 'custom':
          await this.handleRichMenuCustomAction(event, user);
          break;

        case 'credits':
          await this.handleRichMenuCreditsAction(event, user);
          break;

        case 'share':
          await this.handleRichMenuShareAction(event, user);
          break;

        case 'status_check':
          await this.handleStatusCheck(event, user);
          break;

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

        case 'free_trial':
          await this.handleFreeTrialGenerate(event, user, data);
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

        case 'confirm_wave_generate':
          await this.handleConfirmWaveGenerate(event, user, data);
          break;

        case 'confirm_group_generate':
          await this.handleConfirmGroupGenerate(event, user, data);
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

        case 'INPUT_CUSTOM_PROMPT':
          // 处理用户选择自定义输入提示词
          await this.handleInputCustomPromptPostback(event, user);
          break;

        case 'RANDOM_PROMPT':
          // 处理用户选择随机生成提示词
          await this.handleRandomPromptPostback(event, user);
          break;

        case 'NO_PHOTO':
          // 处理用户选择无照片生成
          await this.handleNoPhotoPostback(event, user);
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

    console.log(`📊 Postback处理时间: ${Date.now() - startTime}ms`); // 性能監控結束
  }

  // 处理挥手生成确认（URI流程）
  async handleConfirmWaveGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 检查点数
      if (user.credits < 1) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '�� ポイントが不足しています。\n\n現在のポイント: 0\n必要なポイント: 1\n\n🌐 ポイント購入は公式サイトをご確認ください。'
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

      // 异步生成视频（必须await确保任务启动）
      await this.generateVideoAsync(user, imageUrl, 'wave');
      
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

      // 异步生成视频（必须await确保任务启动）
      await this.generateVideoAsync(user, imageUrl, 'group');
      
    } catch (error) {
      console.error('❌ 处理肩并肩生成确认失败:', error);
      throw error;
    }
  }



  // 异步生成视频
  async generateVideoAsync(user, imageUrl, type) {
    try {
      console.log('🎬 开始异步生成视频:', type, imageUrl);

      // 数据库健康检查
      console.log('🏥 执行数据库健康检查...');
      const healthCheck = await this.db.healthCheck();
      if (!healthCheck.healthy) {
        throw new Error(`数据库连接异常: ${healthCheck.error}`);
      }
      
      if (healthCheck.duration > 3000) {
        console.warn('⚠️ 数据库响应缓慢，可能影响性能:', { duration: healthCheck.duration });
      }
      
      const prompts = {
        wave: 'smile and wave hand',
        group: 'Rely on each other'
      };
      
      const prompt = prompts[type] || prompts.wave;
      let videoRecord = null;
      
      try {
        // 步骤1: 创建视频生成记录
        console.log('📝 步骤1: 创建视频记录...');
        videoRecord = await this.db.createVideoGeneration(
          user.id,
          prompt,
          false,
          type === 'custom' ? 2 : 1
        );
        console.log('✅ 视频记录已创建:', videoRecord.id);
        
        // 步骤2: 提交视频生成任务（传递自定义prompt）  
        console.log('📝 步骤2: 提交视频生成任务...', { type, prompt });
        await this.videoGenerator.generateVideo(user.line_id, imageUrl, videoRecord.id, prompt);
        console.log('✅ 视频生成任务已提交，轮询机制将自动处理完成后的发送');
        
        // 步骤3: 记录任务启动（非关键操作，失败不影响主流程）
        try {
          await this.db.logInteraction(user.line_id, user.id, 'video_generation_started', {
            type,
            imageUrl,
            videoRecordId: videoRecord.id
          });
          console.log('✅ 任务启动记录已保存');
        } catch (logError) {
          console.warn('⚠️ 记录任务启动失败（不影响主流程）:', logError.message);
        }
        
      } catch (dbError) {
        console.error('❌ 视频生成流程中的数据库操作失败:', dbError);
        
        // 如果视频记录创建失败，直接抛出错误
        if (!videoRecord) {
          throw new Error('数据库连接失败，无法创建视频记录');
        }
        
        // 如果视频生成API调用失败，更新记录状态为失败
        try {
          await this.db.updateVideoGeneration(videoRecord.id, {
            status: 'failed',
            error_message: dbError.message
          });
        } catch (updateError) {
          console.error('❌ 更新视频记录失败状态也失败:', updateError.message);
        }
        
        throw dbError;
      }
      
    } catch (error) {
      console.error('❌ 视频生成任务提交失败:', error);
      
      // 切换回主要Rich Menu
      await this.lineBot.switchToMainMenu(user.line_id);
      
      // 出错时退还点数
      const refundAmount = type === 'custom' ? 2 : 1;
      await this.db.updateUserCredits(user.id, refundAmount);
      
      await this.client.pushMessage(user.line_id, {
        type: 'text',
        text: `❌ 動画生成の開始に失敗いたしました。\n\n💰 ${refundAmount}ポイントを返却いたしました。\n\n再度お試しください。`
      });
      
      await this.db.logInteraction(user.line_id, user.id, 'video_generation_start_failed', {
        type,
        error: error.message,
        refundAmount
      });
    }
  }

  // 创建动作确认卡片
  createActionConfirmationCard(imageUrl, action, user) {
    const actionInfo = {
      wave: {
        title: '手振り動画生成',
        description: '選択したテイスト: 人物',
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
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FFFFFF',
          cornerRadius: 'lg',
          paddingAll: 'xl',
          contents: [
            {
              type: 'text',
              text: '以下の内容で動画を生成します',
              weight: 'bold',
              size: 'md',
              color: '#333333',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '選択したテイスト',
                      color: '#aaaaaa',
                      size: 'sm',
                      flex: 5
                    },
                    {
                      type: 'text',
                      text: '人物',
                      wrap: true,
                      color: '#666666',
                      size: 'sm',
                      flex: 5
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '動画のお題',
                      color: '#aaaaaa',
                      size: 'sm',
                      flex: 5
                    },
                    {
                      type: 'text',
                      text: '手振り動画',
                      wrap: true,
                      color: '#666666',
                      size: 'sm',
                      flex: 5
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
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#42C76A',
              height: 'sm',
              action: {
                type: 'postback',
                label: '動画を生成する',
                data: `action=confirm_${action}_generate&image_url=${encodeURIComponent(imageUrl)}`
              }
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
    // 检查用户点数
    if (user.credits < 2) {
      const insufficientCard = this.lineBot.createInsufficientCreditsCard(user.credits, 2);
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '💸 パーソナライズ生成には2ポイントが必要です。ポイントが不足しています。'
        },
        insufficientCard
      ]);
      return;
    }
    
    // 设置用户状态为等待提示词选择
    await this.db.setUserState(user.id, 'waiting_custom_prompt_selection', { action: 'custom' });
    
    // 发送个性化生成说明消息和提示词选择菜单
    const promptSelectionMessage = this.lineBot.createCustomPromptSelectionQuickReply(
      '🎨【パーソナライズ動画生成】について\n\n💭 パーソナライズ生成とは、プロンプト（提示詞）を設定し、参考画像をアップロード（オプション）して動画を生成する機能です。\n\n📝 プロンプトの質によってAIが完全に内容を実現できない場合があります。この点をご理解ください。\n\n✅ 下記からプロンプトの設定方法をお選びください：'
    );
    
    await this.client.replyMessage(event.replyToken, promptSelectionMessage);

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

  // 处理状态检查（🔧 升级为实际检查功能）
  async handleStatusCheck(event, user) {
    try {
      console.log('🔍 用户请求检查状态:', user.line_id);
      
      // 发送检查中提示
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🔍 正在检查您的视频生成状态，请稍候...'
      });
      
      // 调用VideoGenerator的状态检查方法
      const result = await this.videoGenerator.checkPendingTasks(user.line_id);
      
      if (result.success && !result.found) {
        // 没有待完成任务
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: '📊 暂无进行中的视频生成任务\n\n💡 您可以通过下方菜单开始新的视频生成：\n👋 手を振る - 自然な手振り動画\n🤝 寄り添う - 温かい寄り添い動画\n🎨 パーソナライズ - オリジナル創作動画'
        });
      } else if (!result.success) {
        // 检查失败
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: '❌ 状态检查失败，请稍后再试\n\n💡 如果问题持续，请重新开始生成'
        });
      }
      // 如果有待完成任务，VideoGenerator.checkPendingTasks已经处理了发送
      
    } catch (error) {
      console.error('❌ 处理状态检查请求失败:', error.message);
      
      try {
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: '❌ 系统繁忙，请稍后再试检查状态\n\n🔄 您也可以重新开始生成'
        });
      } catch (sendError) {
        console.error('❌ 发送错误消息失败:', sendError.message);
      }
    }
  }

  // 更新确认卡片样式（白色框风格）
  createActionConfirmationCard(imageUrl, action, user) {
    const actionInfo = {
      wave: {
        title: '手振り動画生成',
        description: '選択したテイスト: 人物',
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
                      text: '動画のお題: ',
                      size: 'sm',
                      color: '#666666',
                      flex: 5
                    },
                    {
                      type: 'text',
                      text: info.description,
                      size: 'sm',
                      color: '#333333',
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

  // ==== Rich Menu Postback动作处理器 ====
  
  // 处理Rich Menu手振り动作
  async handleRichMenuWaveAction(event, user) {
    try {
      // 立即發送回復 - 最高優先級
      const quickReplyMessage = this.lineBot.createPhotoUploadQuickReply(
        '👋【手振り動画生成】\n\n✨ 自然な笑顔で手を振る素敵な動画を作成いたします。\n\n📸 下記のボタンから写真をアップロードしてください：'
      );
      
      await this.client.replyMessage(event.replyToken, quickReplyMessage);
      
      // 異步設置用戶狀態 - 不阻塞回復
      const userId = user?.id; // 安全獲取用戶ID
      if (userId) {
        setImmediate(async () => {
          try {
            await this.db.setUserState(userId, 'waiting_wave_photo', { action: 'wave' });
          } catch (dbError) {
            console.error('❌ 異步數據庫操作失敗:', dbError.message);
          }
        });
      } else {
        console.error('❌ 用戶ID未定義，跳過狀態設置');
      }
      
    } catch (error) {
      console.error('❌ Wave处理错误:', error.message);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }
  
  // 处理Rich Menu寄り添い动作
  async handleRichMenuGroupAction(event, user) {
    try {
      // 立即發送回復 - 最高優先級
      const quickReplyMessage = this.lineBot.createPhotoUploadQuickReply(
        '🤝【寄り添い動画生成】\n\n💕 温かい雰囲気の素敵な動画を作成いたします。\n\n📸 下記のボタンから写真をアップロードしてください：'
      );
      
      await this.client.replyMessage(event.replyToken, quickReplyMessage);
      
      // 異步設置用戶狀態 - 不阻塞回復
      const userId = user?.id; // 安全獲取用戶ID
      if (userId) {
        setImmediate(async () => {
          try {
            await this.db.setUserState(userId, 'waiting_group_photo', { action: 'group' });
          } catch (dbError) {
            console.error('❌ 異步數據庫操作失敗:', dbError.message);
          }
        });
      } else {
        console.error('❌ 用戶ID未定義，跳過狀態設置');
      }
      
    } catch (error) {
      console.error('❌ Group处理错误:', error.message);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }
  
  // 处理Rich Menu个性化动作
  async handleRichMenuCustomAction(event, user) {
    try {
      console.log('🎨 處理個性化動作，用戶信息:', { id: user.id, credits: user.credits });
      
      // 暫時跳過點數檢查，直接進入流程
      // 立即發送回復 - 最高優先級
      const promptSelectionMessage = this.lineBot.createCustomPromptSelectionQuickReply(
        '🎨【パーソナライズ動画生成】について\n\n💭 パーソナライズ生成とは、プロンプト（提示詞）を設定し、参考画像をアップロード（オプション）して動画を生成する機能です。\n\n📝 プロンプトの質によってAIが完全に内容を実現できない場合があります。この点をご理解ください。\n\n✅ 下記からプロンプトの設定方法をお選びください：'
      );
      
      await this.client.replyMessage(event.replyToken, promptSelectionMessage);
      
      // 異步處理數據庫操作 - 不阻塞回復
      const userId = user?.id; // 安全獲取用戶ID
      if (userId) {
        setImmediate(async () => {
          try {
            await this.db.setUserState(userId, 'waiting_custom_prompt_selection', { action: 'custom' });
          } catch (dbError) {
            console.error('❌ 異步數據庫操作失敗:', dbError.message);
          }
        });
      } else {
        console.error('❌ 用戶ID未定義，跳過狀態設置');
      }
      
    } catch (error) {
      console.error('❌ Custom处理错误:', error.message);
      console.error('❌ 完整錯誤:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }
  
  // 处理Rich Menu充值动作
  async handleRichMenuCreditsAction(event, user) {
    try {
      console.log('💎 Rich Menu: 充值动作被点击');
      
      // 生成支付頁面 URL，包含用戶 ID
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'https://line-photo-revival-bot.vercel.app';
      const paymentUrl = `${baseUrl}/payment.html?userId=${user.line_user_id}`;
      
      // 直接發送帶有支付頁面鏈接的簡潔消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: `💎 料金プランページを開いています...\n\n現在のポイント: ${user.credits}ポイント\n\n下記のリンクから料金プランをお選びください：\n${paymentUrl}`
      });
      
      // 记录交互
      await this.db.logInteraction(event.source.userId, user.id, 'rich_menu_credits_action', {
        currentCredits: user.credits,
        paymentUrl: paymentUrl,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Rich Menu Credits动作处理错误:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }
  
  // 处理Rich Menu分享动作
  async handleRichMenuShareAction(event, user) {
    try {
      console.log('🎁 Rich Menu: 分享动作被点击');
      
      // 机器人主动发送分享信息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎁 写真復活サービスを友達にシェアしていただき、ありがとうございます！\n\n✨ より多くの方に素敵な動画体験をお届けします。'
      });
      
      // 记录交互
      await this.db.logInteraction(event.source.userId, user.id, 'rich_menu_share_action', {
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Rich Menu Share动作处理错误:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }

  // 处理免费试用生成（恢复Processing Menu + 延迟体验）
  async handleFreeTrialGenerate(event, user, data) {
    try {
      const photoId = data.photo_id;
      console.log('🎁 用户开始免费试用:', { userId: user.id, photoId });
      
      // 获取试用照片配置
      const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');
      const selectedPhoto = trialPhotos.find(photo => photo.id === photoId);
      const photoDetails = trialPhotoDetails[photoId];
      
      if (!selectedPhoto) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 選択された写真が見つかりません。もう一度お選びください。'
        });
        return;
      }

      // 步骤1: 立即切换到Processing Menu
      console.log('🔄 切换到处理中菜单...');
      await this.lineBot.switchToProcessingMenu(user.line_id);
      
      // 步骤2: 发送"生成中"消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: `🎬 ${photoDetails.title}の無料体験を開始いたします！\n\n⏳ 生成中...下部の「生成中...」メニューで進捗をご確認いただけます。`
      });
      
      console.log('✅ Processing状态已设置，开始简化生成流程...');
      
      // 步骤3: 简化的生成过程（10秒等待）
      await this.simpleTrialGeneration(user, selectedPhoto, photoDetails);

    } catch (error) {
      console.error('❌ 处理免费试用失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 無料体験の開始に失敗しました。しばらくお待ちいただいてから再度お試しください。'
      });
    }
  }

  // 简化的试用生成过程（只做核心功能）
  async simpleTrialGeneration(user, selectedPhoto, photoDetails) {
    try {
      console.log('⏰ 开始10秒简化生成过程...');
      
      // 等待10秒（用户期望的体验）
      await this.sleep(10000);
      
      // 发送完成视频
      console.log('📤 发送完成视频...');
      await this.client.pushMessage(user.line_id, [
        {
          type: 'text',
          text: `🎉 ${photoDetails.title}の無料体験動画が完成いたしました！`
        },
        {
          type: 'video',
          originalContentUrl: selectedPhoto.demo_video_url,
          previewImageUrl: selectedPhoto.image_url
        },
        {
          type: 'text',
          text: '✨ いかがでしたか？ご自身の写真で動画を作成されたい場合は、下部メニューからお選びください！'
        }
      ]);
      
      // 切换回主菜单
      await this.lineBot.switchToMainMenu(user.line_id);
      console.log('✅ 免费试用完成，已回到主菜单');
      
      // 异步记录（不影响用户）
      this.recordTrialCompletion(user, selectedPhoto).catch(console.error);

    } catch (error) {
      console.error('❌ 简化生成过程失败:', error);
      
      // 错误恢复：确保切换回主菜单
      try {
        await this.lineBot.switchToMainMenu(user.line_id);
        await this.client.pushMessage(user.line_id, {
          type: 'text',
          text: '❌ 生成中にエラーが発生しました。もう一度お試しください。'
        });
      } catch (recoveryError) {
        console.error('❌ 错误恢复也失败:', recoveryError.message);
      }
    }
  }



  // 等待指定毫秒数（用于模拟生成过程）
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 简单的异步记录试用完成
  async recordTrialCompletion(user, selectedPhoto) {
    try {
      await this.db.logInteraction(user.line_id, user.id, 'free_trial_completed', {
        photoId: selectedPhoto.id,
        videoUrl: selectedPhoto.demo_video_url,
        success: true
      });
      console.log('✅ 试用完成日志记录成功');
    } catch (error) {
      console.error('⚠️ 记录试用完成日志失败（不影响用户体验）:', error.message);
    }
  }

  // 🤖 使用OpenAI翻译日语prompt（智能翻译）
  async translateWithOpenAI(japaneseText) {
    try {
      console.log('🤖 调用OpenAI翻译:', japaneseText);
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: TRANSLATION_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: `Translate this Japanese text to an English video generation prompt: "${japaneseText}"`
          }
        ],
        max_tokens: 150,
        temperature: 0.3
      });

      const translation = completion.choices[0]?.message?.content?.trim();
      
      if (translation && translation.length > 0) {
        console.log('✅ OpenAI翻译成功:', translation);
        return {
          success: true,
          translation: translation
        };
      } else {
        console.warn('⚠️ OpenAI返回空翻译结果');
        return { success: false, error: 'Empty translation result' };
      }

    } catch (error) {
      console.error('❌ OpenAI翻译失败:', error.message);
      return { 
        success: false, 
        error: error.message,
        isTimeout: error.message.includes('timeout')
      };
    }
  }

  // 🤖 将日语prompt转换为英语（纯OpenAI翻译版）
  async translatePromptToEnglish(japaneseText) {
    console.log('🤖 开始OpenAI翻译:', japaneseText);
    
    // 直接使用OpenAI翻译（高质量）
    const openaiResult = await this.translateWithOpenAI(japaneseText);
    
    if (openaiResult.success) {
      console.log('✅ OpenAI翻译成功:', openaiResult.translation);
      // 确保包含视频生成关键词
      const enhancedTranslation = openaiResult.translation.includes('cinematic') || 
                                 openaiResult.translation.includes('quality') ||
                                 openaiResult.translation.includes('smooth')
        ? openaiResult.translation 
        : `${openaiResult.translation}, cinematic quality, natural movements, smooth animation`;
      return enhancedTranslation;
    }
    
    // 🛡️ 兜底机制：OpenAI失败时使用通用模板
    console.log('⚠️ OpenAI翻译失败，使用通用模板');
    return `Transform this photo into a dynamic video based on the concept: "${japaneseText}". Create natural movements and expressions that bring the scene to life with cinematic quality and smooth animations.`;
  }
}

module.exports = MessageHandler; 