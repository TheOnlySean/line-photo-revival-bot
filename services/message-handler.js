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
      // 获取用户资料
      const profile = await this.client.getProfile(userId);
      console.log('👤 用户资料:', profile);

      // 创建或确保用户记录存在
      const user = await this.db.ensureUserExists(userId, profile.displayName);

      // 记录交互日志
      await this.db.logInteraction(userId, user.id, 'follow', {
        displayName: profile.displayName,
      });

      // 欢迎消息和免费试用
      const welcomeMessage = '🎉 **写真復活へようこそ！**\n\n✨ AIが古い写真を美しい動画に変換します';
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: welcomeMessage
      });

      // 发送免费试用选项
      try {
        await this.lineBot.sendFreeTrialOptions(userId);
      } catch (trialError) {
        console.warn('⚠️ 发送试用选项失败:', trialError.message);
      }

    } catch (error) {
      console.error('❌ 处理用户关注失败:', error);
      throw error;
    }
  }

  // 处理文本消息
  async handleTextMessage(event) {
    try {
      const userId = event.source.userId;
      const messageText = event.message.text.trim();
      
      console.log(`📨 收到文本消息: "${messageText}" 来自用户: ${userId}`);

      // 确保用户存在
      const user = await this.db.ensureUserExists(userId);
      if (!user) {
        console.error('❌ 无法获取用户信息');
        return;
      }

      // 检查是否为调试命令
      if (messageText === '状态' || messageText === 'debug') {
        const subscription = await this.db.getUserSubscription(user.id);
        const quota = await this.db.checkVideoQuota(user.id);
        
        const debugInfo = subscription 
          ? `用户状态: ${user.current_state}\n订阅: ${subscription.plan_type}\n配额: ${quota.remaining}/${quota.total}`
          : `用户状态: ${user.current_state}\n订阅: 无\n配额: 0/0`;
          
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: debugInfo
        });
        return;
      }

      // 根据用户状态处理不同消息
      switch (user.current_state) {
        case 'awaiting_custom_prompt':
          await this.handleCustomPromptInput(event, user, messageText);
          break;
          
        case 'awaiting_photo':
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: '📸 写真をアップロードしてください。\n\n下のボタンから選択できます：'
          });
          await this.sendPhotoUploadOptions(event, user);
          break;

        default:
          // 处理一般文本消息
          await this.handleGeneralTextMessage(event, user, messageText);
          break;
      }

    } catch (error) {
      console.error('❌ 处理文本消息失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 申し訳ございません。エラーが発生しました。'
      });
    }
  }

  // 处理自定义prompt输入
  async handleCustomPromptInput(event, user, promptText) {
    try {
      // 立即發送確認消息，無等待
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: `✅ プロンプトを設定しました：\n"${promptText}"\n\n📸 次に写真をアップロードしてください：`
        },
        {
          type: 'text',
          text: '📸 写真のアップロード方法を選択してください：',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'camera',
                  label: '📷 カメラで撮影'
                }
              },
              {
                type: 'action',
                action: {
                  type: 'cameraRoll',
                  label: '📁 アルバムから選択'
                }
              }
            ]
          }
        }
      ]);

      // 完全異步保存狀態
      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_photo', promptText).catch(error => {
          console.error('❌ 設置自定義Prompt狀態失敗:', error);
        });
      });

    } catch (error) {
      console.error('❌ 处理自定义prompt输入失败:', error);
      throw error;
    }
  }

  // 发送照片上传选项
  async sendPhotoUploadOptions(event, user) {
    try {
      const quickReply = {
        items: [
          {
            type: 'action',
            action: {
              type: 'camera',
              label: '📷 カメラで撮影'
            }
          },
          {
            type: 'action',
            action: {
              type: 'cameraRoll',
              label: '📁 アルバムから選択'
            }
          }
        ]
      };

      await this.client.pushMessage(user.line_user_id, {
        type: 'text',
        text: '📸 写真のアップロード方法を選択してください：',
        quickReply: quickReply
      });

    } catch (error) {
      console.error('❌ 发送照片上传选项失败:', error);
    }
  }

  // 处理图片消息
  async handleImageMessage(event, user) {
    try {
      console.log('📷 收到图片消息');

      // 检查用户是否有有效订阅和配额
      const quota = await this.db.checkVideoQuota(user.id);
      if (!quota.hasQuota) {
        await this.handleInsufficientQuota(event, user, quota);
        return;
      }

      // 上传图片
      const imageUrl = await this.imageUploader.uploadImage(event.message.id, this.client);
      if (!imageUrl) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 画像のアップロードに失敗しました。再度お試しください。'
        });
        return;
      }

      console.log('✅ 图片上传成功:', imageUrl);

      console.log('📊 用戶狀態:', { 
        state: user.current_state, 
        hasPrompt: !!user.current_prompt,
        prompt: user.current_prompt 
      });

      // 根据用户状态决定下一步 - 顯示確認卡片而不是直接生成
      if (user.current_state === 'awaiting_photo' && user.current_prompt) {
        console.log('📋 顯示生成確認卡片');
        // 显示确认卡片，让用户最终确认
        await this.showGenerationConfirmation(event, user, imageUrl, user.current_prompt);
      } else {
        console.log('🎨 需要選擇Prompt，顯示選項');
        // 用户未设置prompt，显示prompt选项
        await this.showPromptOptions(event, user, imageUrl);
      }

    } catch (error) {
      console.error('❌ 处理图片消息失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 画像処理中にエラーが発生しました。'
      });
    }
  }

  // 处理配额不足
  async handleInsufficientQuota(event, user, quota) {
    try {
      const subscription = await this.db.getUserSubscription(user.id);
      
      let message;
      if (!subscription) {
        message = '💳 動画を生成するには有料プランのご契約が必要です。\n\n下部メニューの「ポイント購入」からお手続きください。';
      } else {
        message = `📊 今月の動画生成配額を超過しました。\n\n使用済み: ${quota.used}/${quota.total}\n\n来月1日に配額がリセットされます。`;
      }

      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: message
      });

    } catch (error) {
      console.error('❌ 处理配额不足失败:', error);
    }
  }

  // 开始视频生成
  async startVideoGeneration(event, user, imageUrl, prompt) {
    try {
      console.log('🎬 开始视频生成流程');

      // 使用视频配额
      await this.db.useVideoQuota(user.id);

      // 发送处理中消息
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎬 動画生成を開始します！\n\n⏱️ 約30-60秒で完成します。お待ちください...'
      });

      // 切换到处理中菜单
      await this.lineBot.switchToProcessingMenuSilent(user.line_user_id);

      // 获取用户订阅信息
      const subscription = await this.db.getUserSubscription(user.id);

      // 创建视频记录
      const videoRecord = await this.db.createVideoRecord(user.id, {
        subscriptionId: subscription?.id,
        taskId: null, // 将在videoGenerator中设置
        promptText: prompt,
        imageUrl: imageUrl,
        status: 'pending'
      });

      // 重置用户状态
      await this.db.setUserState(user.id, 'idle');

      // 异步开始视频生成
      await this.videoGenerator.generateVideo(user.line_user_id, imageUrl, videoRecord.id, prompt);

      // 记录交互
      await this.db.logInteraction(user.line_user_id, user.id, 'video_generation_started', {
        imageUrl: imageUrl,
        prompt: prompt,
        videoRecordId: videoRecord.id
      });

    } catch (error) {
      console.error('❌ 开始视频生成失败:', error);
      throw error;
    }
  }

  // 显示prompt选项
  async showPromptOptions(event, user, imageUrl) {
    try {
      // 保存图片URL到用户状态
      await this.db.setUserState(user.id, 'selecting_prompt', imageUrl);

      const promptMessage = {
        type: 'flex',
        altText: 'プロンプト設定を選択',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🎨 動画のスタイルを選択',
                weight: 'bold',
                size: 'lg',
                align: 'center'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                margin: 'lg',
                contents: [
                  {
                    type: 'button',
                    action: {
                      type: 'postback',
                      label: '🎯 ランダムプロンプト',
                      data: `action=RANDOM_PROMPT&image_url=${encodeURIComponent(imageUrl)}`
                    },
                    style: 'primary',
                    color: '#667eea'
                  },  
                  {
                    type: 'button',
                    action: {
                      type: 'postback',
                      label: '✏️ 自分で入力',
                      data: `action=INPUT_CUSTOM_PROMPT&image_url=${encodeURIComponent(imageUrl)}`,
                      inputOption: 'openKeyboard'
                    },
                    style: 'secondary'
                  }
                ]
              }
            ]
          }
        }
      };

      await this.client.replyMessage(event.replyToken, promptMessage);

    } catch (error) {
      console.error('❌ 显示prompt选项失败:', error);
      throw error;
    }
  }

  // 处理postback事件
  async handlePostback(event) {
    try {
      const userId = event.source.userId;
      const data = this.parsePostbackData(event.postback.data);
      
      console.log(`📫 Postback: ${data.action} - ${userId}`);

      // 優化：延後用戶創建到實際需要時
      let user = null;
      const getUser = async () => {
        if (!user) {
          user = await this.db.ensureUserExists(userId);
        }
        return user;
      };
      
      switch (data.action) {
        case 'INPUT_CUSTOM_PROMPT':
          await this.handleInputCustomPromptPostback(event, await getUser(), data);
          break;
          
        case 'RANDOM_PROMPT':
          await this.handleRandomPromptPostback(event, await getUser(), data);
          break;

        case 'PERSONALIZE':
          await this.handlePersonalizePostback(event, await getUser());
          break;

        case 'WAVE_VIDEO':
          console.log('🎯 開始處理WAVE_VIDEO postback');
          const waveUser = await getUser();
          console.log('✅ 用戶獲取成功:', waveUser?.id);
          await this.handleWaveVideoPostback(event, waveUser);
          console.log('✅ WAVE_VIDEO處理完成');
          break;

        case 'GROUP_VIDEO':
          await this.handleGroupVideoPostback(event, await getUser());
          break;

        case 'CREDITS':
          await this.handleRichMenuCreditsAction(event, await getUser());
          break;

        case 'confirm_generate':
          await this.handleConfirmGenerate(event, await getUser(), data);
          break;

        default:
          console.log('⚠️ 未知的postback action:', data.action);
          break;
      }

    } catch (error) {
      console.error('❌ 处理postback失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。'
      });
    }
  }

  // 处理个性化prompt postback
  async handlePersonalizePostback(event, user) {
    try {
      // 立即回復，無需等待任何操作
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✏️ **個性化プロンプト設定**\n\n動画のスタイルや雰囲気を自由に入力してください：\n\n例：\n・ゆっくりと微笑む\n・懐かしい雰囲気で\n・映画のようなドラマチックに'
      });

      // 異步設置狀態，完全不阻塞響應
      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_custom_prompt').catch(error => {
          console.error('❌ 設置個性化狀態失敗:', error);
        });
      });

    } catch (error) {
      console.error('❌ 处理个性化postback失败:', error);
      throw error;
    }
  }

  // 处理挥手视频postback
  async handleWaveVideoPostback(event, user) {
    try {
      // 立即回復用戶，無等待
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '👋 **手振り動画生成**\n\n写真の人物が自然に手を振る動画を作成します。\n\n📸 写真をアップロードしてください：'
        },
        {
          type: 'text',
          text: '📸 写真のアップロード方法を選択してください：',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'camera',
                  label: '📷 カメラで撮影'
                }
              },
              {
                type: 'action',
                action: {
                  type: 'cameraRoll',
                  label: '📁 アルバムから選択'
                }
              }
            ]
          }
        }
      ]);

      // 完全異步設置狀態
      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_photo', 'gentle waving hand motion').catch(error => {
          console.error('❌ 設置手振り狀態失敗:', error);
        });
      });

    } catch (error) {
      console.error('❌ 处理挥手视频postback失败:', error);
      throw error;
    }
  }

  // 处理群组视频postback
  async handleGroupVideoPostback(event, user) {
    try {
      // 立即回復用戶，無等待
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '👨‍👩‍👧‍👦 **寄り添い動画生成**\n\n家族や友人との温かい瞬間を動画にします。\n\n📸 写真をアップロードしてください：'
        },
        {
          type: 'text',
          text: '📸 写真のアップロード方法を選択してください：',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'camera',
                  label: '📷 カメラで撮影'
                }
              },
              {
                type: 'action',
                action: {
                  type: 'cameraRoll',
                  label: '📁 アルバムから選択'
                }
              }
            ]
          }
        }
      ]);

      // 完全異步設置狀態
      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_photo', 'warm family gathering with gentle smiles').catch(error => {
          console.error('❌ 設置寄り添い狀態失敗:', error);
        });
      });

    } catch (error) {
      console.error('❌ 处理群组视频postback失败:', error);
      throw error;
    }
  }

  // 处理確認生成
  async handleConfirmGenerate(event, user, data) {
    try {
      console.log('🎬 確認生成按鈕被點擊:', data);

      const imageUrl = decodeURIComponent(data.image_url);
      const prompt = decodeURIComponent(data.prompt);

      console.log('🎬 開始視頻生成:', { imageUrl, prompt });

      // 直接開始視頻生成
      await this.startVideoGeneration(event, user, imageUrl, prompt);

    } catch (error) {
      console.error('❌ 处理确认生成失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 生成処理中にエラーが発生しました。再度お試しください。'
      });
    }
  }

  // 处理充值action
  async handleRichMenuCreditsAction(event, user) {
    try {
      console.log('💎 充值按钮被点击 - 创建滑动套餐选择');
      
      // 创建可左右滑动的套餐选择 Carousel
      const paymentCarousel = {
        type: 'flex',
        altText: '💳 料金プラン選択 - 左右にスワイプ',
        contents: {
          type: 'carousel',
          contents: [
            // Trial Plan Card
            {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://picsum.photos/400/300?random=1',
                size: 'full',
                aspectRatio: '4:3',
                aspectMode: 'cover'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🎯 トライアルプラン',
                    weight: 'bold',
                    size: 'xl',
                    color: '#FF6B6B'
                  },
                  {
                    type: 'text',
                    text: '¥300/月 (50%OFF)',
                    size: 'lg',
                    color: '#333333',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '月間8本の動画生成',
                    size: 'sm',
                    color: '#666666',
                    margin: 'sm'
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
                      label: '🚀 このプランを選択',
                      uri: `https://line-photo-revival-bot.vercel.app/api/payment/create-direct-checkout?plan=trial&userId=${user.line_user_id}`
                    },
                    style: 'primary',
                    color: '#FF6B6B'
                  }
                ]
              }
            },
            // Standard Plan Card  
            {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://picsum.photos/400/300?random=2',
                size: 'full',
                aspectRatio: '4:3',
                aspectMode: 'cover'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '⭐ スタンダードプラン',
                    weight: 'bold',
                    size: 'xl',
                    color: '#667EEA'
                  },
                  {
                    type: 'text',
                    text: '¥2,980/月',
                    size: 'lg',
                    color: '#333333',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '月間100本の動画生成',
                    size: 'sm',
                    color: '#666666',
                    margin: 'sm'
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
                      label: '🚀 このプランを選択',
                      uri: `https://line-photo-revival-bot.vercel.app/api/payment/create-direct-checkout?plan=standard&userId=${user.line_user_id}`
                    },
                    style: 'primary',
                    color: '#667EEA'
                  }
                ]
              }
            }
          ]
        }
      };

      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '💳 料金プランをお選びください\n👈👉 左右にスワイプして選択できます'
        },
        paymentCarousel
      ]);
      
    } catch (error) {
      console.error('❌ 充值处理错误:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 処理中にエラーが発生しました。少々お待ちいただいてから再度お試しください'
      });
    }
  }

  // 处理随机prompt postback
  async handleRandomPromptPostback(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 生成随机prompt
      const randomPrompts = [
        'gentle smiling with warm lighting',
        'nostalgic family moment with soft focus',
        'elegant portrait with vintage feel',
        'natural breathing with peaceful expression',
        'warm eyes looking directly at camera'
      ];
      
      const randomPrompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
      
      // 模拟用户发送prompt消息，然后处理
      const simulatedEvent = {
        ...event,
        message: { text: randomPrompt },
        type: 'message'
      };

      // 设置用户状态
      await this.db.setUserState(user.id, 'awaiting_photo', randomPrompt);
      
      // 直接开始视频生成
      await this.startVideoGeneration(simulatedEvent, user, imageUrl, randomPrompt);

    } catch (error) {
      console.error('❌ 处理随机prompt失败:', error);
      throw error;
    }
  }

  // 处理自定义prompt输入postback
  async handleInputCustomPromptPostback(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      // 设置用户状态为等待自定义prompt输入
      await this.db.setUserState(user.id, 'awaiting_custom_prompt', imageUrl);
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✏️ **プロンプトをカスタマイズ**\n\n動画のスタイルを自由に入力してください：\n\n例：\n・ゆっくりと瞬きをする\n・懐かしい雰囲気で\n・映画のような演出で'
      });

    } catch (error) {
      console.error('❌ 处理自定义prompt输入失败:', error);
      throw error;
    }
  }

  // 显示生成確認卡片
  async showGenerationConfirmation(event, user, imageUrl, prompt) {
    try {
      console.log('📋 創建確認卡片:', { imageUrl, prompt });

      // 根據prompt判斷動作類型
      let actionType = 'custom';
      let actionInfo = {
        title: 'パーソナライズ動画生成',
        description: prompt,
        icon: '🎨'
      };

      if (prompt.includes('gentle waving hand motion')) {
        actionType = 'wave';
        actionInfo = {
          title: '手振り動画生成',
          description: '自然な手振り動画',
          icon: '👋'
        };
      } else if (prompt.includes('warm family gathering')) {
        actionType = 'group';
        actionInfo = {
          title: '寄り添い動画生成', 
          description: '温かい雰囲気の寄り添い動画',
          icon: '🤝'
        };
      }

      const confirmationCard = {
        type: 'flex',
        altText: `${actionInfo.title}確認`,
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
                text: '📸 写真を受信しました！',
                weight: 'bold',
                size: 'lg',
                color: '#333333',
                wrap: true,
                margin: 'none'
              },
              {
                type: 'text',
                text: '以下の内容で動画を生成しますか？',
                size: 'md',
                color: '#666666',
                wrap: true,
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'lg'
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
                    spacing: 'sm',
                    contents: [
                      {
                        type: 'text',
                        text: '動画タイプ:',
                        color: '#aaaaaa',
                        size: 'sm',
                        flex: 0,
                        wrap: true
                      },
                      {
                        type: 'text',
                        text: `${actionInfo.icon} ${actionInfo.title}`,
                        wrap: true,
                        color: '#333333',
                        size: 'sm',
                        weight: 'bold',
                        flex: 0,
                        margin: 'sm'
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
                        text: 'スタイル:',
                        color: '#aaaaaa',
                        size: 'sm',
                        flex: 0
                      },
                      {
                        type: 'text',
                        text: actionInfo.description,
                        wrap: true,
                        color: '#666666',
                        size: 'sm',
                        flex: 0,
                        margin: 'sm'
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
                  label: '🎬 動画を生成する',
                  data: `action=confirm_generate&image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`
                }
              }
            ]
          }
        }
      };

      await this.client.replyMessage(event.replyToken, confirmationCard);
      
      // 異步清除用戶狀態
      setImmediate(() => {
        this.db.setUserState(user.id, 'idle').catch(error => {
          console.error('❌ 清除用戶狀態失敗:', error);
        });
      });

    } catch (error) {
      console.error('❌ 显示确认卡片失败:', error);
      throw error;
    }
  }

  // 处理一般文本消息
  async handleGeneralTextMessage(event, user, messageText) {
    try {
      // 如果用户在等待自定义prompt输入且有保存的图片URL
      if (user.current_state === 'awaiting_custom_prompt' && user.current_prompt) {
        const imageUrl = user.current_prompt; // 这里存储的是图片URL
        await this.startVideoGeneration(event, user, imageUrl, messageText);
        return;
      }

      // 其他情况的通用回复
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🤔 申し訳ございません。よくわかりません。\n\n下部のメニューからご利用ください。'
      });

    } catch (error) {
      console.error('❌ 处理一般文本消息失败:', error);
      throw error;
    }
  }

  // 簡化的postback數據解析
  parsePostbackData(data) {
    // 如果是簡單的action=VALUE格式，直接解析
    if (data.startsWith('action=') && !data.includes('&')) {
      return { action: data.substring(7) };
    }
    
    // 否則使用URLSearchParams解析
    try {
      const params = new URLSearchParams(data);
      const result = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      return result;
    } catch (error) {
      return { action: data };
    }
  }

  // 休眠函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MessageHandler; 