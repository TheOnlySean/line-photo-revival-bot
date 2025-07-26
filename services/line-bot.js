const lineConfig = require('../config/line-config');
const fs = require('fs');
const path = require('path');

class LineBot {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.channelId = lineConfig.channelId;
    
    // Rich Menu ID (将由脚本自动更新)
    this.mainRichMenuId = null;
    this.processingRichMenuId = null;
    
    // 自动初始化Rich Menu ID
    this.initializeRichMenuIds();
  }

  // 自动获取现有Rich Menu ID
  async initializeRichMenuIds() {
    try {
      const richMenus = await this.client.getRichMenuList();
      
      for (const menu of richMenus) {
        if (menu.name === "写真復活 Main Menu (6 Buttons)") {
          this.mainRichMenuId = menu.richMenuId;
          console.log('✅ 找到主菜单ID:', this.mainRichMenuId);
        } else if (menu.name === "写真復活 Processing Menu") {
          this.processingRichMenuId = menu.richMenuId;
          console.log('✅ 找到处理中菜单ID:', this.processingRichMenuId);
        }
      }
      
      if (this.mainRichMenuId && this.processingRichMenuId) {
        console.log('🎉 Rich Menu ID初始化完成');
      } else {
        console.log('⚠️ 某些Rich Menu ID未找到，可能需要运行setup脚本');
      }
    } catch (error) {
      console.error('❌ 初始化Rich Menu ID失败:', error.message);
    }
  }

  // 设置Rich Menu（6按钮Full模式）
  async setupRichMenu() {
    try {
      console.log('🎨 开始设置6按钮Rich Menu...');

      // 预验证图片文件
      if (!await this.validateRichMenuImages()) {
        throw new Error('Rich Menu图片验证失败');
      }

      // 删除现有Rich Menu
      await this.deleteExistingRichMenus();

      // Rich Menu配置（Full模式 - 2500x1686，6个按钮）
      const richMenu = {
        size: {
          width: 2500,
          height: 1686
        },
        selected: true,
        name: "写真復活 Main Menu (6 Buttons)",
        chatBarText: "メニュー",
        areas: [
          // 上排第一个：手振り (0, 0, 833, 843)
          {
            bounds: { x: 0, y: 0, width: 833, height: 843 },
            action: {
              type: "postback",
              label: "手振り動画生成",
              data: "action=WAVE_VIDEO"
            }
          },
          // 上排第二个：寄り添い (833, 0, 833, 843)  
          {
            bounds: { x: 833, y: 0, width: 833, height: 843 },
            action: {
              type: "postback",
              label: "寄り添い動画生成",
              data: "action=GROUP_VIDEO"
            }
          },
          // 上排第三个：個性化 (1666, 0, 834, 843)
          {
            bounds: { x: 1666, y: 0, width: 834, height: 843 },
            action: {
              type: "postback",
              label: "パーソナライズ動画生成",
              data: "action=PERSONALIZE"
            }
          },
          // 下排第一个：優惠券+充值 (0, 843, 833, 843)
          {
            bounds: { x: 0, y: 843, width: 833, height: 843 },
            action: {
              type: "postback",
              label: "優惠券+充値",
              data: "action=COUPON"
            }
          },
          // 下排第二个：官網客服 (833, 843, 833, 843)
          {
            bounds: { x: 833, y: 843, width: 833, height: 843 },
            action: {
              type: "postback",
              label: "公式サイト・サポート",
              data: "action=WEBSITE"
            }
          },
          // 下排第三个：好友分享 (1666, 843, 834, 843)
          {
            bounds: { x: 1666, y: 843, width: 834, height: 843 },
            action: {
              type: "postback",
              label: "友達にシェア",
              data: "action=SHARE"
            }
          }
        ]
      };

      console.log('🎨 创建主要Rich Menu (6按钮)...');
      const mainRichMenuId = await this.client.createRichMenu(richMenu);
      console.log('✅ 主要Rich Menu创建成功:', mainRichMenuId);

      // 创建生成中Rich Menu（Full模式，配额显示区域）
      const processingRichMenu = {
        size: {
          width: 2500,
          height: 1686
        },
        selected: true,
        name: "写真復活 Processing Menu",
        chatBarText: "生成中...",
        areas: [
          {
            bounds: { x: 0, y: 0, width: 2500, height: 1686 },
            action: {
              type: "postback",
              label: "進捗確認",
              data: "action=status_check"
            }
          }
        ]
      };

      console.log('🎨 创建生成中Rich Menu...');
      const processingRichMenuId = await this.client.createRichMenu(processingRichMenu);
      console.log('✅ 生成中Rich Menu创建成功:', processingRichMenuId);

      // 设置Rich Menu
      await this.setupRichMenuImages(mainRichMenuId, processingRichMenuId);

      // 保存ID
      this.mainRichMenuId = mainRichMenuId;
      this.processingRichMenuId = processingRichMenuId;

      console.log('🎉 6按钮Rich Menu设置完成');
      return { mainRichMenuId, processingRichMenuId };
    } catch (error) {
      console.error('❌ Rich Menu设置失败:', error.message);
      throw error;
    }
  }

  // 设置Rich Menu图片
  async setupRichMenuImages(mainRichMenuId, processingRichMenuId) {
    try {
      console.log('📤 上传Rich Menu图片...');
      
      // 设置主菜单为默认
      await this.client.setDefaultRichMenu(mainRichMenuId);
      console.log('✅ 主菜单已设为默认');
      
      // 等待1秒确保菜单稳定
      await this.sleep(1000);
      
      // 上传图片
      await Promise.allSettled([
        this.uploadRichMenuImage(mainRichMenuId, 'main'),
        this.uploadRichMenuImage(processingRichMenuId, 'processing')
      ]);
      
      console.log('✅ Rich Menu图片设置完成');
    } catch (error) {
      console.warn('⚠️ 图片上传可能失败，但菜单结构已创建:', error.message);
    }
  }

  // 切换到生成中Rich Menu (静默模式)
  async switchToProcessingMenuSilent(userId) {
    try {
      if (!userId) {
        console.log('⚠️ 用户ID缺失');
        return false;
      }

      // 如果ID为空，尝试重新初始化
      if (!this.processingRichMenuId) {
        console.log('🔄 Rich Menu ID为空，重新初始化...');
        await this.initializeRichMenuIds();
      }

      if (!this.processingRichMenuId) {
        console.log('⚠️ 生成中Rich Menu ID仍未找到');
        return false;
      }

      await this.client.linkRichMenuToUser(userId, this.processingRichMenuId);
      console.log('🔄 已静默切换到生成中菜单:', this.processingRichMenuId);
      return true;
    } catch (error) {
      console.error('❌ 切换到生成中菜单失败:', error.message);
      return false;
    }
  }

  // 切换回主要Rich Menu
  async switchToMainMenu(userId) {
    try {
      if (!userId) {
        console.error('❌ 用户ID缺失');
        return false;
      }

      // 如果ID为空，尝试重新初始化
      if (!this.mainRichMenuId) {
        console.log('🔄 主菜单ID为空，重新初始化...');
        await this.initializeRichMenuIds();
      }

      if (!this.mainRichMenuId) {
        console.error('❌ 主菜单ID仍未找到');
        return false;
      }

      // 解绑当前菜单
      try {
        await this.client.unlinkRichMenuFromUser(userId);
      } catch (unlinkError) {
        console.log('⚠️ 解绑菜单失败（可能用户没有菜单）');
      }

      // 等待100ms后绑定主菜单
      await this.sleep(100);
      await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
      console.log('✅ 已切换回主菜单:', this.mainRichMenuId);
      return true;
    } catch (error) {
      console.error('❌ 切换回主菜单失败:', error.message);
      return false;
    }
  }

  // 为新用户设置主要Rich Menu
  async ensureUserHasRichMenu(userId) {
    try {
      // 如果ID为空，尝试重新初始化
      if (!this.mainRichMenuId) {
        console.log('🔄 主菜单ID为空，重新初始化...');
        await this.initializeRichMenuIds();
      }

      if (!this.mainRichMenuId) {
        console.log('⚠️  主要Rich Menu仍未找到');
        return false;
      }

      await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
      console.log('✅ 已为新用户设置主菜单:', this.mainRichMenuId);
      return true;
    } catch (error) {
      console.error('❌ 为用户设置Rich Menu失败:', error.message);
      return false;
    }
  }

  // 删除现有Rich Menu
  async deleteExistingRichMenus() {
    try {
      const richMenus = await this.client.getRichMenuList();
      console.log(`🗑️ 发现${richMenus.length}个现有Rich Menu`);
      
      for (const menu of richMenus) {
        await this.client.deleteRichMenu(menu.richMenuId);
        console.log(`🗑️ 已删除: ${menu.name}`);
      }
    } catch (error) {
      console.error('❌ 删除Rich Menu失败:', error.message);
    }
  }







  // 发送测试视频选项（核心功能，保留）
  async sendDemoVideos(userId) {
    try {
      console.log('🎁 发送测试视频选项给用户:', userId);
      
      const { trialPhotos } = require('../config/demo-trial-photos');
      
      const photoPreviewMessage = {
        type: 'flex',
        altText: '🎁 無料体験 - サンプル写真を選択',
        contents: {
          type: 'carousel',
          contents: trialPhotos.map(photo => ({
            type: 'bubble',
            hero: {
              type: 'image',
              url: photo.image_url,
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
                  text: photo.title || 'サンプル写真',
                  weight: 'bold',
                  size: 'md',
                  color: '#333333'
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
                    data: `action=demo_generate&photo_id=${photo.id}`
                  },
                  style: 'primary',
                  color: '#FF6B9D'
                }
              ]
            }
          }))
        }
      };
      
      await this.client.pushMessage(userId, [
        {
          type: 'text',
          text: '🎁 **無料体験をお試しください！**\n\n📸 下記のサンプル写真からお選びください：'
        },
        photoPreviewMessage
      ]);
      
      console.log('✅ 测试视频选项发送完成');
    } catch (error) {
      console.error('❌ 发送测试视频选项失败:', error);
      // 发送简化版本
      await this.client.pushMessage(userId, {
        type: 'text',
        text: '🎁 無料体験をご希望の場合は、下部メニューからお気軽にお選びください！'
      });
    }
  }



  // 发送消息（wrapper方法）
  async sendMessage(userId, text) {
    try {
      if (!userId || !text) {
        console.error('❌ sendMessage: 缺少必要参数');
        return false;
      }

      await this.client.pushMessage(userId, {
        type: 'text',
        text: text
      });
      return true;
    } catch (error) {
      console.error('❌ 消息发送失败:', error.message);
      return false;
    }
  }

  // 上传Rich Menu图片
  async uploadRichMenuImage(richMenuId, imageType) {
    try {
      // Full模式图片文件
      const imageFileName = imageType === 'main' ? 'richmenu-main-full.png' : 'richmenu-processing-full.png';
      const imagePath = path.join(__dirname, '..', 'assets', imageFileName);
      
      if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在: ${imagePath}`);
      }
      
      // 检查文件大小
      const stats = fs.statSync(imagePath);
      if (stats.size > 1024 * 1024) {
        throw new Error(`图片文件过大: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      const contentType = 'image/png';
      
      await this.client.setRichMenuImage(richMenuId, imageBuffer, contentType);
      console.log(`✅ ${imageType}图片上传成功 (${(stats.size / 1024).toFixed(2)}KB)`);
      return true;
    } catch (error) {
      console.error(`❌ ${imageType}图片上传失败:`, error.message);
      throw error;
    }
  }

  // 等待指定毫秒数
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 验证Rich Menu图片
  async validateRichMenuImages() {
    const images = [
      { name: 'main', path: path.join(__dirname, '../assets/richmenu-main-full.png') },
      { name: 'processing', path: path.join(__dirname, '../assets/richmenu-processing-full.png') }
    ];
    
    for (const image of images) {
      if (!fs.existsSync(image.path)) {
        console.error(`❌ ${image.name}图片不存在: ${image.path}`);
        return false;
      }
      
      const stats = fs.statSync(image.path);
      if (stats.size > 1024 * 1024) {
        console.error(`❌ ${image.name}图片过大: ${(stats.size / 1024).toFixed(2)}KB`);
        return false;
      }
    }
    
    console.log('✅ Rich Menu图片验证通过');
    return true;
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





  // 获取基础URL
  getBaseUrl() {
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000';
    }
    return 'https://line-photo-revival-bot.vercel.app';
  }
}

module.exports = LineBot; 