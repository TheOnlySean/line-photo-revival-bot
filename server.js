const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const cors = require('cors');

const lineConfig = require('./config/line-config');
const db = require('./config/database');
const LineBot = require('./services/line-bot');
const MessageHandler = require('./services/message-handler');

const app = express();

// LINE Bot SDK配置
const config = {
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken,
};

// 创建LINE客户端
const client = new line.Client(config);

// 创建LINE Bot实例
const lineBot = new LineBot(client, db);
const messageHandler = new MessageHandler(client, db, lineBot);

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'LINE Bot - 写真復活',
    timestamp: new Date().toISOString()
  });
});

// LINE webhook端点
app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('🔔 收到webhook请求:', JSON.stringify(req.body, null, 2));
  
  try {
    // 检查请求体是否有效
    if (!req.body || !req.body.events) {
      console.error('❌ 无效的webhook请求体');
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // 处理事件
    Promise
      .all(req.body.events.map(handleEvent))
      .then(() => {
        console.log('✅ Webhook处理成功');
        res.status(200).end();
      })
      .catch((err) => {
        console.error('❌ Webhook处理错误:', err);
        console.error('❌ 错误堆栈:', err.stack);
        res.status(500).json({ 
          error: 'Internal Server Error',
          message: '服务器内部错误'
        });
      });
  } catch (error) {
    console.error('❌ Webhook同步错误:', error);
    console.error('❌ 错误堆栈:', error.stack);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

// 事件处理器
async function handleEvent(event) {
  console.log('🎯 处理事件:', event.type, event);
  
  try {
    switch (event.type) {
      case 'follow':
        await messageHandler.handleFollow(event);
        break;
        
      case 'unfollow':
        await messageHandler.handleUnfollow(event);
        break;
        
      case 'message':
        await messageHandler.handleMessage(event);
        break;
        
      case 'postback':
        await messageHandler.handlePostback(event);
        break;
        
      default:
        console.log('⚠️ 未知事件类型:', event.type);
        break;
    }
  } catch (error) {
    console.error('❌ 事件处理错误:', error);
    
    // 发送错误消息给用户
    if (event.replyToken) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '❌ 处理请求时发生错误，请稍后再试'
      });
    }
  }
}

// Rich Menu管理端点
app.get('/api/rich-menu/setup', async (req, res) => {
  try {
    const menuId = await lineBot.setupRichMenu();
    res.json({ success: true, richMenuId: menuId });
  } catch (error) {
    console.error('❌ Rich Menu设置错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 演示内容管理端点
app.get('/api/demo-contents', async (req, res) => {
  try {
    const contents = await db.getDemoContents();
    res.json({ success: true, contents });
  } catch (error) {
    console.error('❌ 获取演示内容错误:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/demo-contents', async (req, res) => {
  try {
    const { title, imageUrl, videoUrl, description, sortOrder } = req.body;
    const content = await db.insertDemoContent(title, imageUrl, videoUrl, description, sortOrder);
    res.json({ success: true, content });
  } catch (error) {
    console.error('❌ 创建演示内容错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rich Menu设置端点
app.post('/api/setup-rich-menu', async (req, res) => {
  try {
    const richMenuId = await lineBot.setupRichMenu();
    res.json({
      success: true,
      richMenuId: richMenuId,
      message: 'Rich Menu设置成功'
    });
  } catch (error) {
    console.error('❌ 设置Rich Menu失败:', error);
    res.status(500).json({
      success: false,
      error: '设置Rich Menu失败: ' + error.message
    });
  }
});

// 用户统计端点
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN auth_provider = 'line' THEN 1 END) as line_users,
        SUM(credits) as total_credits,
        SUM(videos_generated) as total_videos
      FROM users
    `);
    
    res.json({ success: true, stats: stats.rows[0] });
  } catch (error) {
    console.error('❌ 获取统计数据错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('❌ 全局错误处理器:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: '请求的资源不存在'
  });
});

// 启动服务器
const PORT = lineConfig.port;
app.listen(PORT, async () => {
  console.log('🚀 LINE Bot服务器启动成功!');
  console.log(`📡 端口: ${PORT}`);
  console.log(`🔗 Webhook URL: ${lineConfig.webhookUrl}`);
  console.log(`🤖 LINE Channel ID: ${lineConfig.channelId}`);
  
  // 测试数据库连接
  try {
    await db.query('SELECT 1');
    console.log('✅ 数据库连接测试成功');
  } catch (error) {
    console.error('❌ 数据库连接测试失败:', error.message);
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('📴 收到SIGTERM信号，正在关闭服务器...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 收到SIGINT信号，正在关闭服务器...');
  await db.close();
  process.exit(0);
}); 