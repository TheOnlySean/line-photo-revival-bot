const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const db = require('../config/database');
const LineBot = require('../services/line-bot');
const MessageHandler = require('../services/message-handler');

// 初始化 LINE SDK 客户端
const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret,
});

// 初始化业务层
const lineBot = new LineBot(client, db);
const messageHandler = new MessageHandler(client, db, lineBot);

/**
 * 通用事件分发器（从 server.js 拷贝并精简）
 */
async function handleEvent(event) {
  try {
    if (!event || !event.type) return;
    switch (event.type) {
      case 'follow':
        return messageHandler.handleFollow?.(event);
      case 'unfollow':
        return messageHandler.handleUnfollow?.(event);
      case 'message':
        return messageHandler.handleMessage?.(event);
      case 'postback':
        return messageHandler.handlePostback?.(event);
      default:
        console.log('未知事件类型:', event.type);
    }
  } catch (err) {
    console.error('处理事件出错:', err);
  }
}

/**
 * Vercel Serverless Function 入口
 * 需要在 LINE Developers Console 将 Webhook URL 设置为：
 * https://<project>.vercel.app/api/webhook
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  // LINE 平台发送的 JSON
  const body = req.body || {};
  const events = body.events || [];
  // 并行处理所有事件
  await Promise.all(events.map(handleEvent));
  res.status(200).json({ success: true });
}; 