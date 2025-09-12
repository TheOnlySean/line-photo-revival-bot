/**
 * 简单的生产环境检查API
 * 直接查询生产环境数据库状态
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  try {
    console.log('🔍 检查生产环境状态...');
    
    // 1. 检查最近的海报任务
    const recentTasks = await db.query(`
      SELECT id, line_user_id, status, step, template_used,
             kie_task_id_step1, kie_task_id_step2,
             created_at, error_message,
             EXTRACT(EPOCH FROM (NOW() - created_at)) as elapsed_seconds
      FROM poster_tasks 
      WHERE created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    const tasks = recentTasks.rows.map(task => {
      const elapsedMinutes = Math.floor(task.elapsed_seconds / 60);
      const elapsedSeconds = Math.floor(task.elapsed_seconds % 60);
      
      return {
        id: task.id,
        lineUserId: task.line_user_id,
        status: task.status,
        step: task.step,
        templateUsed: task.template_used || '未选择',
        kieTaskIds: {
          step1: task.kie_task_id_step1 || '无',
          step2: task.kie_task_id_step2 || '无'
        },
        elapsedTime: `${elapsedMinutes}分${elapsedSeconds}秒`,
        createdAt: task.created_at,
        errorMessage: task.error_message
      };
    });

    // 2. 检查模板状态
    const templates = await db.query(`
      SELECT template_name, is_active, template_url
      FROM poster_templates 
      WHERE is_active = true
      ORDER BY template_name
    `);
    
    const validTemplates = templates.rows.filter(t => 
      t.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/')
    );

    // 3. 检查用户配额
    const userQuota = await db.query(`
      SELECT u.line_user_id, s.plan_type, s.monthly_poster_quota, s.posters_used_this_month
      FROM users u
      JOIN subscriptions s ON s.user_id = u.id
      WHERE u.line_user_id = 'U23ea34c52091796e999d10f150460c78'
      AND s.status = 'active'
    `);

    return res.json({
      success: true,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      recentTasks: tasks,
      summary: {
        recentTaskCount: tasks.length,
        processingTasks: tasks.filter(t => t.status === 'processing').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        failedTasks: tasks.filter(t => t.status === 'failed').length
      },
      templates: {
        total: templates.rows.length,
        validUrls: validTemplates.length,
        names: validTemplates.map(t => t.template_name)
      },
      userQuota: userQuota.rows[0] || null
    });

  } catch (error) {
    console.error('❌ 检查生产环境失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
