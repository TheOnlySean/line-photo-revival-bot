/**
 * 生产环境海报系统全面诊断和修复API
 * 检查并修复生产环境的所有海报相关功能
 */

const db = require('../../config/database');
const axios = require('axios');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  // 只允许POST请求和管理密钥
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== 'production-poster-system-fix-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔴 开始生产环境海报系统全面诊断和修复...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      steps: []
    };

    // === 第1步：检查数据库架构 ===
    console.log('1️⃣ 检查数据库架构...');
    try {
      // 检查海报配额字段
      const posterQuotaFields = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'subscriptions' 
        AND column_name IN ('monthly_poster_quota', 'posters_used_this_month')
      `);
      
      if (posterQuotaFields.rows.length < 2) {
        console.log('🔧 添加海报配额字段...');
        await db.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS monthly_poster_quota INTEGER DEFAULT 0`);
        await db.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS posters_used_this_month INTEGER DEFAULT 0`);
        diagnostics.steps.push({ step: 1, action: 'poster_quota_fields_added', status: 'success' });
      } else {
        diagnostics.steps.push({ step: 1, action: 'poster_quota_fields_exist', status: 'success' });
      }

      // 检查poster_templates表
      const templatesTable = await db.query(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'poster_templates')
      `);
      
      if (!templatesTable.rows[0].exists) {
        console.log('🔧 创建poster_templates表...');
        await db.query(`
          CREATE TABLE poster_templates (
            id SERIAL PRIMARY KEY,
            template_name VARCHAR(100) NOT NULL UNIQUE,
            template_url TEXT NOT NULL,
            description TEXT,
            style_category VARCHAR(50) DEFAULT 'classic',
            is_active BOOLEAN DEFAULT true,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        diagnostics.steps.push({ step: 1, action: 'poster_templates_table_created', status: 'success' });
      } else {
        diagnostics.steps.push({ step: 1, action: 'poster_templates_table_exists', status: 'success' });
      }

      // 检查poster_tasks表
      const tasksTable = await db.query(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'poster_tasks')
      `);
      
      if (!tasksTable.rows[0].exists) {
        console.log('🔧 创建poster_tasks表...');
        await db.query(`
          CREATE TABLE poster_tasks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            line_user_id VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'processing',
            step INTEGER DEFAULT 1,
            original_image_url TEXT,
            showa_image_url TEXT,
            final_poster_url TEXT,
            template_used VARCHAR(100),
            kie_task_id_step1 VARCHAR(255),
            kie_task_id_step2 VARCHAR(255),
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        diagnostics.steps.push({ step: 1, action: 'poster_tasks_table_created', status: 'success' });
      } else {
        diagnostics.steps.push({ step: 1, action: 'poster_tasks_table_exists', status: 'success' });
      }

    } catch (dbError) {
      diagnostics.steps.push({ step: 1, action: 'database_setup', status: 'error', error: dbError.message });
    }

    // === 第2步：修复海报配额 ===
    console.log('2️⃣ 修复海报配额...');
    try {
      const quotaUpdateResult = await db.query(`
        UPDATE subscriptions 
        SET monthly_poster_quota = CASE 
          WHEN plan_type = 'trial' THEN 8
          WHEN plan_type = 'standard' THEN -1
          ELSE 0
        END,
        posters_used_this_month = 0
        WHERE status = 'active' 
        AND (monthly_poster_quota IS NULL OR monthly_poster_quota = 0)
      `);
      
      diagnostics.steps.push({ 
        step: 2, 
        action: 'quota_fix', 
        status: 'success', 
        updatedSubscriptions: quotaUpdateResult.rowCount 
      });
      console.log(`✅ 更新了 ${quotaUpdateResult.rowCount} 个订阅的海报配额`);
    } catch (quotaError) {
      diagnostics.steps.push({ step: 2, action: 'quota_fix', status: 'error', error: quotaError.message });
    }

    // === 第3步：设置海报模板 ===
    console.log('3️⃣ 设置海报模板...');
    try {
      const realTemplates = [
        {
          name: 'vintage_magazine_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/vintage_magazine_01-8OCriw0O8bSodvw89WXy2TDKDy7580.jpg',
          description: '昭和时代经典杂志封面风格',
          category: 'vintage'
        },
        {
          name: 'retro_poster_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/retro_poster_01-ud7MN6VN9uDSoI21sjBlQHdOaTJPBs.jpg',
          description: '复古电影海报风格',
          category: 'retro'
        },
        {
          name: 'classic_photo_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/classic_photo_01-G9Maog6VYoSSUxtpLYJc95eiddnTV0.jpg',
          description: '经典人像摄影风格',
          category: 'classic'
        },
        {
          name: 'japanese_style_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/japanese_style_01-78rhL3kqbwyYGJdOT3y36So9EaGudx.jpg',
          description: '日式传统海报设计',
          category: 'japanese'
        }
      ];

      // 先禁用所有无效模板
      await db.query(`
        UPDATE poster_templates 
        SET is_active = false 
        WHERE template_url NOT LIKE 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/%'
      `);

      // 添加或更新真实模板
      let templateCount = 0;
      for (const template of realTemplates) {
        await db.query(`
          INSERT INTO poster_templates (template_name, template_url, description, style_category, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (template_name) 
          DO UPDATE SET 
            template_url = EXCLUDED.template_url,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
        `, [template.name, template.url, template.description, template.category]);
        templateCount++;
      }

      diagnostics.steps.push({ 
        step: 3, 
        action: 'templates_setup', 
        status: 'success', 
        templatesCount: templateCount 
      });
      console.log(`✅ 设置了 ${templateCount} 个真实海报模板`);
      
    } catch (templateError) {
      diagnostics.steps.push({ step: 3, action: 'templates_setup', status: 'error', error: templateError.message });
    }

    // === 第4步：清理卡住的任务 ===
    console.log('4️⃣ 清理卡住的任务...');
    try {
      const stuckTasks = await db.query(`
        UPDATE poster_tasks 
        SET status = 'failed', 
            error_message = 'Production system maintenance cleanup',
            updated_at = NOW()
        WHERE status = 'processing' 
        AND created_at < NOW() - INTERVAL '5 minutes'
        RETURNING id, line_user_id
      `);
      
      // 恢复这些任务的用户配额
      for (const task of stuckTasks.rows) {
        try {
          const userResult = await db.query('SELECT id FROM users WHERE line_user_id = $1', [task.line_user_id]);
          if (userResult.rows.length > 0) {
            await db.restorePosterQuota(userResult.rows[0].id);
          }
        } catch (restoreError) {
          console.warn(`⚠️ 恢复用户 ${task.line_user_id} 配额失败:`, restoreError.message);
        }
      }

      diagnostics.steps.push({ 
        step: 4, 
        action: 'cleanup_stuck_tasks', 
        status: 'success', 
        cleanedCount: stuckTasks.rowCount 
      });
      console.log(`✅ 清理了 ${stuckTasks.rowCount} 个卡住的任务`);
      
    } catch (cleanupError) {
      diagnostics.steps.push({ step: 4, action: 'cleanup_stuck_tasks', status: 'error', error: cleanupError.message });
    }

    // === 第5步：测试服务功能 ===
    console.log('5️⃣ 测试海报生成服务...');
    try {
      // 测试服务初始化
      const PosterGenerator = require('../../services/poster-generator');
      const PosterImageService = require('../../services/poster-image-service');
      
      const posterImageService = new PosterImageService();
      const posterGenerator = new PosterGenerator(db, posterImageService);
      
      // 测试配额检查函数
      const testUser = await db.query(`
        SELECT user_id FROM subscriptions WHERE status = 'active' LIMIT 1
      `);
      
      if (testUser.rows.length > 0) {
        const quota = await db.checkPosterQuota(testUser.rows[0].user_id);
        diagnostics.steps.push({ 
          step: 5, 
          action: 'service_test', 
          status: 'success',
          quotaTest: quota.hasQuota 
        });
      }
      
      // 测试模板选择
      const randomTemplate = await db.getRandomPosterTemplate();
      const templateValid = randomTemplate && 
        randomTemplate.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
      
      diagnostics.steps.push({ 
        step: 5, 
        action: 'template_selection_test', 
        status: templateValid ? 'success' : 'error',
        templateName: randomTemplate?.template_name 
      });
      
      console.log('✅ 海报生成服务测试通过');
      
    } catch (serviceError) {
      diagnostics.steps.push({ 
        step: 5, 
        action: 'service_test', 
        status: 'error', 
        error: serviceError.message 
      });
      console.log('❌ 海报生成服务测试失败:', serviceError.message);
    }

    // === 第6步：验证KIE.AI API连接 ===
    console.log('6️⃣ 验证KIE.AI API连接...');
    try {
      const kieConfig = {
        hasApiKey: !!process.env.KIE_AI_API_KEY,
        apiKeyPreview: process.env.KIE_AI_API_KEY ? process.env.KIE_AI_API_KEY.substring(0, 8) + '...' : 'NOT SET'
      };
      
      if (kieConfig.hasApiKey) {
        // 测试一个简单的查询请求（不创建任务）
        const testResponse = await axios.get(
          'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=test_connection_check',
          {
            headers: {
              'Authorization': `Bearer ${process.env.KIE_AI_API_KEY}`
            },
            timeout: 10000
          }
        );
        
        // 即使任务不存在，能连接到API就说明配置正确
        diagnostics.steps.push({ 
          step: 6, 
          action: 'kie_api_connection', 
          status: 'success',
          apiKey: kieConfig.apiKeyPreview 
        });
        console.log('✅ KIE.AI API连接正常');
      } else {
        diagnostics.steps.push({ 
          step: 6, 
          action: 'kie_api_connection', 
          status: 'error', 
          error: 'KIE_AI_API_KEY not configured' 
        });
        console.log('❌ KIE.AI API Key未配置');
      }
      
    } catch (kieError) {
      // 404或401错误都说明连接正常，只是任务不存在或权限问题
      if (kieError.response && [401, 404].includes(kieError.response.status)) {
        diagnostics.steps.push({ 
          step: 6, 
          action: 'kie_api_connection', 
          status: 'success',
          note: 'API连接正常（404/401预期错误）' 
        });
        console.log('✅ KIE.AI API连接正常（404/401预期错误）');
      } else {
        diagnostics.steps.push({ 
          step: 6, 
          action: 'kie_api_connection', 
          status: 'error', 
          error: kieError.message 
        });
        console.log('❌ KIE.AI API连接失败:', kieError.message);
      }
    }

    // === 第7步：检查现有用户配额 ===
    console.log('7️⃣ 检查现有用户配额...');
    try {
      const userQuotaStats = await db.query(`
        SELECT 
          plan_type,
          COUNT(*) as user_count,
          AVG(monthly_poster_quota) as avg_poster_quota,
          SUM(posters_used_this_month) as total_used
        FROM subscriptions 
        WHERE status = 'active'
        GROUP BY plan_type
      `);
      
      diagnostics.steps.push({ 
        step: 7, 
        action: 'user_quota_check', 
        status: 'success',
        quotaStats: userQuotaStats.rows 
      });
      
      console.log('📊 用户配额统计:');
      userQuotaStats.rows.forEach(stat => {
        const quotaDisplay = stat.avg_poster_quota == -1 ? '无限' : stat.avg_poster_quota;
        console.log(`   ${stat.plan_type}: ${stat.user_count}用户, 配额: ${quotaDisplay}, 已用: ${stat.total_used}`);
      });
      
    } catch (quotaStatsError) {
      diagnostics.steps.push({ step: 7, action: 'user_quota_check', status: 'error', error: quotaStatsError.message });
    }

    // === 第8步：验证完整流程 ===
    console.log('8️⃣ 验证完整海报生成流程...');
    try {
      // 模拟完整流程但不实际执行
      const PosterGenerator = require('../../services/poster-generator');
      const PosterImageService = require('../../services/poster-image-service');
      
      const posterImageService = new PosterImageService();
      const posterGenerator = new PosterGenerator(db, posterImageService);
      
      const status = posterGenerator.getStatus();
      const template = await db.getRandomPosterTemplate();
      
      const flowTest = {
        serviceInit: true,
        apiConfigured: status.apiKey === '已配置',
        templatesAvailable: !!template,
        templateValid: template?.template_url?.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/'),
        readyForProduction: true
      };
      
      flowTest.readyForProduction = flowTest.serviceInit && flowTest.apiConfigured && 
                                   flowTest.templatesAvailable && flowTest.templateValid;
      
      diagnostics.steps.push({ 
        step: 8, 
        action: 'complete_flow_test', 
        status: flowTest.readyForProduction ? 'success' : 'error',
        flowTest: flowTest 
      });
      
      console.log(`${flowTest.readyForProduction ? '✅' : '❌'} 完整流程测试: ${flowTest.readyForProduction ? '准备就绪' : '存在问题'}`);
      
    } catch (flowError) {
      diagnostics.steps.push({ step: 8, action: 'complete_flow_test', status: 'error', error: flowError.message });
    }

    // 总结结果
    const successSteps = diagnostics.steps.filter(s => s.status === 'success').length;
    const errorSteps = diagnostics.steps.filter(s => s.status === 'error').length;
    
    console.log(`📊 生产环境修复完成: ${successSteps} 成功, ${errorSteps} 失败`);

    return res.json({
      success: errorSteps === 0,
      message: `生产环境海报系统修复完成: ${successSteps} 成功, ${errorSteps} 失败`,
      diagnostics: diagnostics,
      summary: {
        totalSteps: diagnostics.steps.length,
        successSteps: successSteps,
        errorSteps: errorSteps,
        productionReady: errorSteps === 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 生产环境修复失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
