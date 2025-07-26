const db = require('../../config/database');
const VideoGenerator = require('../../services/video-generator');
const lineConfig = require('../../config/line-config');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

    try {
    console.log('🧪 开始视频生成诊断测试...');
    
    // 测试数据
    const testData = {
      testImageUrl: 'https://example.com/test-image.jpg',
      testPrompt: 'gentle waving motion with warm smile'
    };
    
    console.log('📋 测试数据:', testData);
    
    // 1. 测试KIE.ai配置
    const kieConfig = lineConfig.kieAi;
    const diagnostics = {
      timestamp: new Date().toISOString(),
      kieAi: {
        hasApiKey: !!kieConfig.apiKey,
        apiKeyLength: kieConfig.apiKey ? kieConfig.apiKey.length : 0,
        baseUrl: kieConfig.baseUrl,
        apiKeyStart: kieConfig.apiKey ? kieConfig.apiKey.substring(0, 8) + '...' : 'NOT_SET'
      }
    };
    
    // 2. 测试数据库连接
    try {
      const testUser = await db.query('SELECT id FROM users LIMIT 1');
      diagnostics.database = {
        connected: true,
        userCount: testUser.rows.length
      };
    } catch (dbError) {
      diagnostics.database = {
        connected: false,
        error: dbError.message
      };
    }
    
    // 3. 测试VideoGenerator类创建
    try {
      const videoGenerator = new VideoGenerator(db);
      diagnostics.videoGenerator = {
        created: true,
        hasKieConfig: !!videoGenerator.kieAiConfig
      };
      
      // 4. 模拟API调用测试
      try {
        console.log('🔗 测试KIE.ai API调用...');
        
        const apiTestResult = await videoGenerator.callRunwayApi(
          testData.testImageUrl, 
          testData.testPrompt
        );
        
        diagnostics.apiTest = {
          success: apiTestResult.success,
          hasTaskId: !!apiTestResult.taskId,
          hasVideoUrl: !!apiTestResult.videoUrl,
          error: apiTestResult.error || null,
          message: apiTestResult.message || null
        };
        
        console.log('📊 API测试结果:', diagnostics.apiTest);
        
      } catch (apiError) {
        diagnostics.apiTest = {
          success: false,
          error: 'API调用异常: ' + apiError.message
        };
      }
      
    } catch (vgError) {
      diagnostics.videoGenerator = {
        created: false,
        error: vgError.message
      };
      diagnostics.apiTest = {
        success: false,
        error: 'VideoGenerator创建失败，无法测试API'
      };
    }
     
     res.status(200).json({
      success: true,
      message: '视频生成系统诊断完成',
      diagnostics
    });
    
  } catch (error) {
    console.error('❌ 诊断测试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}; 