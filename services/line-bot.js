const lineConfig = require('../config/line-config');
const fs = require('fs');
const path = require('path');

class LineBot {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.channelId = lineConfig.channelId;
  }

  // 设置Rich Menu
  async setupRichMenu() {
    try {
      // 删除现有的Rich Menu (如果存在)
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

      // 稍等一下确保Rich Menu创建完成
      console.log('⏱️ 等待Rich Menu创建完成...');
      await this.sleep(2000); // 等待2秒

      // 上传Rich Menu图片
      console.log('📤 开始上传Rich Menu图片...');
      try {
        await this.uploadRichMenuImage(mainRichMenuId, 'main');
        console.log('✅ 主菜单图片上传成功');
      } catch (error) {
        console.error('❌ 主菜单图片上传失败:', error);
        // 不抛出错误，继续尝试processing图片
      }

      try {
        await this.uploadRichMenuImage(processingRichMenuId, 'processing');
        console.log('✅ 生成中菜单图片上传成功');
      } catch (error) {
        console.error('❌ 生成中菜单图片上传失败:', error);
        // 不抛出错误，继续执行
      }

      // 保存菜单ID供后续使用（即使图片上传失败也要保存）
      this.mainRichMenuId = mainRichMenuId;
      this.processingRichMenuId = processingRichMenuId;

      // 尝试设置主菜单为默认Rich Menu
      try {
        await this.client.setDefaultRichMenu(mainRichMenuId);
        console.log('✅ 主要Rich Menu设置为默认菜单');
      } catch (error) {
        console.error('❌ 设置默认Rich Menu失败:', error.message);
        // 不抛出错误，Rich Menu仍然可以手动使用
      }

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

  // 切换回主要Rich Menu (强制显示)
  async switchToMainMenu(userId) {
    try {
      if (!this.mainRichMenuId) {
        console.log('⚠️ 主要Rich Menu未设置');
        return false;
      }

      if (!userId) {
        console.error('❌ 切换回主菜单需要用户ID');
        return false;
      }

      // 强制为用户绑定主菜单，确保菜单显示
      await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
      console.log('🔄 已强制绑定主菜单给用户:', userId);
      return true;
    } catch (error) {
      console.error('❌ 切换回主菜单失败:', error.message);
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

  // 创建自定义prompt的视频确认卡片
  createCustomVideoConfirmCard(imageUrl, customPrompt, creditsNeeded) {
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
                  text: customPrompt,
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
                data: `action=confirm_custom_generate&image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(customPrompt)}&credits=${creditsNeeded}`
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

  // 发送欢迎消息
  async sendWelcomeMessage(replyToken) {
    const welcomeMessages = [
      {
        type: "text",
        text: "🎉 欢迎使用写真復活服务！\n\n✨ 我们使用高性价比AI技术将您的照片转换成生动视频\n\n🎁 新用户可以免费体验3次演示生成"
      },
      {
        type: "text", 
        text: "📱 请使用底部菜单开始体验：\n\n🎁 免费体验 - 体验高性价比AI视频生成\n🎬 生成视频 - 上传您的照片\n💎 充值点数 - 购买更多点数\n📊 查看信息 - 查看剩余点数"
      }
    ];

    await this.client.replyMessage(replyToken, welcomeMessages);
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
}

module.exports = LineBot; 