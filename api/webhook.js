const EventHandler = require('../handlers/event-handler');
const LineAdapter = require('../adapters/line-adapter');

// 调试用：记录最近的事件
async function recordEventForDebugging(events) {
  try {
    // 简单的内存记录（仅用于调试）
    global.recentLineEvents = global.recentLineEvents || [];
    const timestamp = new Date().toISOString();
    
    events.forEach(event => {
      global.recentLineEvents.unshift({
        ...event,
        receivedAt: timestamp
      });
    });
    
    // 只保留最近20个事件
    global.recentLineEvents = global.recentLineEvents.slice(0, 20);
    
    console.log(`📝 记录了 ${events.length} 个事件，类型: ${events.map(e => e.type).join(', ')}`);
  } catch (error) {
    console.error('记录事件失败:', error);
  }
}

/**
 * Webhook处理器 - 使用分层架构处理LINE Webhook事件
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔔 Webhook被调用:', new Date().toISOString());

    // 1. 验证签名（LINE Adapter负责）
    const lineAdapter = new LineAdapter();
    const body = JSON.stringify(req.body);
    const signature = req.headers['x-line-signature'];
    
    if (!lineAdapter.validateSignature(body, signature)) {
      console.error('❌ 签名验证失败');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. 解析事件
    const events = req.body.events;
    if (!events || !Array.isArray(events)) {
      console.log('⚠️ 没有事件数据');
      return res.status(200).json({ success: true, message: 'No events' });
    }

    // 3. 记录事件用于调试
    await recordEventForDebugging(events);

    // 3. 初始化事件处理器
    const eventHandler = new EventHandler();

    // 4. 处理每个事件
    const results = [];
    for (const event of events) {
      try {
        console.log(`📋 处理事件类型: ${event.type}`);
        
        let result;
        switch (event.type) {
          case 'follow':
            result = await eventHandler.handleFollow(event);
            break;
            
          case 'message':
            switch (event.message.type) {
              case 'text':
                result = await eventHandler.handleTextMessage(event);
                break;
              case 'image':
                result = await eventHandler.handleImageMessage(event);
                break;
              case 'video':
              case 'audio':
              case 'file':
                // 處理非圖片文件，提醒用戶上傳圖片
                result = await eventHandler.handleNonImageFile(event);
                break;
              default:
                console.log(`⚠️ 不支持的消息类型: ${event.message.type}`);
                result = { success: true, skipped: true };
                break;
            }
            break;
            
          case 'postback':
            result = await eventHandler.handlePostback(event);
            break;
            
          case 'unfollow':
            console.log('👋 用户取消关注:', event.source.userId);
            result = { success: true, message: 'User unfollowed' };
            break;
            
          default:
            console.log(`⚠️ 不支持的事件类型: ${event.type}`);
            result = { success: true, skipped: true };
            break;
        }
        
        results.push({
          eventType: event.type,
          messageType: event.message?.type,
          userId: event.source?.userId,
          result: result
        });
        
      } catch (eventError) {
        console.error(`❌ 处理事件失败 (${event.type}):`, eventError);
        results.push({
          eventType: event.type,
          userId: event.source?.userId,
          result: { success: false, error: eventError.message }
        });
      }
    }

    // 5. 返回处理结果
    const successCount = results.filter(r => r.result.success).length;
    const totalCount = results.length;
    
    console.log(`✅ Webhook处理完成: ${successCount}/${totalCount} 成功`);
    
    res.status(200).json({
      success: true,
      message: `Processed ${totalCount} events, ${successCount} successful`,
      results: process.env.NODE_ENV === 'development' ? results : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Webhook处理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 