const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

/**
 * LINE Adapter - 封装所有与LINE Messaging API的交互
 * 职责：Webhook处理、消息发送、Rich Menu管理、用户信息获取
 */
class LineAdapter {
  constructor() {
    this.client = new Client({
      channelAccessToken: lineConfig.channelAccessToken
    });
    
    // Rich Menu状态
    this.mainRichMenuId = null;
    this.processingRichMenuId = null;
    
    // Rich Menu ID初始化标志
    this.richMenuInitialized = false;
  }

  /**
   * Webhook签名验证
   */
  validateSignature(body, signature) {
    const crypto = require('crypto');
    const channelSecret = lineConfig.channelSecret;
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(body)
      .digest('base64');
    return hash === signature;
  }

  /**
   * 获取用户Profile
   */
  async getUserProfile(userId) {
    try {
      return await this.client.getProfile(userId);
    } catch (error) {
      console.error('❌ 获取用户Profile失败:', error);
      throw error;
    }
  }

  /**
   * 发送回复消息
   */
  async replyMessage(replyToken, messages) {
    try {
      const messageArray = Array.isArray(messages) ? messages : [messages];
      await this.client.replyMessage(replyToken, messageArray);
    } catch (error) {
      console.error('❌ 发送回复消息失败:', error);
      throw error;
    }
  }

  /**
   * 发送推送消息
   */
  async pushMessage(userId, messages) {
    try {
      const messageArray = Array.isArray(messages) ? messages : [messages];
      await this.client.pushMessage(userId, messageArray);
    } catch (error) {
      console.error('❌ 发送推送消息失败:', error);
      throw error;
    }
  }

  /**
   * 上传图片并获取URL
   */
  async uploadImage(messageId) {
    try {
      const ImageUploader = require('../services/image-uploader');
      const uploader = new ImageUploader();

      // 下載圖片內容
      const stream = await this.client.getMessageContent(messageId);

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 上傳到Vercel Blob並獲取URL
      return await uploader.uploadImage(buffer);
    } catch (error) {
      console.error('❌ 图片上传失败:', error);
      throw error;
    }
  }

  /**
   * Rich Menu管理
   */
  async initializeRichMenuIds() {
    try {
      if (this.richMenuInitialized) {
        return; // 已经初始化过了
      }

      console.log('🎨 初始化Rich Menu IDs...');
      const richMenus = await this.client.getRichMenuList();
      
      for (const menu of richMenus) {
        if (menu.name === "写真復活 Main Menu (6 Buttons)") {
          this.mainRichMenuId = menu.richMenuId;
          console.log('✅ 主菜单ID:', this.mainRichMenuId);
        } else if (menu.name === "写真復活 Processing Menu") {
          this.processingRichMenuId = menu.richMenuId;
          console.log('✅ 处理菜单ID:', this.processingRichMenuId);
        }
      }
      
      this.richMenuInitialized = true;
      console.log('✅ Rich Menu初始化完成');
    } catch (error) {
      console.error('❌ 初始化Rich Menu ID失败:', error);
    }
  }

  async switchToMainMenu(userId) {
    try {
      // 确保Rich Menu ID已初始化
      await this.initializeRichMenuIds();
      
      if (this.mainRichMenuId) {
        await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
        console.log('✅ 切换到主菜单成功:', userId);
        return true;
      } else {
        console.error('❌ 主菜单ID未找到');
        return false;
      }
    } catch (error) {
      console.error('❌ 切换到主菜单失败:', error);
      return false;
    }
  }

  async switchToProcessingMenu(userId) {
    try {
      // 确保Rich Menu ID已初始化
      await this.initializeRichMenuIds();
      
      if (this.processingRichMenuId) {
        await this.client.linkRichMenuToUser(userId, this.processingRichMenuId);
        console.log('✅ 切换到处理菜单成功:', userId);
        return true;
      } else {
        console.error('❌ 处理菜单ID未找到');
        return false;
      }
    } catch (error) {
      console.error('❌ 切换到处理中菜单失败:', error);
      return false;
    }
  }

  async ensureUserHasRichMenu(userId) {
    try {
      // 确保Rich Menu ID已初始化
      await this.initializeRichMenuIds();
      
      if (this.mainRichMenuId) {
        await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
        console.log('✅ 用户Rich Menu设置成功:', userId);
        return true;
      } else {
        console.error('❌ 主菜单ID未找到');
        return false;
      }
    } catch (error) {
      console.error('❌ 设置用户Rich Menu失败:', error);
      return false;
    }
  }

  /**
   * Quick Reply模板
   */
  createPhotoUploadQuickReply(text = '📸 写真のアップロード方法を選択してください：') {
    return {
      type: 'text',
      text: text,
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
              label: '🖼️ アルバムから選択'
            }
          }
        ]
      }
    };
  }

  /**
   * 获取Rich Menu状态
   */
  getRichMenuStatus() {
    return {
      mainRichMenuId: this.mainRichMenuId,
      processingRichMenuId: this.processingRichMenuId,
      initialized: !!(this.mainRichMenuId && this.processingRichMenuId)
    };
  }

  /**
   * 解析Postback数据
   */
  parsePostbackData(data) {
    if (data.startsWith('action=') && !data.includes('&')) {
      return { action: data.substring(7) };
    }
    
    try {
      const params = new URLSearchParams(data);
      const result = {};
      for (const [key, value] of params) {
        result[key] = decodeURIComponent(value);
      }
      return result;
    } catch (error) {
      return { action: data };
    }
  }
}

module.exports = LineAdapter; 