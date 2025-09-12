/**
 * 海报生成流程测试API
 * 模拟完整的海报生成流程，逐步诊断问题
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  try {
    console.log('🧪 开始海报生成流程测试...');
    
    const testResults = [];
    
    // 1. 测试数据库基础功能
    console.log('1️⃣ 测试数据库连接...');
    try {
      const dbTest = await db.query('SELECT NOW() as time');
      testResults.push({ step: 1, name: 'database_connection', status: 'success', time: dbTest.rows[0].time });
    } catch (dbError) {
      testResults.push({ step: 1, name: 'database_connection', status: 'error', error: dbError.message });
      return res.json({ success: false, error: 'Database connection failed', results: testResults });
    }

    // 2. 测试配额检查
    console.log('2️⃣ 测试配额检查...');
    try {
      // 找一个真实的活跃用户
      const activeUser = await db.query(`
        SELECT u.id, u.line_user_id 
        FROM users u 
        JOIN subscriptions s ON s.user_id = u.id 
        WHERE s.status = 'active' 
        LIMIT 1
      `);
      
      if (activeUser.rows.length > 0) {
        const userId = activeUser.rows[0].id;
        const lineUserId = activeUser.rows[0].line_user_id;
        
        const quota = await db.checkPosterQuota(userId);
        testResults.push({ 
          step: 2, 
          name: 'quota_check', 
          status: 'success',
          userId: userId,
          lineUserId: lineUserId,
          quota: quota 
        });
      } else {
        testResults.push({ step: 2, name: 'quota_check', status: 'error', error: 'No active users found' });
      }
    } catch (quotaError) {
      testResults.push({ step: 2, name: 'quota_check', status: 'error', error: quotaError.message });
    }

    // 3. 测试海报模板选择
    console.log('3️⃣ 测试海报模板选择...');
    try {
      const randomTemplate = await db.getRandomPosterTemplate();
      if (randomTemplate) {
        testResults.push({ 
          step: 3, 
          name: 'template_selection', 
          status: 'success',
          template: {
            name: randomTemplate.template_name,
            category: randomTemplate.style_category,
            url: randomTemplate.template_url?.substring(0, 50) + '...'
          }
        });
      } else {
        testResults.push({ step: 3, name: 'template_selection', status: 'error', error: 'No templates found' });
      }
    } catch (templateError) {
      testResults.push({ step: 3, name: 'template_selection', status: 'error', error: templateError.message });
    }

    // 4. 测试服务初始化
    console.log('4️⃣ 测试服务初始化...');
    try {
      const PosterGenerator = require('../../services/poster-generator');
      const PosterImageService = require('../../services/poster-image-service');
      
      testResults.push({ step: 4, name: 'service_loading', status: 'success' });
      
      const posterImageService = new PosterImageService();
      const posterGenerator = new PosterGenerator(db, posterImageService);
      
      testResults.push({ step: 4, name: 'service_initialization', status: 'success' });
      
      const status = posterGenerator.getStatus();
      testResults.push({ 
        step: 4, 
        name: 'service_status', 
        status: 'success',
        serviceStatus: status 
      });
      
    } catch (serviceError) {
      testResults.push({ 
        step: 4, 
        name: 'service_initialization', 
        status: 'error', 
        error: serviceError.message,
        stack: serviceError.stack?.split('\n').slice(0, 3)
      });
    }

    // 5. 测试KIE.AI API连接（不实际调用，只测试配置）
    console.log('5️⃣ 测试KIE.AI配置...');
    try {
      const kieConfig = {
        hasApiKey: !!process.env.KIE_AI_API_KEY,
        apiKeyPreview: process.env.KIE_AI_API_KEY ? process.env.KIE_AI_API_KEY.substring(0, 8) + '...' : 'Not set',
        baseUrl: 'https://api.kie.ai',
        model: 'google/nano-banana-edit'
      };
      
      testResults.push({ 
        step: 5, 
        name: 'kie_config', 
        status: 'success',
        config: kieConfig 
      });
    } catch (kieError) {
      testResults.push({ step: 5, name: 'kie_config', status: 'error', error: kieError.message });
    }

    // 总结结果
    const successCount = testResults.filter(r => r.status === 'success').length;
    const errorCount = testResults.filter(r => r.status === 'error').length;
    
    console.log(`📊 测试完成: ${successCount} 成功, ${errorCount} 失败`);

    return res.json({
      success: errorCount === 0,
      message: `海报生成流程测试完成: ${successCount} 成功, ${errorCount} 失败`,
      results: testResults,
      summary: {
        totalTests: testResults.length,
        successCount: successCount,
        errorCount: errorCount,
        readyForProduction: errorCount === 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 海报生成测试失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
