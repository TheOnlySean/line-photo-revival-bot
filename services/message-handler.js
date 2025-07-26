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
      const profile = await this.client.getProfile(userId);
      const user = await this.db.ensureUserExists(userId, profile.displayName);

      await this.db.logInteraction(userId, user.id, 'follow', {
        displayName: profile.displayName,
      });

      // 欢迎消息
      const welcomeMessage = '🎉 **写真復活へようこそ！**\n\n✨ AIが古い写真を美しい動画に変換します\n\n🎁 新規ユーザー様には無料体験をご用意しております';
      
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: welcomeMessage
      });

      // 确保用户有Rich Menu
      await this.lineBot.ensureUserHasRichMenu(userId);

      // 直接发送测试视频选项（不使用setTimeout）
      try {
        await this.lineBot.sendDemoVideos(userId);
        console.log('✅ 测试视频选项发送成功');
      } catch (demoError) {
        console.error('❌ 发送测试视频选项失败:', demoError);
        // 发送简化版本
        await this.client.pushMessage(userId, {
          type: 'text',
          text: '🎁 無料体験をご希望の場合は、下部メニューからお気軽にお選びください！'
        });
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
      
      const user = await this.db.ensureUserExists(userId);
      if (!user) {
        console.error('❌ 无法获取用户信息');
        return;
      }

      // 调试命令
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

      // 根据用户状态处理消息
      switch (user.current_state) {
        case 'awaiting_custom_prompt':
          await this.handleCustomPromptInput(event, user, messageText);
          break;
          
        case 'awaiting_photo':
          const quickReply = this.lineBot.createPhotoUploadQuickReply('📸 写真をアップロードしてください：');
          await this.client.replyMessage(event.replyToken, quickReply);
          break;

        default:
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: '🤔 申し訳ございません。下部のメニューからご利用ください。'
          });
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
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: `✅ プロンプトを設定しました：\n"${promptText}"\n\n📸 次に写真をアップロードしてください：`
        },
        this.lineBot.createPhotoUploadQuickReply('📸 写真のアップロード方法を選択してください：')
      ]);

      // 异步设置状态
      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_photo', promptText).catch(console.error);
      });

    } catch (error) {
      console.error('❌ 处理自定义prompt输入失败:', error);
      throw error;
    }
  }

  // 处理图片消息
  async handleImageMessage(event, user) {
    try {
      // 检查用户订阅配额
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

      // 显示确认卡片
      if (user.current_state === 'awaiting_photo' && user.current_prompt) {
        await this.showGenerationConfirmation(event, user, imageUrl, user.current_prompt);
      } else {
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
    const subscription = await this.db.getUserSubscription(user.id);
    
    let message;
    if (!subscription) {
      message = '💳 動画を生成するには有料プランのご契約が必要です。\n\n下部メニューの「優惠券+充値」からお手続きください。';
    } else {
      message = `📊 今月の動画生成配額を超過しました。\n\n使用済み: ${quota.used}/${quota.total}\n\n来月1日に配額がリセットされます。`;
    }

    await this.client.replyMessage(event.replyToken, {
      type: 'text',
      text: message
    });
  }

  // 显示生成确认卡片
  async showGenerationConfirmation(event, user, imageUrl, prompt) {
    try {
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
      
      // 异步清除用户状态
      setImmediate(() => {
        this.db.setUserState(user.id, 'idle').catch(console.error);
      });

    } catch (error) {
      console.error('❌ 显示确认卡片失败:', error);
      throw error;
    }
  }

  // 处理postback事件
  async handlePostback(event) {
    try {
      const userId = event.source.userId;
      const data = this.parsePostbackData(event.postback.data);
      
      let user = null;
      const getUser = async () => {
        if (!user) {
          user = await this.db.ensureUserExists(userId);
        }
        return user;
      };
      
      switch (data.action) {
        // 核心视频生成功能
        case 'WAVE_VIDEO':
          await this.handleWaveVideoPostback(event, await getUser());
          break;

        case 'GROUP_VIDEO':
          await this.handleGroupVideoPostback(event, await getUser());
          break;

        case 'PERSONALIZE':
          await this.handlePersonalizePostback(event, await getUser());
          break;

        case 'confirm_generate':
          await this.handleConfirmGenerate(event, await getUser(), data);
          break;

        // 新增辅助功能
        case 'COUPON':
          await this.handleCouponAction(event, await getUser());
          break;

        case 'WEBSITE':
          await this.handleWebsiteAction(event, await getUser());
          break;

        case 'SHARE':
          await this.handleShareAction(event, await getUser());
          break;

        // 测试视频功能
        case 'demo_generate':
          await this.handleDemoGenerate(event, await getUser(), data);
          break;

        // 个性化功能
        case 'INPUT_CUSTOM_PROMPT':
          await this.handleInputCustomPromptPostback(event, await getUser(), data);
          break;
          
        case 'RANDOM_PROMPT':
          await this.handleRandomPromptPostback(event, await getUser(), data);
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

  // 处理手振り视频postback
  async handleWaveVideoPostback(event, user) {
    try {
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '👋 **手振り動画生成**\n\n写真の人物が自然に手を振る動画を作成します。\n\n📸 写真をアップロードしてください：'
        },
        this.lineBot.createPhotoUploadQuickReply('📸 写真のアップロード方法を選択してください：')
      ]);

      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_photo', 'gentle waving hand motion').catch(console.error);
      });

    } catch (error) {
      console.error('❌ 处理挥手视频postback失败:', error);
      throw error;
    }
  }

  // 处理寄り添い视频postback
  async handleGroupVideoPostback(event, user) {
    try {
      await this.client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text: '👨‍👩‍👧‍👦 **寄り添い動画生成**\n\n家族や友人との温かい瞬間を動画にします。\n\n📸 写真をアップロードしてください：'
        },
        this.lineBot.createPhotoUploadQuickReply('📸 写真のアップロード方法を選択してください：')
      ]);

      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_photo', 'warm family gathering with gentle smiles').catch(console.error);
      });

    } catch (error) {
      console.error('❌ 处理群组视频postback失败:', error);
      throw error;
    }
  }

  // 处理个性化postback
  async handlePersonalizePostback(event, user) {
    try {
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✏️ **個性化プロンプト設定**\n\n動画のスタイルや雰囲気を自由に入力してください：\n\n例：\n・ゆっくりと微笑む\n・懐かしい雰囲気で\n・映画のようなドラマチックに'
      });

      setImmediate(() => {
        this.db.setUserState(user.id, 'awaiting_custom_prompt').catch(console.error);
      });

    } catch (error) {
      console.error('❌ 处理个性化postback失败:', error);
      throw error;
    }
  }

  // 处理確認生成
  async handleConfirmGenerate(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      const prompt = decodeURIComponent(data.prompt);

      await this.startVideoGeneration(event, user, imageUrl, prompt);

    } catch (error) {
      console.error('❌ 处理确认生成失败:', error);
      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 生成処理中にエラーが発生しました。再度お試しください。'
      });
    }
  }

  // 🎟️ 处理优惠券+充值功能
  async handleCouponAction(event, user) {
    try {
      const message = {
        type: 'flex',
        altText: '🎟️ 優惠券・充値オプション',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🎟️ 優惠券・充値',
                weight: 'bold',
                size: 'xl',
                color: '#FF6B6B'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: 'プラン購入や優惠券のご利用はこちらから',
                size: 'sm',
                color: '#666666',
                margin: 'md'
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
                  label: '💳 プラン購入',
                  data: 'action=CREDITS'
                },
                style: 'primary',
                color: '#667EEA'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🎫 優惠券を使用',
                  data: 'action=USE_COUPON'
                },
                style: 'secondary'
              }
            ]
          }
        }
      };

      await this.client.replyMessage(event.replyToken, message);
    } catch (error) {
      console.error('❌ 处理优惠券功能失败:', error);
    }
  }

  // 🌐 处理官网客服功能
  async handleWebsiteAction(event, user) {
    try {
      const message = {
        type: 'template',
        altText: '🌐 公式サイト・サポート',
        template: {
          type: 'buttons',
          text: '🌐 **公式サイト・サポート**\n\nより詳しいサポートが必要でしたら、こちらをご利用ください',
          actions: [
            {
              type: 'uri',
              label: '🌐 公式サイトへ',
              uri: 'https://your-website.com'
            },
            {
              type: 'postback',
              label: '📧 お問い合わせ',
              data: 'action=CONTACT'
            }
          ]
        }
      };

      await this.client.replyMessage(event.replyToken, message);
    } catch (error) {
      console.error('❌ 处理官网客服功能失败:', error);
    }
  }

  // 👥 处理好友分享功能
  async handleShareAction(event, user) {
    try {
      const shareCard = {
        type: 'flex',
        altText: '👥 友達にシェア',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '👥 友達にシェア',
                weight: 'bold',
                size: 'xl',
                color: '#8B5A96',
                align: 'center'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '📸✨ 写真復活 AI\nあなたの写真が動き出す！',
                size: 'md',
                color: '#333333',
                align: 'center',
                margin: 'lg'
              },
              {
                type: 'text',
                text: '友達にもこの素晴らしい体験をシェアしませんか？',
                size: 'sm',
                color: '#666666',
                wrap: true,
                align: 'center',
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
                action: {
                  type: 'uri',
                  label: '📱 友達に紹介する',
                  uri: 'https://line.me/R/nv/recommendOA/@' + this.lineBot.channelId
                },
                style: 'primary',
                color: '#8B5A96'
              }
            ]
          }
        }
      };

      await this.client.replyMessage(event.replyToken, shareCard);
    } catch (error) {
      console.error('❌ 处理好友分享功能失败:', error);
    }
  }

  // 处理测试视频生成
  async handleDemoGenerate(event, user, data) {
    try {
      const photoId = data.photo_id;
      
      // 获取对应的演示视频
      const { trialPhotos } = require('../config/demo-trial-photos');
      const selectedPhoto = trialPhotos.find(photo => photo.id === photoId);
      
      if (!selectedPhoto) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 申し訳ございません。選択した写真が見つかりません。'
        });
        return;
      }

      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎬 テスト動画を生成中...\n\n⏱️ 約15秒でお送りします！'
      });

      // 切换到处理中菜单
      await this.lineBot.switchToProcessingMenuSilent(user.line_user_id);
      console.log('✅ 已切换到处理中菜单，开始模拟生成...');

      // 使用 Promise 代替 setTimeout，确保在 serverless 环境中正常工作
      await new Promise(resolve => setTimeout(resolve, 15000));

      try {
        // 发送真实的演示视频
        await this.client.pushMessage(user.line_user_id, [
          {
            type: 'text',
            text: '🎉 **テスト動画生成完了！**\n\nいかがでしょうか？\n\n実際の写真で試してみたい場合は、下部メニューからご利用ください！'
          },
          {
            type: 'video',
            originalContentUrl: selectedPhoto.demo_video_url,
            previewImageUrl: selectedPhoto.image_url
          }
        ]);

        // 切换回主菜单
        await this.lineBot.switchToMainMenu(user.line_user_id);
        console.log('✅ 演示视频发送成功');
        
      } catch (sendError) {
        console.error('❌ 发送测试视频失败:', sendError);
        
        // 发送错误消息并切换回主菜单
        await this.client.pushMessage(user.line_user_id, {
          type: 'text',
          text: '❌ 申し訳ございません。動画の送信に失敗しました。再度お試しください。'
        });
        await this.lineBot.switchToMainMenu(user.line_user_id);
      }

    } catch (error) {
      console.error('❌ 处理测试视频生成失败:', error);
    }
  }

  // 其他辅助方法...
  async startVideoGeneration(event, user, imageUrl, prompt) {
    try {
      await this.db.useVideoQuota(user.id);

      await this.client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🎬 動画生成を開始します！\n\n⏱️ 約30-60秒で完成します。お待ちください...'
      });

      await this.lineBot.switchToProcessingMenuSilent(user.line_user_id);

      const subscription = await this.db.getUserSubscription(user.id);
      const videoRecord = await this.db.createVideoRecord(user.id, {
        subscriptionId: subscription?.id,
        taskId: null,
        promptText: prompt,
        imageUrl: imageUrl,
        status: 'pending'
      });

      await this.db.setUserState(user.id, 'idle');
      await this.videoGenerator.generateVideo(user.line_user_id, imageUrl, videoRecord.id, prompt);

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

  // 简化的postback数据解析
  parsePostbackData(data) {
    if (data.startsWith('action=') && !data.includes('&')) {
      return { action: data.substring(7) };
    }
    
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

  // 显示prompt选项（简化版）
  async showPromptOptions(event, user, imageUrl) {
    try {
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

  // 处理随机prompt postback (简化版)
  async handleRandomPromptPostback(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
      
      const randomPrompts = [
        'gentle smiling with warm lighting',
        'nostalgic family moment with soft focus',
        'elegant portrait with vintage feel',
        'natural breathing with peaceful expression',
        'warm eyes looking directly at camera'
      ];
      
      const randomPrompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
      
      await this.db.setUserState(user.id, 'awaiting_photo', randomPrompt);
      await this.startVideoGeneration(event, user, imageUrl, randomPrompt);

    } catch (error) {
      console.error('❌ 处理随机prompt失败:', error);
      throw error;
    }
  }

  // 处理自定义prompt输入postback (简化版)
  async handleInputCustomPromptPostback(event, user, data) {
    try {
      const imageUrl = decodeURIComponent(data.image_url);
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
}

module.exports = MessageHandler; 