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
    console.log('🎯 处理事件:', event.type, event);
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
 */
module.exports = async function handler(req, res) {
  console.log('🔔 Webhook被调用:', req.method, req.url);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Line-Signature');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  
  try {
    console.log('📦 Request body:', req.body);
    
    // LINE 平台发送的 JSON
    const body = req.body || {};
    const events = body.events || [];
    
    console.log(`📨 收到 ${events.length} 个事件`);
    
    // 并行处理所有事件
    await Promise.all(events.map(handleEvent));
    
    console.log('✅ 事件处理完成');
    res.status(200).json({ success: true, eventsProcessed: events.length });
  } catch (error) {
    console.error('❌ Webhook处理错误:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
} 