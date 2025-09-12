/**
 * 检查后台日志和状态API
 * 诊断海报生成功能的问题
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  // 只允许GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.query.key;
  if (adminKey !== 'check-logs-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔍 检查系统状态和日志...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        hasKieApiKey: !!process.env.KIE_AI_API_KEY,
        hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN
      },
      database: {},
      recentActivity: {}
    };

    // 1. 检查数据库连接和基础表
    try {
      const dbTime = await db.query('SELECT NOW() as time');
      diagnostics.database.connection = 'OK';
      diagnostics.database.time = dbTime.rows[0].time;

      // 检查关键表
      const posterQuotaFields = await db.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'subscriptions' 
        AND column_name IN ('monthly_poster_quota', 'posters_used_this_month')
      `);
      diagnostics.database.posterQuotaFields = posterQuotaFields.rows.length;

      const posterTemplatesExists = await db.query(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'poster_templates')
      `);
      diagnostics.database.posterTemplatesTable = posterTemplatesExists.rows[0].exists;

      if (posterTemplatesExists.rows[0].exists) {
        const templateCount = await db.query('SELECT COUNT(*) FROM poster_templates WHERE is_active = true');
        diagnostics.database.activeTemplates = parseInt(templateCount.rows[0].count);
      }

    } catch (dbError) {
      diagnostics.database.error = dbError.message;
    }

    // 2. 检查最近的用户活动
    try {
      const recentUsers = await db.query(`
        SELECT line_user_id, current_state, updated_at 
        FROM users 
        WHERE updated_at > NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC 
        LIMIT 5
      `);
      
      diagnostics.recentActivity.recentUsers = recentUsers.rows;

      // 检查最近的订阅
      const recentSubscriptions = await db.query(`
        SELECT user_id, plan_type, monthly_poster_quota, posters_used_this_month, status, updated_at
        FROM subscriptions 
        WHERE updated_at > NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC 
        LIMIT 3
      `);
      
      diagnostics.recentActivity.recentSubscriptions = recentSubscriptions.rows;

    } catch (activityError) {
      diagnostics.recentActivity.error = activityError.message;
    }

    // 3. 测试海报生成功能组件
    try {
      // 测试配额检查函数
      const testUser = await db.query(`
        SELECT user_id, line_user_id FROM users 
        WHERE id IN (SELECT user_id FROM subscriptions WHERE status = 'active')
        LIMIT 1
      `);
      
      if (testUser.rows.length > 0) {
        const userId = testUser.rows[0].user_id;
        const lineUserId = testUser.rows[0].line_user_id;
        
        diagnostics.functionTests = {};
        
        // 测试配额检查
        try {
          const quota = await db.checkPosterQuota(userId);
          diagnostics.functionTests.checkPosterQuota = {
            success: true,
            result: quota
          };
        } catch (quotaError) {
          diagnostics.functionTests.checkPosterQuota = {
            success: false,
            error: quotaError.message
          };
        }

        // 测试模板选择
        try {
          const template = await db.getRandomPosterTemplate();
          diagnostics.functionTests.getRandomTemplate = {
            success: true,
            template: template ? template.template_name : null
          };
        } catch (templateError) {
          diagnostics.functionTests.getRandomTemplate = {
            success: false,
            error: templateError.message
          };
        }

        // 测试服务初始化
        try {
          const PosterGenerator = require('../../services/poster-generator');
          const PosterImageService = require('../../services/poster-image-service');
          
          const posterImageService = new PosterImageService();
          const posterGenerator = new PosterGenerator(db, posterImageService);
          
          const status = posterGenerator.getStatus();
          diagnostics.functionTests.serviceInit = {
            success: true,
            status: status
          };
        } catch (serviceError) {
          diagnostics.functionTests.serviceInit = {
            success: false,
            error: serviceError.message,
            stack: serviceError.stack?.split('\n')[0]
          };
        }
      }

    } catch (testError) {
      diagnostics.functionTests = { error: testError.message };
    }

    return res.json({
      success: true,
      message: '系统状态检查完成',
      diagnostics: diagnostics
    });

  } catch (error) {
    console.error('❌ 系统状态检查失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
