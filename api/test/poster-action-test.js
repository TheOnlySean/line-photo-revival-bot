/**
 * 海报按钮功能简化测试API
 * 用于快速诊断CREATE_POSTER action的问题
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  try {
    console.log('🧪 测试海报按钮功能...');
    
    // 模拟CREATE_POSTER action处理
    const testUserId = 'test_user_999';
    const steps = [];
    
    // 1. 测试数据库连接
    try {
      const dbTest = await db.query('SELECT NOW() as time');
      steps.push({ step: 'database_connection', status: 'success', time: dbTest.rows[0].time });
    } catch (dbError) {
      steps.push({ step: 'database_connection', status: 'error', error: dbError.message });
      return res.json({ success: false, error: 'Database connection failed', steps });
    }

    // 2. 测试配额检查函数
    try {
      if (typeof db.checkPosterQuota === 'function') {
        steps.push({ step: 'quota_function_exists', status: 'success' });
        
        // 找一个真实用户测试
        const realUser = await db.query(`
          SELECT user_id FROM subscriptions 
          WHERE status = 'active' 
          LIMIT 1
        `);
        
        if (realUser.rows.length > 0) {
          const userId = realUser.rows[0].user_id;
          const quotaResult = await db.checkPosterQuota(userId);
          steps.push({ 
            step: 'quota_check_test', 
            status: 'success', 
            quota: {
              hasQuota: quotaResult.hasQuota,
              remaining: quotaResult.remaining,
              planType: quotaResult.planType
            }
          });
        }
      } else {
        steps.push({ step: 'quota_function_exists', status: 'error', error: 'checkPosterQuota function not found' });
      }
    } catch (quotaError) {
      steps.push({ step: 'quota_check_test', status: 'error', error: quotaError.message });
    }

    // 3. 测试海报模板功能
    try {
      const randomTemplate = await db.getRandomPosterTemplate();
      if (randomTemplate) {
        steps.push({ 
          step: 'template_test', 
          status: 'success', 
          template: {
            name: randomTemplate.template_name,
            category: randomTemplate.style_category,
            hasUrl: !!randomTemplate.template_url
          }
        });
      } else {
        steps.push({ step: 'template_test', status: 'error', error: 'No templates found' });
      }
    } catch (templateError) {
      steps.push({ step: 'template_test', status: 'error', error: templateError.message });
    }

    // 4. 测试服务类加载
    try {
      // 尝试加载服务类
      const PosterGenerator = require('../../services/poster-generator');
      const PosterImageService = require('../../services/poster-image-service');
      
      steps.push({ step: 'service_loading', status: 'success' });
      
      // 尝试初始化
      const posterImageService = new PosterImageService();
      const posterGenerator = new PosterGenerator(db, posterImageService);
      
      steps.push({ step: 'service_initialization', status: 'success' });
      
      const status = posterGenerator.getStatus();
      steps.push({ 
        step: 'service_status', 
        status: 'success', 
        serviceStatus: status 
      });
      
    } catch (serviceError) {
      steps.push({ 
        step: 'service_loading', 
        status: 'error', 
        error: serviceError.message,
        stack: serviceError.stack?.split('\n')[0] 
      });
    }

    // 5. 环境变量检查
    const envCheck = {
      KIE_AI_API_KEY: !!process.env.KIE_AI_API_KEY,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV
    };
    
    steps.push({ step: 'environment_check', status: 'info', env: envCheck });

    // 返回完整诊断结果
    return res.json({
      success: true,
      message: '海报功能诊断完成',
      steps: steps,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 海报功能测试失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}
