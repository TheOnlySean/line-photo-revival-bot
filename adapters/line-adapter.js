const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
// 直接從本地配置文件讀取 Rich Menu ID，避免每次呼叫 listRichMenu
const richMenuIds = require('../config/richmenu-ids.json');

// Updated: 2025-01-26 - 确保没有 Database 依赖

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

    // 直接設置 Rich Menu ID
    this.mainRichMenuId = richMenuIds.mainRichMenuId;
    this.processingRichMenuId = richMenuIds.processingRichMenuId;

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
  async pushMessage(userId, messages, retryCount = 0) {
     try {
       const messageArray = Array.isArray(messages) ? messages : [messages];
       await this.client.pushMessage(userId, messageArray);
     } catch (error) {
       console.error('❌ 发送推送消息失败:', error);
       // 429 Too Many Requests
       if (error.statusCode === 429 && retryCount < 3) {
         // LINE API 返回的 Retry-After 秒数（若有）
         const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '0', 10);
         // 基于重试次数的退避：10s, 30s, 60s
         const backoffMap = [10000, 30000, 60000];
         const delay = retryAfter > 0 ? retryAfter * 1000 : backoffMap[retryCount] || 60000;
         console.log(`🔄 429 速率限制，第 ${retryCount + 1} 次重试，${delay/1000}s 后再试...`);
         return new Promise((resolve, reject) => {
           setTimeout(async () => {
             try {
               await this.pushMessage(userId, messages, retryCount + 1);
               resolve();
             } catch (retryError) {
               reject(retryError);
             }
           }, delay);
         });
       }
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