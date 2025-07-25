const lineConfig = require('../config/line-config');
const fs = require('fs');
const path = require('path');

class LineBot {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.channelId = lineConfig.channelId;
    
    // 固定的Rich Menu ID (由脚本自动更新)
    this.mainRichMenuId = 'richmenu-b23cd874b50111aa5b277b2d633c96ec';
    this.processingRichMenuId = 'richmenu-9354f62c81779579ec5f13747ca4c80f';
  }

  // 设置Rich Menu（稳定优先策略）
  async setupRichMenu() {
    try {
      // 预验证图片文件
      if (!await this.validateRichMenuImages()) {
        throw new Error('Rich Menu图片验证失败');
      }

      // 检查是否可以重用现有Rich Menu
      const reuseResult = await this.tryReuseExistingRichMenus();
      if (reuseResult.success) {
        console.log('✅ 成功重用现有Rich Menu');
        return;
      }

      // 删除无效的Rich Menu
      await this.deleteExistingRichMenus();

      // Rich Menu配置（按照官方文档格式）
      const richMenu = {
        size: {
          width: 2500,
          height: 1686
        },
        selected: true, // 修改为默认显示
        name: "写真復活 Main Menu",
        chatBarText: "メニュー",
        areas: [
          // 第一行：左 (0-833)
          {
            bounds: {
              x: 0,
              y: 0,
              width: 833,
              height: 843
            },
            action: {
              type: "postback",
              label: "手振り動画生成",
              data: "action=wave&mode=video_generation",
              displayText: "手振り動画生成"
            }
          },
          // 第一行：中 (833-1666)  
          {
            bounds: {
              x: 833,
              y: 0,
              width: 833,
              height: 843
            },
            action: {
              type: "postback",
              label: "寄り添い動画生成",
              data: "action=group&mode=video_generation",
              displayText: "寄り添い動画生成"
            }
          },
          // 第一行：右 (1666-2500)
          {
            bounds: {
              x: 1666,
              y: 0,
              width: 834,
              height: 843
            },
            action: {
              type: "postback",
              label: "パーソナライズ動画生成",
              data: "action=custom&mode=video_generation",
              displayText: "パーソナライズ動画生成"
            }
          },
          // 第二行：左 (0-833)
          {
            bounds: {
              x: 0,
              y: 843,
              width: 833,
              height: 843
            },
            action: {
              type: "postback",
              label: "ポイント購入",
              data: "action=credits&mode=purchase",
              displayText: "ポイント購入"
            }
          },
          // 第二行：中 (833-1666)
          {
            bounds: {
              x: 833,
              y: 843,
              width: 833,
              height: 843
            },
            action: {
              type: "uri",
              uri: "https://angelsphoto.ai"
            }
          },
          // 第二行：右 (1666-2500)
          {
            bounds: {
              x: 1666,
              y: 843,
              width: 834,
              height: 843
            },
            action: {
              type: "postback",
              label: "友達にシェア",
              data: "action=share&mode=referral",
              displayText: "友達にシェア"
            }
          }
        ]
      };

      console.log('🎨 创建主要Rich Menu...');
      const mainRichMenuId = await this.client.createRichMenu(richMenu);
      console.log('✅ 主要Rich Menu创建成功:', mainRichMenuId);

      // 创建生成中Rich Menu（按照官方文档格式）
      const processingRichMenu = {
        size: {
          width: 2500,
          height: 1686
        },
        selected: true, // 修改为默认显示，确保用户能看到生成状态
        name: "写真復活 Processing Menu",
        chatBarText: "生成中...",
        areas: [
          {
            bounds: {
              x: 0,
              y: 0,
              width: 2500,
              height: 1686
            },
            action: {
              type: "postback",
              label: "進捗確認",
              data: "action=status_check",
              displayText: "進捗確認"
            }
          }
        ]
      };

      console.log('🎨 创建生成中Rich Menu...');
      const processingRichMenuId = await this.client.createRichMenu(processingRichMenu);
      console.log('✅ 生成中Rich Menu创建成功:', processingRichMenuId);

      // 验证Rich Menu ID
      console.log('🔍 验证Rich Menu ID...');
      console.log('📋 主菜单ID:', mainRichMenuId);
      console.log('📋 生成中菜单ID:', processingRichMenuId);
      
      if (!mainRichMenuId || !processingRichMenuId) {
        throw new Error('Rich Menu创建失败：未获得有效的菜单ID');
      }

      // 使用原子化操作设置Rich Menu
      console.log('⚡ 开始原子化Rich Menu设置...');
      await this.atomicRichMenuSetup(mainRichMenuId, processingRichMenuId);

      console.log('🎉 Rich Menu设置完成 (可能图片上传失败，但菜单结构已创建)');
      return { mainRichMenuId, processingRichMenuId };
    } catch (error) {
      console.error('❌ Rich Menu设置失败:', error.message);
      console.error('❌ 错误状态码:', error.response?.status);
      console.error('❌ 错误详情:', error.response?.data || error);
      throw error;
    }
  }

  // 切换到生成中Rich Menu (强制显示)
  async switchToProcessingMenu(userId) {
    try {
      if (!this.processingRichMenuId) {
        console.log('⚠️ 生成中Rich Menu未设置');
        return false;
      }

      if (!userId) {
        console.error('❌ 切换到生成中菜单需要用户ID');
        return false;
      }

      // 强制为用户绑定生成中菜单，确保菜单显示
      await this.client.linkRichMenuToUser(userId, this.processingRichMenuId);
      console.log('🔄 已强制绑定生成中菜单给用户:', userId);
      
      // 发送确认消息，提醒用户查看菜单
      await this.client.pushMessage(userId, {
        type: 'text',
        text: '🎬 動画生成を開始いたします！\n\n⏳ 下部の「生成中...」メニューで進捗をご確認いただけます。'
      });
      
      return true;
    } catch (error) {
      console.error('❌ 切换到生成中菜单失败:', error.message);
      return false;
    }
  }

  // 切换回主要Rich Menu (强制显示，增强版)
  async switchToMainMenu(userId) {
    try {
      if (!userId) {
        console.error('❌ 切换回主菜单需要用户ID');
        return false;
      }

      if (!this.mainRichMenuId) {
        console.log('⚠️ 主要Rich Menu未设置');
        return false;
      }

      // 🔧 增强的切换逻辑：多步骤确保成功
      console.log('🔄 开始切换回主菜单...', userId);

      // 步骤1: 解绑当前Rich Menu（如果有）
      try {
        await this.client.unlinkRichMenuFromUser(userId);
        console.log('✅ 已解绑当前菜单');
      } catch (unlinkError) {
        console.log('⚠️ 解绑菜单失败（可能用户没有菜单）:', unlinkError.message);
      }

      // 步骤2: 等待100ms确保解绑完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 步骤3: 绑定主菜单，重试3次
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
          console.log('✅ 已成功绑定主菜单给用户:', userId);
          return true;
        } catch (linkError) {
          retryCount++;
          console.warn(`⚠️ 绑定主菜单失败 (尝试 ${retryCount}/${maxRetries}):`, linkError.message);
          
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 200 * retryCount)); // 递增延迟
          }
        }
      }

      console.error('❌ 多次尝试后仍无法绑定主菜单');
      return false;

    } catch (error) {
      console.error('❌ 切换回主菜单异常:', error.message);
      return false;
    }
  }

  // 为新用户自动设置主要Rich Menu
  async ensureUserHasRichMenu(userId) {
    try {
      if (!this.mainRichMenuId) {
        console.log('⚠️ 主要Rich Menu未设置，跳过自动绑定');
        return false;
      }

      // 强制为用户绑定主菜单
      await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
      console.log('✅ 已为新用户自动绑定主菜单:', userId);
      return true;
    } catch (error) {
      console.error('❌ 为用户设置Rich Menu失败:', error.message);
      return false;
    }
  }

  // 删除现有Rich Menu
  async deleteExistingRichMenus() {
    try {
      console.log('🗑️ 开始检查现有Rich Menu...');
      const richMenus = await this.client.getRichMenuList();
      console.log('📋 发现', richMenus.length, '个现有Rich Menu');
      
      for (const menu of richMenus) {
        console.log('🗑️ 删除Rich Menu:', menu.richMenuId, menu.name);
        await this.client.deleteRichMenu(menu.richMenuId);
      }
      console.log('✅ Rich Menu清理完成');
    } catch (error) {
      console.error('❌ 删除Rich Menu失败:', error.message);
      console.error('❌ 错误详情:', error.response?.data || error);
    }
  }

  // 创建演示选择卡片
  createDemoSelectionCarousel(demoContents) {
    const bubbles = demoContents.map((demo, index) => ({
      type: "bubble",
      hero: {
        type: "image",
        url: demo.image_url,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: demo.title,
            weight: "bold",
            size: "lg",
            color: "#333333"
          },
                      {
              type: "text",
              text: demo.description || "体验高性价比AI视频生成",
              size: "sm",
              color: "#666666",
              margin: "md"
            }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: {
              type: "postback",
              label: "🎬 生成视频",
              data: `action=demo_generate&demo_id=${demo.id}`
            },
            style: "primary",
            color: "#42C76A"
          }
        ]
      }
    }));

    return {
      type: "flex",
      altText: "选择体验照片",
      contents: {
        type: "carousel",
        contents: bubbles
      }
    };
  }

  // 创建挥手照片引导消息
  createWavePhotoGuideMessage() {
    return {
      type: 'flex',
      altText: '挥手照片上传指南',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '👋 挥手照片指南',
              weight: 'bold',
              size: 'lg',
              color: '#42C76A'
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
                  type: 'text',
                  text: '✅ 清晰的人物肖像照片',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 面部表情自然，光线充足',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 单人或多人照片都可以',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 支持JPG、PNG格式',
                  size: 'sm'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '🎬 将自动生成人物挥手微笑的温馨视频',
                  size: 'xs',
                  color: '#666666',
                  wrap: true
                }
              ]
            }
          ]
        },
        styles: {
          body: {
            backgroundColor: '#F0F8F5'
          }
        }
      }
    };
  }

  // 创建多人照片引导消息
  createGroupPhotoGuideMessage() {
    return {
      type: 'flex',
      altText: '多人照片上传指南',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '👥 多人照片指南',
              weight: 'bold',
              size: 'lg',
              color: '#FF8C00'
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
                  type: 'text',
                  text: '✅ 2-5人的温馨合照最佳',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 人物之间有互动或依靠',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 表情自然、光线充足',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 家庭、朋友、情侣照片',
                  size: 'sm'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '💡 将生成展现人物间温馨互动的AI视频',
                  size: 'xs',
                  color: '#666666',
                  wrap: true
                }
              ]
            }
          ]
        },
        styles: {
          body: {
            backgroundColor: '#FFF8F0'
          }
        }
      }
    };
  }

  // 创建个性化生成引导消息
  createCustomGenerateGuideMessage() {
    return {
      type: 'flex',
      altText: '个性化生成指南',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎨 个性化生成指南',
              weight: 'bold',  
              size: 'lg',
              color: '#1E90FF'
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
                  type: 'text',
                  text: '📸 第一步：上传清晰照片',
                  size: 'sm',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '💭 第二步：发送创意提示词',
                  size: 'sm',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '例如："在海滩上微笑挥手"',
                  size: 'xs',
                  color: '#666666'
                },
                {
                  type: 'text', 
                  text: '例如："在咖啡厅里优雅读书"',
                  size: 'xs',
                  color: '#666666'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '⚡ 消耗2点数，生成您专属的创意视频',
                  size: 'xs',
                  color: '#FF6B35',
                  wrap: true,
                  weight: 'bold'
                }
              ]
            }
          ]
        },
        styles: {
          body: {
            backgroundColor: '#F0F8FF'
          }
        }
      }
    };
  }

  // 创建分享Bot消息
  createShareBotMessage() {
    return {
      type: 'flex',
      altText: '分享给朋友',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎁 与朋友分享',
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
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'md',
              contents: [
                {
                  type: 'text',
                  text: '✨ 邀请朋友一起体验AI视频生成',
                  size: 'sm',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: '🎬 让更多人感受科技带来的乐趣',
                  size: 'sm',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: '💝 分享快乐，传递美好回忆',
                  size: 'sm',
                  align: 'center'
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
                label: '📱 邀请朋友使用',
                uri: 'https://line.me/R/nv/recommendOA/@' + this.channelId
              },
              style: 'primary',
              color: '#8B5A96'
            }
          ]
        }
      }
    };
  }

  // 创建上传引导消息
  createUploadGuideMessage() {
    return {
      type: 'flex',
      altText: '照片上传指南',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📸 上传照片指南',
              weight: 'bold',
              size: 'lg',
              color: '#1DB446'
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
                  type: 'text',
                  text: '✅ 请选择清晰的人物照片',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 建议正面或侧面角度',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 光线充足，面部清楚',
                  size: 'sm'
                },
                {
                  type: 'text',
                  text: '✅ 支持 JPG、PNG 格式',
                  size: 'sm'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: '💡 上传后将显示预览和确认按钮',
                  size: 'xs',
                  color: '#666666',
                  wrap: true
                }
              ]
            }
          ]
        },
        styles: {
          body: {
            backgroundColor: '#F8F9FA'
          }
        }
      }
    };
  }

  // 创建预设prompt的视频确认卡片
  createPresetVideoConfirmCard(imageUrl, prompt, actionName, creditsNeeded) {
    return {
      type: "flex",
      altText: "動画生成確認",
      contents: {
        type: "bubble",
        hero: {
          type: "image",
          url: imageUrl,
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: `${actionName}生成`,
              weight: "bold",
              size: "xl",
              color: "#1DB446",
              align: "center"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical", 
              margin: "lg",
              spacing: "md",
              contents: [
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "生成タイプ:",
                      size: "sm",
                      color: "#666666",
                      flex: 3
                    },
                    {
                      type: "text",
                      text: actionName,
                      size: "sm",
                      weight: "bold",
                      color: "#1DB446",
                      flex: 2
                    }
                  ]
                },
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "必要ポイント:",
                      size: "sm",
                      color: "#666666",
                      flex: 3
                    },
                    {
                      type: "text",
                      text: `${creditsNeeded}ポイント`,
                      size: "sm",
                      weight: "bold",
                      color: "#FF6B35",
                      flex: 2
                    }
                  ]
                },
                {
                  type: "text",
                  text: "💡 プリセットプロンプトで自動的に美しい効果を生成",
                  size: "xs",
                  color: "#999999",
                  wrap: true,
                  margin: "md"
                }
              ]
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "🚀 動画を生成する",
                data: `action=confirm_preset_generate&image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}&credits=${creditsNeeded}`
              },
              style: "primary",
              color: "#1DB446",
              height: "md"
            },
            {
              type: "button",
              action: {
                type: "postback",
                label: "❌ 取消",
                data: "action=cancel"
              },
              style: "secondary",
              height: "sm"
            }
          ]
        }
      }
    };
  }

  // 创建自定义prompt的视频确认卡片（支持双语prompt）
  createCustomVideoConfirmCard(imageUrl, englishPrompt, creditsNeeded, displayPrompt = null) {
    const userVisiblePrompt = displayPrompt || englishPrompt; // 显示给用户的prompt
    
    return {
      type: "flex",
      altText: "确认生成个性化视频",
      contents: {
        type: "bubble",
        hero: {
          type: "image",
          url: imageUrl,
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "🎨 个性化视频生成",
              weight: "bold",
              size: "xl",
              color: "#1E90FF",
              align: "center"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical", 
              margin: "lg",
              spacing: "md",
              contents: [
                {
                  type: "text",
                  text: "您的创意提示:",
                  size: "sm",
                  color: "#666666",
                  weight: "bold"
                },
                {
                  type: "text",
                  text: userVisiblePrompt, // 🔧 显示用户友好的prompt
                  size: "sm",
                  color: "#1E90FF",
                  wrap: true,
                  margin: "xs"
                },
                {
                  type: "box",
                  layout: "baseline",
                  margin: "md",
                  contents: [
                    {
                      type: "text",
                      text: "消耗点数:",
                      size: "sm",
                      color: "#666666",
                      flex: 3
                    },
                    {
                      type: "text",
                      text: `${creditsNeeded}点`,
                      size: "sm",
                      weight: "bold",
                      color: "#FF6B35",
                      flex: 2
                    }
                  ]
                }
              ]
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "🎨 生成个性化视频",
                data: `action=confirm_custom_generate&image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(englishPrompt)}&credits=${creditsNeeded}`
              },
              style: "primary",
              color: "#1E90FF",
              height: "md"
            },
            {
              type: "button",
              action: {
                type: "postback",
                label: "❌ 取消",
                data: "action=cancel"
              },
              style: "secondary",
              height: "sm"
            }
          ]
        }
      }
    };
  }

  // 创建图片功能选择卡片（用户直接上传图片时）
  createImageFunctionSelectionCard(imageUrl) {
    return {
      type: "flex",
      altText: "选择生成类型",
      contents: {
        type: "bubble",
        hero: {
          type: "image",
          url: imageUrl,
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "选择生成类型",
              weight: "bold",
              size: "lg",
              color: "#333333",
              align: "center"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "text",
              text: "请选择您想要的AI视频生成类型：",
              size: "sm",
              color: "#666666",
              align: "center",
              margin: "md"
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "👋 挥手微笑 (1点)",
                data: `action=select_wave&image_url=${encodeURIComponent(imageUrl)}`
              },
              style: "primary",
              color: "#42C76A"
            },
            {
              type: "button",
              action: {
                type: "postback",
                label: "🤝 肩并肩互动 (1点)",
                data: `action=select_group&image_url=${encodeURIComponent(imageUrl)}`
              },
              style: "primary",
              color: "#FF8C00"
            },
            {
              type: "button",
              action: {
                type: "postback",
                label: "🎨 个性化生成 (2点)",
                data: `action=select_custom&image_url=${encodeURIComponent(imageUrl)}`
              },
              style: "primary",
              color: "#1E90FF"
            }
          ]
        }
      }
    };
  }

  // 创建视频生成确认卡片 - 改进版
  createVideoConfirmCard(imageUrl, creditsNeeded) {
    return {
      type: "flex",
      altText: "确认生成视频",
      contents: {
        type: "bubble",
        hero: {
          type: "image",
          url: imageUrl,
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "🎬 确认生成AI视频",
              weight: "bold",
              size: "xl",
              color: "#1DB446",
              align: "center"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical", 
              margin: "lg",
              spacing: "md",
              contents: [
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "消耗点数:",
                      size: "sm",
                      color: "#666666",
                      flex: 3
                    },
                    {
                      type: "text",
                      text: `${creditsNeeded}点`,
                      size: "sm",
                      weight: "bold",
                      color: "#FF6B35",
                      flex: 2
                    }
                  ]
                },
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "处理时间:",
                      size: "sm",
                      color: "#666666",
                      flex: 3
                    },
                    {
                      type: "text",
                      text: "约30-60秒",
                      size: "sm",
                      color: "#666666",
                      flex: 2
                    }
                  ]
                },
                {
                  type: "text",
                  text: "💡 使用高性价比AI模型，确保最佳生成效果",
                  size: "xs",
                  color: "#999999",
                  wrap: true,
                  margin: "md"
                }
              ]
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "🚀 立即生成视频",
                data: `action=confirm_generate&image_url=${encodeURIComponent(imageUrl)}`
              },
              style: "primary",
              color: "#1DB446",
              height: "md"
            },
            {
              type: "button",
              action: {
                type: "postback",
                label: "❌ 取消",
                data: "action=cancel"
              },
              style: "secondary",
              height: "sm"
            }
          ]
        }
      }
    };
  }

  // 创建点数不足提示卡片
  createInsufficientCreditsCard(currentCredits, neededCredits) {
    return {
      type: "flex",
      altText: "点数不足",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "💸 点数不足",
              weight: "bold",
              size: "lg",
              color: "#FF5551"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              contents: [
                {
                  type: "text",
                  text: `当前点数: ${currentCredits}点`,
                  size: "sm",
                  color: "#666666"
                },
                {
                  type: "text",
                  text: `需要点数: ${neededCredits}点`,
                  size: "sm",
                  color: "#666666",
                  margin: "xs"
                }
              ]
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "💎 充值点数",
                data: "action=buy_credits"
              },
              style: "primary",
              color: "#42C76A"
            }
          ]
        }
      }
    };
  }

  // 创建用户信息卡片
  async createUserInfoCard(user) {
    return {
      type: "flex",
      altText: "用户信息",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "📊 我的信息",
              weight: "bold",
              size: "lg",
              color: "#333333"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              contents: [
                {
                  type: "text",
                  text: `💎 剩余点数: ${user.credits}点`,
                  size: "sm",
                  color: "#42C76A",
                  weight: "bold"
                },
                {
                  type: "text",
                  text: `🎬 已生成视频: ${user.videos_generated}个`,
                  size: "sm",
                  color: "#666666",
                  margin: "xs"
                },
                {
                  type: "text",
                  text: `📅 注册时间: ${new Date(user.created_at).toLocaleDateString()}`,
                  size: "sm",
                  color: "#666666",
                  margin: "xs"
                }
              ]
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "💎 充值点数",
                data: "action=buy_credits"
              },
              style: "primary",
              color: "#42C76A"
            }
          ]
        }
      }
    };
  }

  // 发送欢迎消息（带免费试用）
  async sendWelcomeMessage(replyToken, userId) {
    const welcomeMessages = [
      {
        type: "text",
        text: "🎉 写真復活へようこそ！\n\n✨ 高性価比のAI技術で写真を生き生きとした動画に変換いたします\n\n🎁 新規ユーザー様には無料体験をご用意しております"
      },
      {
        type: "text", 
        text: "📱 下部メニューからご利用ください：\n\n👋 手を振る - 自然な手振り動画\n🤝 寄り添う - 温かい寄り添い動画\n🎨 パーソナライズ - オリジナル創作動画"
      }
    ];

    await this.client.replyMessage(replyToken, welcomeMessages);
    
    // 立即发送免费体验选项（Vercel serverless环境不支持setTimeout）
    console.log('🎁 立即发送免费试用选项给用户:', userId);
    try {
      await this.sendFreeTrialOptions(userId);
      console.log('✅ 免费试用选项发送成功');
    } catch (error) {
      console.error('❌ 发送试用选项失败:', error);
    }
  }

  // 发送免费试用选项
  async sendFreeTrialOptions(userId) {
    console.log('🎁 开始发送免费试用选项给用户:', userId);
    
    const { trialPhotos } = require('../config/demo-trial-photos');
    console.log(`📸 加载了 ${trialPhotos.length} 张试用照片`);
    
    try {
      // 首先尝试发送简化版本（更可靠）
      console.log('🎯 发送简化版免费试用选项...');
      await this.sendSimplifiedTrialOptions(userId);
      console.log('✅ 简化版试用选项发送成功');
      
      // 然后尝试发送完整的Carousel（可能失败但不影响主要功能）
      try {
        console.log('🎨 尝试发送完整Carousel...');
        const trialCarousel = this.createTrialPhotoCarousel(trialPhotos);
        
        await this.client.pushMessage(userId, [
          {
            type: 'text',
            text: '📸 详细选项：'
          },
          trialCarousel
        ]);
        console.log('✅ 完整Carousel也发送成功');
      } catch (carouselError) {
        console.log('⚠️ Carousel发送失败，但简化版已成功发送:', carouselError.message);
      }
      
    } catch (error) {
      console.error('❌ 发送试用选项失败:', error);
      console.error('❌ 错误详情:', error.message);
      console.error('❌ 用户ID:', userId);
      console.error('❌ 错误代码:', error.statusCode);
      
      // 发送简化版本作为备选
      try {
        console.log('🔄 发送简化版试用提示...');
        await this.client.pushMessage(userId, {
          type: 'text',
          text: '🎁 無料体験をご希望の場合は、下部メニューからお気軽にお選びください！'
        });
        console.log('✅ 简化版试用提示发送成功');
      } catch (fallbackError) {
        console.error('❌ 简化版试用提示也发送失败:', fallbackError);
      }
    }
  }

  // 发送简化版免费试用选项（带照片预览）
  async sendSimplifiedTrialOptions(userId) {
    console.log('🎯 创建带照片预览的免费试用选项...');
    
    const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');
    console.log(`📸 加载了 ${trialPhotos.length} 张试用照片，使用Vercel Blob存储`);
    
    // 创建带图片预览的Flex Message
    const photoPreviewMessage = {
      type: 'flex',
      altText: '🎁 無料体験 - サンプル写真を選択',
      contents: {
        type: 'carousel',
        contents: trialPhotos.map(photo => {
          const details = trialPhotoDetails[photo.id];
          
          console.log(`📸 ${photo.id}: ${photo.image_url}`);
          
          return {
            type: 'bubble',
            hero: {
              type: 'image',
              url: photo.image_url, // 现在直接使用Blob URL
              size: 'full',
              aspectRatio: '1:1',
              aspectMode: 'cover'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: details.title,
                  weight: 'bold',
                  size: 'md',
                  color: '#333333'
                },
                {
                  type: 'text',
                  text: details.subtitle,
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: '⏱️ 生成時間: 約10秒',
                  size: 'xs',
                  color: '#999999',
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
                    type: 'postback',
                    label: '🎬 この写真で体験',
                    data: `action=free_trial&photo_id=${photo.id}&type=${photo.type}`,
                    displayText: `${details.title}で無料体験開始`
                  },
                  style: 'primary',
                  color: '#FF6B9D'
                }
              ]
            }
          };
        })
      }
    };
    
    console.log('📤 发送带图片预览的试用选项...');
    await this.client.pushMessage(userId, [
      {
        type: 'text',
        text: '🎁 **無料体験をお試しください！**\n\n📸 下記のサンプル写真からお選びください。写真をご確認の上、お好みのものをお選びいただけます：'
      },
      photoPreviewMessage
    ]);
    
    console.log('✅ 照片预览版试用选项发送完成');
  }

  // 创建试用照片选择Carousel
  createTrialPhotoCarousel(trialPhotos) {
    const { trialPhotoDetails } = require('../config/demo-trial-photos');
    
    const bubbles = trialPhotos.map(photo => {
      const details = trialPhotoDetails[photo.id];
      
      return {
        type: "bubble",
        hero: {
          type: "image",
          url: photo.image_url,
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: details.title,
              weight: "bold",
              size: "lg",
              color: "#333333"
            },
            {
              type: "text",
              text: details.subtitle,
              size: "sm",
              color: "#666666",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical",
              contents: details.features.map(feature => ({
                type: "text",
                text: feature,
                size: "xs",
                color: "#888888",
                margin: "xs"
              })),
              margin: "lg"
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                {
                  type: "text",
                  text: "生成時間:",
                  size: "xs",
                  color: "#aaaaaa",
                  flex: 0
                },
                {
                  type: "text", 
                  text: details.generation_time,
                  size: "xs",
                  color: "#666666",
                  flex: 0,
                  margin: "sm"
                }
              ],
              margin: "lg"
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              action: {
                type: "postback",
                label: "🎬 無料体験開始",
                data: `action=free_trial&photo_id=${photo.id}&type=${photo.type}`,
                displayText: `${details.title}で無料体験`
              },
              style: "primary",
              color: "#FF6B9D"
            }
          ]
        }
      };
    });

    return {
      type: "template",
      altText: "🎁 無料体験サンプル写真",
      template: {
        type: "carousel",
        columns: bubbles
      }
    };
  }

  // 创建生成进度消息（带GIF动画）
  createGeneratingProgressMessage() {
    return {
      type: 'flex',
      altText: '🎬 AI视频生成中...',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: 'https://media.giphy.com/media/xTk9ZvMnbIiIew7IpW/giphy.gif', // AI生成进度GIF
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
              text: '🎬 AI视频生成中',
              weight: 'bold',
              size: 'xl',
              color: '#1DB446',
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
                  type: 'text',
                  text: '⚡ 正在使用高性价比AI模型处理...',
                  size: 'sm',
                  color: '#666666',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: '📊 预计处理时间: 30-60秒',
                  size: 'sm',
                  color: '#666666',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: '💡 请耐心等待，完成后将自动发送视频',
                  size: 'xs',
                  color: '#999999',
                  wrap: true,
                  align: 'center',
                  margin: 'md'
                }
              ]
            }
          ]
        },
        styles: {
          body: {
            backgroundColor: '#F0F8F5'
          }
        }
      }
    };
  }

  // 发送处理中消息 - 改进版
  async sendProcessingMessage(replyToken) {
    const processingMessage = this.createGeneratingProgressMessage();
    await this.client.replyMessage(replyToken, processingMessage);
  }

  // 推送生成状态更新消息
  async sendGenerationStatusUpdate(userId, status, progress = null) {
    let message;
    
    switch (status) {
      case 'processing':
        message = {
          type: 'text',
          text: `🔄 生成進度更新: ${progress || '処理中'}%\n⏱️ 残り時間約${Math.ceil((100 - (progress || 0)) / 2)}秒...`
        };
        break;
        
      case 'finalizing':
        message = {
          type: 'text',
          text: '🎯 動画生成がもうすぐ完了します...\n最終的な最適化処理を行っています'
        };
        break;
        
      case 'completed':
        message = {
          type: 'text',
          text: '🎉 動画生成完了！\nお送りしています...'
        };
        break;
        
      default:
        return;
    }

    await this.client.pushMessage(userId, message);
  }
  // 上传Rich Menu图片
  async uploadRichMenuImage(richMenuId, imageType) {
    try {
      // 确定图片文件路径
      const imageFileName = imageType === 'main' ? 'richmenu-main.png' : 'richmenu-processing.png';
      const imagePath = path.join(__dirname, '..', 'assets', imageFileName);
      
      console.log('📤 尝试上传图片:', imagePath);
      
      // 检查文件是否存在
      if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在: ${imagePath}`);
      }
      
      // 检查文件大小（最大1MB）
      const stats = fs.statSync(imagePath);
      if (stats.size > 1024 * 1024) {
        throw new Error(`图片文件过大: ${(stats.size / 1024 / 1024).toFixed(2)}MB > 1MB`);
      }
      
      // 读取图片文件
      const imageBuffer = fs.readFileSync(imagePath);
      
      // 确定图片类型
      const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      console.log(`📤 正在上传 ${imageType} 图片...`);
      console.log(`📊 文件大小: ${(stats.size / 1024).toFixed(2)}KB`);
      console.log(`🎨 内容类型: ${contentType}`);
      
      // 上传图片到LINE
      await this.client.setRichMenuImage(richMenuId, imageBuffer, contentType);
      
      console.log(`✅ ${imageType} 图片上传成功`);
      return true;
      
    } catch (error) {
      console.error(`❌ ${imageType} 图片上传失败:`, error.message);
      throw error;
    }
  }

  // 等待指定毫秒数
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 等待Rich Menu准备就绪
  async waitForRichMenuReady(richMenuId, menuType) {
    const maxRetries = 10;
    const retryDelay = 2000; // 2秒
    
    console.log(`⏳ 等待 ${menuType} Rich Menu (${richMenuId}) 准备就绪...`);
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 尝试获取Rich Menu信息来验证其存在
        const richMenu = await this.client.getRichMenu(richMenuId);
        
        if (richMenu && richMenu.richMenuId === richMenuId) {
          console.log(`✅ ${menuType} Rich Menu 已准备就绪 (尝试 ${i + 1}/${maxRetries})`);
          await this.sleep(1000); // 额外等待1秒确保完全可用
          return true;
        }
      } catch (error) {
        console.log(`⏳ ${menuType} Rich Menu 未准备就绪 (尝试 ${i + 1}/${maxRetries}): ${error.message}`);
      }
      
      if (i < maxRetries - 1) {
        await this.sleep(retryDelay);
      }
    }
    
    console.warn(`⚠️ ${menuType} Rich Menu 准备超时，继续尝试上传图片...`);
    return false;
  }

  // 带重试机制的图片上传
  async uploadRichMenuImageWithRetry(richMenuId, imageType) {
    const maxRetries = 3;
    const retryDelay = 3000; // 3秒
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`📤 尝试上传 ${imageType} 图片 (尝试 ${i + 1}/${maxRetries})...`);
        await this.uploadRichMenuImage(richMenuId, imageType);
        console.log(`✅ ${imageType} 图片上传成功！`);
        return true;
      } catch (error) {
        console.error(`❌ ${imageType} 图片上传失败 (尝试 ${i + 1}/${maxRetries}):`, error.message);
        
        // 如果是404错误且不是最后一次尝试，等待更长时间
        if (error.statusCode === 404 && i < maxRetries - 1) {
          console.log(`⏳ Rich Menu可能未完全准备就绪，等待 ${retryDelay}ms 后重试...`);
          await this.sleep(retryDelay);
          
          // 在重试前再次验证Rich Menu存在
          try {
            await this.client.getRichMenu(richMenuId);
            console.log(`✅ Rich Menu ${richMenuId} 验证存在，继续重试上传...`);
          } catch (verifyError) {
            console.error(`❌ Rich Menu验证失败:`, verifyError.message);
          }
        } else if (i === maxRetries - 1) {
          throw error; // 最后一次尝试失败，抛出错误
        }
      }
    }
    
    return false;
  }

  // 验证Rich Menu图片
  async validateRichMenuImages() {
    console.log('🔍 验证Rich Menu图片...');
    
    const fs = require('fs');
    const path = require('path');
    
    const images = [
      { name: 'main', path: path.join(__dirname, '../assets/richmenu-main.png'), maxSize: 1024 * 1024 },
      { name: 'processing', path: path.join(__dirname, '../assets/richmenu-processing.png'), maxSize: 1024 * 1024 }
    ];
    
    for (const image of images) {
      try {
        if (!fs.existsSync(image.path)) {
          console.error(`❌ ${image.name}图片不存在: ${image.path}`);
          return false;
        }
        
        const stats = fs.statSync(image.path);
        if (stats.size > image.maxSize) {
          console.error(`❌ ${image.name}图片过大: ${(stats.size / 1024).toFixed(2)}KB > ${image.maxSize / 1024}KB`);
          return false;
        }
        
        if (!image.path.endsWith('.png') && !image.path.endsWith('.jpg') && !image.path.endsWith('.jpeg')) {
          console.error(`❌ ${image.name}图片格式不支持: ${image.path}`);
          return false;
        }
        
        console.log(`✅ ${image.name}图片验证通过: ${(stats.size / 1024).toFixed(2)}KB`);
      } catch (error) {
        console.error(`❌ ${image.name}图片验证失败:`, error.message);
        return false;
      }
    }
    
    console.log('✅ 所有Rich Menu图片验证通过');
    return true;
  }

  // 尝试重用现有Rich Menu
  async tryReuseExistingRichMenus() {
    console.log('🔄 检查是否可以重用现有Rich Menu...');
    
    try {
      const richMenus = await this.client.getRichMenuList();
      
      let mainMenu = null;
      let processingMenu = null;
      
      for (const menu of richMenus) {
        if (menu.name.includes('Main') && menu.areas.length === 6) {
          mainMenu = menu;
        } else if (menu.name.includes('Processing') && menu.areas.length === 1) {
          processingMenu = menu;
        }
      }
      
      if (mainMenu && processingMenu) {
        console.log('🎯 找到可重用的Rich Menu');
        console.log(`   主菜单: ${mainMenu.richMenuId}`);
        console.log(`   处理中菜单: ${processingMenu.richMenuId}`);
        
        // 验证Rich Menu是否真正可用
        const mainValid = await this.validateRichMenuExists(mainMenu.richMenuId);
        const processingValid = await this.validateRichMenuExists(processingMenu.richMenuId);
        
        if (mainValid && processingValid) {
          this.mainRichMenuId = mainMenu.richMenuId;
          this.processingRichMenuId = processingMenu.richMenuId;
          
          // 尝试上传图片到现有菜单
          await this.uploadImagesToExistingMenus();
          
          return { success: true, reused: true };
        }
      }
      
      console.log('⚠️ 无法重用现有Rich Menu，将创建新的');
      return { success: false, reason: 'no_valid_existing_menus' };
      
    } catch (error) {
      console.error('❌ 检查现有Rich Menu失败:', error.message);
      return { success: false, reason: 'check_failed' };
    }
  }

  // 验证Rich Menu是否存在
  async validateRichMenuExists(richMenuId) {
    try {
      const menu = await this.client.getRichMenu(richMenuId);
      return menu && menu.richMenuId === richMenuId;
    } catch (error) {
      console.log(`⚠️ Rich Menu ${richMenuId} 不存在或无效:`, error.message);
      return false;
    }
  }

  // 上传图片到现有菜单
  async uploadImagesToExistingMenus() {
    console.log('📤 尝试上传图片到现有Rich Menu...');
    
    const uploadTasks = [
      { id: this.mainRichMenuId, type: 'main' },
      { id: this.processingRichMenuId, type: 'processing' }
    ];
    
    for (const task of uploadTasks) {
      try {
        await this.uploadRichMenuImageWithRetry(task.id, task.type);
        console.log(`✅ ${task.type}图片上传到现有菜单成功`);
      } catch (error) {
        console.log(`⚠️ ${task.type}图片上传到现有菜单失败，但菜单仍可用:`, error.message);
      }
    }
  }

  // 原子化Rich Menu设置
  async atomicRichMenuSetup(mainRichMenuId, processingRichMenuId) {
    console.log('⚡ 执行原子化Rich Menu设置...');
    
    try {
      // 第1步：立即设置主菜单为默认（这会稳定Rich Menu）
      console.log('📌 步骤1: 设置主菜单为默认...');
      await this.client.setDefaultRichMenu(mainRichMenuId);
      console.log('✅ 主菜单已设为默认');
      
      // 第2步：等待Rich Menu稳定
      console.log('⏳ 步骤2: 等待Rich Menu稳定...');
      await this.sleep(5000); // 等待5秒让LINE服务器稳定处理
      
      // 第3步：验证Rich Menu仍然存在
      console.log('🔍 步骤3: 验证Rich Menu状态...');
      const mainExists = await this.validateRichMenuExists(mainRichMenuId);
      const processingExists = await this.validateRichMenuExists(processingRichMenuId);
      
      if (!mainExists || !processingExists) {
        throw new Error('Rich Menu在设置默认后消失');
      }
      
      console.log('✅ Rich Menu状态验证通过');
      
      // 第4步：保存ID到实例
      this.mainRichMenuId = mainRichMenuId;
      this.processingRichMenuId = processingRichMenuId;
      
      // 第5步：上传图片（现在Rich Menu应该是稳定的）
      console.log('📤 步骤5: 上传Rich Menu图片...');
      
      const uploadResults = await Promise.allSettled([
        this.uploadRichMenuImageWithRetry(mainRichMenuId, 'main'),
        this.uploadRichMenuImageWithRetry(processingRichMenuId, 'processing')
      ]);
      
      // 检查上传结果
      uploadResults.forEach((result, index) => {
        const type = index === 0 ? 'main' : 'processing';
        if (result.status === 'fulfilled') {
          console.log(`✅ ${type}图片上传成功`);
        } else {
          console.log(`⚠️ ${type}图片上传失败，但菜单仍可用:`, result.reason?.message);
        }
      });
      
      console.log('🎉 原子化Rich Menu设置完成');
      
    } catch (error) {
      console.error('❌ 原子化Rich Menu设置失败:', error);
      
      // 尝试恢复：至少确保Rich Menu ID被保存
      this.mainRichMenuId = mainRichMenuId;
      this.processingRichMenuId = processingRichMenuId;
      
      console.log('🔄 已保存Rich Menu ID，功能应该仍然可用');
      throw error;
    }
  }

  // 创建照片上传Quick Reply
  createPhotoUploadQuickReply(text) {
    return {
      type: 'text',
      text: text,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'cameraRoll',
              label: '📱 カメラロールから選ぶ'
            }
          },
          {
            type: 'action',
            action: {
              type: 'camera',
              label: '📷 カメラを起動する'
            }
          }
        ]
      }
    };
  }

  // 创建个性化生成的提示词选择Quick Reply
  createCustomPromptSelectionQuickReply(text) {
    return {
      type: 'text',
      text: text,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🎲 ランダム',
              text: 'RANDOM_PROMPT'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '✏️ 自分で入力する',
              text: 'INPUT_CUSTOM_PROMPT'
            }
          }
        ]
      }
    };
  }

  // 创建个性化生成的照片上传Quick Reply（包含Nashi选项）
  createCustomPhotoUploadQuickReply(text) {
    return {
      type: 'text',
      text: text,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'cameraRoll',
              label: '📱 カメラロールから選ぶ'
            }
          },
          {
            type: 'action',
            action: {
              type: 'camera',
              label: '📷 カメラを起動する'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🚫 写真なし',
              text: 'Nashi'
            }
          }
        ]
      }
    };
  }

  // 检查必需的图片文件
  checkRequiredImages() {
    const requiredImages = [
      { type: 'main', file: 'richmenu-main.png' },
      { type: 'processing', file: 'richmenu-processing.png' }
    ];
    
    const results = [];
    
    for (const img of requiredImages) {
      const imagePath = path.join(__dirname, '..', 'assets', img.file);
      const exists = fs.existsSync(imagePath);
      
      if (exists) {
        const stats = fs.statSync(imagePath);
        results.push({
          type: img.type,
          file: img.file,
          exists: true,
          path: imagePath,
          size: `${(stats.size / 1024).toFixed(2)}KB`,
          sizeBytes: stats.size,
          valid: stats.size <= 1024 * 1024 // 1MB limit
        });
      } else {
        results.push({
          type: img.type,
          file: img.file,
          exists: false,
          path: imagePath,
          size: 'N/A',
          sizeBytes: 0,
          valid: false
        });
      }
    }
    
    return results;
  }

  // 获取基础URL，用于构建完整的静态文件URL
  getBaseUrl() {
    // 优先使用VERCEL_URL环境变量
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    
    // 尝试其他Vercel环境变量
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    
    // 开发环境或其他情况的fallback
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000';
    }
    
    // 最终fallback - 需要根据实际部署域名调整
    return 'https://line-photo-revival-bot.vercel.app';
  }
}

module.exports = LineBot; 