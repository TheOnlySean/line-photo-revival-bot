import db from '../../config/database.js';

export default async function handler(req, res) {
  try {
    console.log('🔍 检查最近的海报任务...');

    // 获取最近10个海报任务
    const recentTasks = await db.query(`
      SELECT 
        id,
        line_user_id,
        status,
        step,
        kie_task_id_step1,
        kie_task_id_step2,
        template_used,
        original_image_url,
        showa_image_url,
        final_poster_url,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
      FROM poster_tasks 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`📊 找到 ${recentTasks.rows.length} 个最近任务`);

    const taskDetails = recentTasks.rows.map(task => ({
      id: task.id,
      lineUserId: task.line_user_id,
      status: task.status,
      step: task.step,
      hasStep1TaskId: !!task.kie_task_id_step1,
      hasStep2TaskId: !!task.kie_task_id_step2,
      templateUsed: task.template_used,
      hasShowaImage: !!task.showa_image_url,
      hasFinalPoster: !!task.final_poster_url,
      createdAt: task.created_at,
      ageMinutes: Math.round(task.age_seconds / 60),
      step1TaskId: task.kie_task_id_step1,
      step2TaskId: task.kie_task_id_step2
    }));

    // 同时检查模板系统状态
    const templateCount = await db.query(`
      SELECT COUNT(*) as count, 
             COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
      FROM poster_templates
    `);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      recentTasks: taskDetails,
      templateSystem: {
        totalTemplates: parseInt(templateCount.rows[0].count),
        activeTemplates: parseInt(templateCount.rows[0].active_count)
      }
    };

    console.log('✅ 任务检查完成');
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ 检查任务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
