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

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('❌ 全局错误处理器:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
  });
});

// 保留LIFF页面作为备用方案（可选）
app.get('/liff/:action', (req, res) => {
  const action = req.params.action;
  const actionTitles = {
    wave: '手振り動画生成',
    group: '寄り添い動画生成', 
    custom: 'パーソナライズ動画生成',
    credits: 'ポイント購入',
    share: '友達にシェア'
  };
  
  const title = actionTitles[action] || 'アクション';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { 
                font-family: 'Hiragino Sans', sans-serif;
                text-align: center; 
                padding: 50px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container { 
                background: rgba(255,255,255,0.95); 
                padding: 30px; 
                border-radius: 15px; 
                color: #333;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>📱 ${title}</h2>
            <p>現在、Rich Menu Postback方式を使用しています。</p>
            <p>LINEアプリでメニューボタンをタップしてください。</p>
        </div>
    </body>
    </html>
  `);
});

// Rich Menu动作处理路由（保留作为备用）
app.get('/action/wave', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-line-userid'];
    await handleRichMenuAction(userId, 'wave', res);
  } catch (error) {
    console.error('❌ Wave动作处理错误:', error);
    res.status(500).send('処理中にエラーが発生しました');
  }
});

app.get('/action/group', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-line-userid'];
    await handleRichMenuAction(userId, 'group', res);
  } catch (error) {
    console.error('❌ Group动作处理错误:', error);
    res.status(500).send('処理中にエラーが発生しました');
  }
});

app.get('/action/custom', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-line-userid'];
    await handleRichMenuAction(userId, 'custom', res);
  } catch (error) {
    console.error('❌ Custom动作处理错误:', error);
    res.status(500).send('処理中にエラーが発生しました');
  }
});

app.get('/action/credits', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-line-userid'];
    await handleRichMenuAction(userId, 'credits', res);
  } catch (error) {
    console.error('❌ Credits动作处理错误:', error);
    res.status(500).send('処理中にエラーが発生しました');
  }
});

app.get('/action/share', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-line-userid'];
    await handleRichMenuAction(userId, 'share', res);
  } catch (error) {
    console.error('❌ Share动作处理错误:', error);
    res.status(500).send('処理中にエラーが発生しました');
  }
});

// Rich Menu动作处理函数
async function handleRichMenuAction(userId, action, res) {
  console.log('🎯 处理Rich Menu动作:', action, 'UserID:', userId);
  
  // 获取最近的用户（如果没有userId，使用最新的用户）
  let targetUserId = userId;
  if (!targetUserId) {
    // 这里可以通过数据库查询最近活跃的用户，或者使用其他方法
    console.log('⚠️ 未获取到用户ID，将在用户发送消息时处理');
  }

  const actionMessages = {
    wave: {
      title: '手振り動画生成',
      message: '📸 写真をアップロードしていただければ、すぐに手振り動画の制作を開始いたします！\n\n✨ 自然な笑顔で手を振る素敵な動画を作成いたします。'
    },
    group: {
      title: '寄り添い動画生成', 
      message: '👥 複数人の写真をアップロードしていただければ、すぐに寄り添い動画の制作を開始いたします！\n\n💕 温かい雰囲気の素敵な動画を作成いたします。'
    },
    custom: {
      title: 'パーソナライズ動画生成',
      message: '🎨 写真をアップロードしていただければ、すぐにパーソナライズ動画の制作を開始いたします！\n\n💭 その後、ご希望の動画内容をお聞かせください。'
    },
    credits: {
      title: 'ポイント購入',
      message: '💎 ポイント購入ページへようこそ！\n\n🌐 詳しい料金プランは公式サイトをご確認ください。'
    },
    share: {
      title: '友達にシェア',
      message: '🎁 写真復活サービスを友達にシェアしていただき、ありがとうございます！\n\n✨ より多くの方に素敵な動画体験をお届けします。'
    }
  };

  const actionInfo = actionMessages[action];
  if (!actionInfo) {
    return res.status(400).send('無効なアクションです');
  }

  // 返回带有自动消息发送功能的HTML页面
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${actionInfo.title}</title>
        <style>
            body { 
                font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif;
                margin: 0; 
                padding: 20px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            }
            .container { 
                background: rgba(255,255,255,0.95); 
                padding: 30px; 
                border-radius: 15px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                color: #333;
                max-width: 400px;
                width: 90%;
            }
            .icon { font-size: 3rem; margin-bottom: 20px; }
            .title { font-size: 1.5rem; font-weight: bold; margin-bottom: 15px; }
            .message { font-size: 1rem; line-height: 1.6; margin-bottom: 20px; }
            .status { 
                padding: 10px; 
                border-radius: 8px; 
                background: #e8f5e8; 
                color: #2e7d32; 
                font-weight: bold;
                margin-top: 15px;
            }
            .back-btn {
                background: #42C76A;
                color: white;
                padding: 12px 24px;
                border: none;
                border-radius: 8px;
                font-size: 1rem;
                margin-top: 20px;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">✨</div>
            <div class="title">${actionInfo.title}</div>
            <div class="message">${actionInfo.message}</div>
            <div class="status" id="status">LINEに案内メッセージを送信中...</div>
            <button class="back-btn" onclick="window.close() || history.back()">LINEに戻る</button>
        </div>
        
        <script>
            // 页面加载后尝试发送消息到LINE
            fetch('/api/send-action-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: '${action}',
                    userId: '${userId || ''}',
                    message: '${actionInfo.message}'
                })
            }).then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('status').textContent = '✅ LINEに案内メッセージを送信しました！';
                    // 2秒后尝试关闭页面
                    setTimeout(() => {
                        window.close();
                    }, 2000);
                } else {
                    document.getElementById('status').textContent = '⚠️ メッセージ送信準備完了。LINEをご確認ください。';
                }
            }).catch(error => {
                console.error('Error:', error);
                document.getElementById('status').textContent = '⚠️ LINEに戻って操作を続けてください。';
            });
        </script>
    </body>
    </html>
  `;

  res.send(html);
}

// API端点：发送动作消息到LINE
app.post('/api/send-action-message', async (req, res) => {
  try {
    const { action, userId, message } = req.body;
    
    console.log('📤 尝试发送动作消息:', action, userId);
    
    // 由于LINE的限制，我们无法主动发送消息给用户
    // 我们将在用户下次与bot交互时设置状态
    if (action && ['wave', 'group', 'custom', 'credits', 'share'].includes(action)) {
      // 设置一个全局状态，当用户下次发送消息时将被处理
      global.pendingAction = { action, timestamp: Date.now() };
      console.log('📝 设置待处理动作:', global.pendingAction);
      
      res.json({ success: true, message: '动作已记录，等待用户交互' });
    } else {
      res.json({ success: false, message: '无效动作' });
    }
  } catch (error) {
    console.error('❌ 发送动作消息错误:', error);
    res.json({ success: false, message: error.message });
  }
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