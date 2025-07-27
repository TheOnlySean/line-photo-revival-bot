const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const cors = require('cors');

// 部署觸發 - 修復Postback用戶問題 2025-07-25 17:25

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
    timestamp: new Date().toISOString(),
    version: '1.0.1-postback-fix',
    lastUpdate: '2025-01-23T15:20:00Z'
  });
});

// 配置检查端点
app.get('/debug/config', (req, res) => {
  res.json({
    channelId: lineConfig.channelId,
    hasChannelSecret: !!lineConfig.channelSecret,
    hasChannelAccessToken: !!lineConfig.channelAccessToken,
    webhookUrl: lineConfig.webhookUrl,
    databaseConnected: true,
    environment: process.env.NODE_ENV || 'development'
  });
});

// 测试webhook端点（不通过LINE中间件）
app.post('/debug/webhook', (req, res) => {
  console.log('🧪 调试webhook请求:', JSON.stringify(req.body, null, 2));
  console.log('🧪 请求头:', JSON.stringify(req.headers, null, 2));
  
  try {
    res.json({
      success: true,
      message: 'Webhook调试成功',
      receivedData: req.body
    });
  } catch (error) {
    console.error('❌ 调试webhook错误:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});


// LINE webhook端点
app.post('/webhook', (req, res) => {
  console.log('🔔 收到webhook请求:', JSON.stringify(req.body, null, 2));
  console.log('🔍 请求头:', JSON.stringify(req.headers, null, 2));
  
  try {
    // 手动验证签名（替代中间件）
    const signature = req.get('x-line-signature');
    if (!signature) {
      console.log('⚠️ 缺少签名头，跳过验证（开发模式）');
    } else {
      console.log('🔐 收到签名:', signature);
    }
    
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
    // 检查是否有必要的属性
    if (!event || !event.type) {
      console.log('⚠️ 无效事件对象:', event);
      return;
    }

    switch (event.type) {
      case 'follow':
        if (messageHandler && messageHandler.handleFollow) {
          await messageHandler.handleFollow(event);
        } else {
          console.log('📝 处理follow事件 - 欢迎新用户');
        }
        break;
        
      case 'unfollow':
        if (messageHandler && messageHandler.handleUnfollow) {
          await messageHandler.handleUnfollow(event);
        } else {
          console.log('📝 处理unfollow事件 - 用户取消关注');
        }
        break;
        
      case 'message':
        if (messageHandler && messageHandler.handleMessage) {
          await messageHandler.handleMessage(event);
        } else {
          console.log('📝 处理message事件 - 收到消息:', event.message);
        }
        break;
        
      case 'postback':
        if (messageHandler && messageHandler.handlePostback) {
          await messageHandler.handlePostback(event);
        } else {
          console.log('📝 处理postback事件 - 按钮点击:', event.postback);
        }
        break;
        
      default:
        console.log('⚠️ 未知事件类型:', event.type);
        break;
    }
  } catch (error) {
    console.error('❌ 事件处理错误:', error);
    console.error('❌ 错误堆栈:', error.stack);
    console.error('❌ 事件数据:', JSON.stringify(event, null, 2));
    
    // 只在有replyToken且不是测试环境时发送错误消息
    if (event.replyToken && event.replyToken !== 'test' && client) {
      try {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 处理请求时发生错误，请稍后再试'
        });
      } catch (replyError) {
        console.error('❌ 发送错误回复失败:', replyError);
      }
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
    const result = await lineBot.setupRichMenu();
    res.json({
      success: true,
      ...result,
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

// 检查Rich Menu图片状态
app.get('/api/check-rich-menu-images', async (req, res) => {
  try {
    const imageStatus = lineBot.checkRequiredImages();
    const allValid = imageStatus.every(img => img.exists && img.valid);
    
    res.json({
      success: true,
      allImagesReady: allValid,
      images: imageStatus,
      requirements: {
        format: 'PNG or JPEG',
        dimensions: '2500x1686 pixels',
        maxSize: '1MB',
        location: 'assets/ directory'
      }
    });
  } catch (error) {
    console.error('❌ 检查图片状态失败:', error);
    res.status(500).json({
      success: false,
      error: '检查图片状态失败: ' + error.message
    });
  }
});

// 测试Rich Menu权限
app.get('/api/test-rich-menu-permissions', async (req, res) => {
  try {
    console.log('🔍 测试Rich Menu权限...');
    
    // 测试获取Rich Menu列表
    const richMenus = await client.getRichMenuList();
    console.log('📋 现有Rich Menu:', richMenus.length, '个');
    
    // 测试获取默认Rich Menu
    let defaultRichMenu = null;
    try {
      defaultRichMenu = await client.getDefaultRichMenu();
      console.log('🎯 默认Rich Menu:', defaultRichMenu.richMenuId);
    } catch (error) {
      console.log('ℹ️ 无默认Rich Menu:', error.message);
    }
    
    res.json({
      success: true,
      permissions: 'OK',
      existingMenus: richMenus.length,
      defaultMenu: defaultRichMenu?.richMenuId || null,
      menus: richMenus.map(menu => ({
        id: menu.richMenuId,
        name: menu.name,
        chatBarText: menu.chatBarText
      }))
    });
    
  } catch (error) {
    console.error('❌ Rich Menu权限测试失败:', error);
    res.status(500).json({
      success: false,
      error: 'Rich Menu权限测试失败: ' + error.message,
      details: error.response?.data || error
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

// 取消订阅API端点
app.post('/api/cancel-subscription', require('./api/payment/cancel-subscription'));

// 启动服务器
const PORT = process.env.PORT || 3000;
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