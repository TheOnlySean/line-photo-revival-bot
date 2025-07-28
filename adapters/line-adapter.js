const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const fs = require('fs');
const path = require('path');

// 根据环境加载正确的Rich Menu配置
function loadRichMenuConfig() {
  const environment = process.env.NODE_ENV || 'development';
  
  try {
    if (environment === 'production') {
      // 尝试加载生产环境配置
      const productionConfigPath = path.join(__dirname, '..', 'config', 'richmenu-ids-production.json');
      if (fs.existsSync(productionConfigPath)) {
        console.log('🔴 使用生产环境Rich Menu配置');
        return require('../config/richmenu-ids-production.json');
      }
    }
    
    // 默认使用开发环境配置
    console.log('🟡 使用开发环境Rich Menu配置');
    return require('../config/richmenu-ids.json');
    
  } catch (error) {
    console.error('❌ 加载Rich Menu配置失败:', error);
    // 回退到硬编码的生产环境ID
    if (environment === 'production') {
      console.log('🔄 使用硬编码的生产环境Rich Menu ID');
      return {
        mainRichMenuId: 'richmenu-31f0120a68cf4e4cfb7b4029d7308b39',
        processingRichMenuId: 'richmenu-f0083edd35a1b15ba95869b3f10cab71'
      };
    }
    throw error;
  }
}

// 加载Rich Menu配置
const richMenuConfig = loadRichMenuConfig();

// 全局 Line Client，可在 Vercel container 重用，減少冷啟開銷
const globalLineClient = global._cachedLineClient || new Client({
  channelAccessToken: lineConfig.channelAccessToken
});
global._cachedLineClient = globalLineClient;

/**
 * LINE Adapter - 封装所有与LINE Messaging API的交互
 * 职责：Webhook处理、消息发送、Rich Menu管理、用户信息获取
 */
class LineAdapter {
  constructor() {
    // 使用全局 client
    this.client = globalLineClient;

    // 根据环境设置Rich Menu ID
    this.mainRichMenuId = richMenuConfig.mainRichMenuId;
    this.processingRichMenuId = richMenuConfig.processingRichMenuId;
    
    console.log(`📋 Rich Menu配置 (${process.env.NODE_ENV || 'development'}):`, {
      main: this.mainRichMenuId,
      processing: this.processingRichMenuId
    });

    // 已初始化
    this.richMenuInitialized = true;
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
      const res = await this.client.pushMessage(userId, messageArray);
      console.log('✅ pushMessage success:', { userId });
      return res;
    } catch (error) {
      console.error('❌ pushMessage failed:', error);
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
    // 由於 ID 已經固定，這裡僅做一次日誌輸出
    if (this.richMenuInitialized) return;
    console.log('🎨 Rich Menu ID 已透過配置文件載入');
    this.richMenuInitialized = true;
  }

  async switchToMainMenu(userId) {
    try {
      await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
      console.log('✅ 切换到主菜单成功:', userId);
      return true;
    } catch (error) {
      console.error('❌ 切换到主菜单失败:', error);
      throw error;
    }
  }

  async switchToProcessingMenu(userId) {
    try {
      await this.client.linkRichMenuToUser(userId, this.processingRichMenuId);
      console.log('✅ 切换到处理菜单成功:', userId);
      return true;
    } catch (error) {
      console.error('❌ 切换到处理菜单失败:', error);
      throw error;
    }
  }

  async ensureUserHasRichMenu(userId) {
    try {
      await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
      console.log('✅ 用户Rich Menu设置成功:', userId);
      return true;
    } catch (error) {
      console.error('❌ 设置用户Rich Menu失败:', error);
      throw error;
    }
  }

  /**
   * Quick Reply模板 - 仅照片上传（用于揮手和寄り添い）
   */
  createPhotoOnlyQuickReply(text = '📸 写真のアップロード方法を選択してください：') {
    return {
      type: 'text',
      text: text,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'camera',
              label: '📷 撮影'
            }
          },
          {
            type: 'action',
            action: {
              type: 'cameraRoll',
              label: '🖼️ アルバム'
            }
          }
        ]
      }
    };
  }

  /**
   * Quick Reply模板 - 包含"写真なし"选项（用于个性化）
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
              label: '📷 撮影'
            }
          },
          {
            type: 'action',
            action: {
              type: 'cameraRoll',
              label: '🖼️ アルバム'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '❌ 写真なし',
              data: 'action=NO_PHOTO'
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