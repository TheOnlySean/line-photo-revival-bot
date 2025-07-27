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

// ---- 全局推送队列：确保 <= 60 req/min ----
// 简单延迟控制，适合serverless环境
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 记录上次API调用时间，确保间隔
if (!global._lastApiCall) {
  global._lastApiCall = 0;
}

async function rateLimitedApiCall(apiCall) {
  const now = Date.now();
  const timeSinceLastCall = now - global._lastApiCall;
  const minInterval = 1200; // 1.2秒间隔，≈50 req/min
  
  if (timeSinceLastCall < minInterval) {
    const waitTime = minInterval - timeSinceLastCall;
    console.log(`⏳ API调用间隔控制，等待 ${waitTime}ms`);
    await sleep(waitTime);
  }
  
  global._lastApiCall = Date.now();
  return await apiCall();
}

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
  async pushMessage(userId, messages) {
    return await rateLimitedApiCall(async () => {
      try {
        const messageArray = Array.isArray(messages) ? messages : [messages];
        const res = await this.client.pushMessage(userId, messageArray);
        console.log('✅ pushMessage success:', { userId });
        return res;
      } catch (error) {
        console.error('❌ pushMessage failed:', error);
        throw error;
      }
    });
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
    return await rateLimitedApiCall(async () => {
      try {
        await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
        console.log('✅ 切换到主菜单成功:', userId);
        return true;
      } catch (error) {
        console.error('❌ 切换到主菜单失败:', error);
        throw error;
      }
    });
  }

  async switchToProcessingMenu(userId) {
    return await rateLimitedApiCall(async () => {
      try {
        await this.client.linkRichMenuToUser(userId, this.processingRichMenuId);
        console.log('✅ 切换到处理菜单成功:', userId);
        return true;
      } catch (error) {
        console.error('❌ 切换到处理菜单失败:', error);
        throw error;
      }
    });
  }

  async ensureUserHasRichMenu(userId) {
    return await rateLimitedApiCall(async () => {
      try {
        await this.client.linkRichMenuToUser(userId, this.mainRichMenuId);
        console.log('✅ 用户Rich Menu设置成功:', userId);
        return true;
      } catch (error) {
        console.error('❌ 设置用户Rich Menu失败:', error);
        throw error;
      }
    });
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