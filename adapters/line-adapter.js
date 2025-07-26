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
    
    // 初始化Rich Menu ID
    this.initializeRichMenuIds();
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
      const imageUploader = require('../services/image-uploader');
      return await imageUploader.uploadImage(messageId, this.client);
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
      const richMenus = await this.client.getRichMenuList();
      
      for (const menu of richMenus) {
        if (menu.name === "写真復活 Main Menu (6 Buttons)") {
          this.mainRichMenuId = menu.richMenuId;
        } else if (menu.name === "写真復活 Processing Menu") {
          this.processingRichMenuId = menu.richMenuId;
        }
      }
    } catch (error) {
      console.error('❌ 初始化Rich Menu ID失败:', error);
    }
  }

  async switchToMainMenu(userId) {
    try {
      if (!this.mainRichMenuId) {
        await this.initializeRichMenuIds();
      }
      
      if (this.mainRichMenuId) {
        await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ 切换到主菜单失败:', error);
      return false;
    }
  }

  async switchToProcessingMenu(userId) {
    try {
      if (!this.processingRichMenuId) {
        await this.initializeRichMenuIds();
      }
      
      if (this.processingRichMenuId) {
        await this.client.linkRichMenuToUser(userId, this.processingRichMenuId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ 切换到处理中菜单失败:', error);
      return false;
    }
  }

  async ensureUserHasRichMenu(userId) {
    try {
      if (!this.mainRichMenuId) {
        await this.initializeRichMenuIds();
      }
      
      if (this.mainRichMenuId) {
        await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
        return true;
      }
      return false;
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