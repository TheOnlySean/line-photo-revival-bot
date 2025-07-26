const EventHandler = require('../../handlers/event-handler');

/**
 * EventHandler测试端点 - 诊断重构后的事件处理问题
 */
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 开始EventHandler诊断测试');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // 测试1: EventHandler初始化
    try {
      const eventHandler = new EventHandler();
      diagnostics.tests.eventHandlerInit = {
        success: true,
        message: 'EventHandler初始化成功'
      };
      
      // 测试2: 依赖检查
      diagnostics.tests.dependencies = {
        hasLineAdapter: !!eventHandler.lineAdapter,
        hasVideoService: !!eventHandler.videoService,
        hasUserService: !!eventHandler.userService,
        success: true
      };

      // 测试3: 模拟Postback事件
      const mockEvent = {
        type: 'postback',
        replyToken: 'test-reply-token',
        source: { userId: 'test-user-id' },
        postback: { data: 'action=WAVE_VIDEO' }
      };

      try {
        // 注意：这里不会真正发送消息，只是测试处理逻辑
        console.log('🔧 测试模拟事件处理...');
        
        // 测试LineAdapter功能
        const lineAdapter = eventHandler.lineAdapter;
        const parsedData = lineAdapter.parsePostbackData(mockEvent.postback.data);
        
        diagnostics.tests.postbackParsing = {
          success: true,
          parsedData: parsedData,
          message: 'Postback数据解析成功'
        };

      } catch (eventError) {
        diagnostics.tests.eventHandling = {
          success: false,
          error: eventError.message,
          stack: eventError.stack
        };
      }

    } catch (initError) {
      diagnostics.tests.eventHandlerInit = {
        success: false,
        error: initError.message,
        stack: initError.stack
      };
    }

    // 测试4: 数据库连接
    try {
      const db = require('../../config/database');
      const testQuery = await db.query('SELECT 1 as test');
      diagnostics.tests.database = {
        success: true,
        connected: true,
        testResult: testQuery.rows[0]
      };
    } catch (dbError) {
      diagnostics.tests.database = {
        success: false,
        connected: false,
        error: dbError.message
      };
    }

    // 测试5: LINE配置检查
    try {
      const lineConfig = require('../../config/line-config');
      diagnostics.tests.lineConfig = {
        success: true,
        hasChannelAccessToken: !!lineConfig.channelAccessToken,
        hasChannelSecret: !!lineConfig.channelSecret,
        hasKieAiConfig: !!lineConfig.kieAi
      };
    } catch (configError) {
      diagnostics.tests.lineConfig = {
        success: false,
        error: configError.message
      };
    }

    const successCount = Object.values(diagnostics.tests).filter(test => test.success).length;
    const totalTests = Object.keys(diagnostics.tests).length;

    console.log(`✅ EventHandler诊断完成: ${successCount}/${totalTests} 测试通过`);

    res.status(200).json({
      success: true,
      message: `EventHandler诊断完成: ${successCount}/${totalTests} 测试通过`,
      diagnostics: diagnostics
    });

  } catch (error) {
    console.error('❌ EventHandler诊断失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}; 