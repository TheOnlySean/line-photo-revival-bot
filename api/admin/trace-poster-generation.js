import db from '../../config/database.js';

export default async function handler(req, res) {
  try {
    console.log('🔍 追踪最新的海报生成详情...');

    // 获取最新的海报任务
    const latestTask = await db.query(`
      SELECT * FROM poster_tasks 
      WHERE line_user_id = 'U23ea34c52091796e999d10f150460c78'
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (latestTask.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No poster tasks found'
      });
    }

    const task = latestTask.rows[0];
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      taskDetails: {
        id: task.id,
        status: task.status,
        step: task.step,
        
        // 检查第一步
        hasStep1TaskId: !!task.kie_task_id_step1,
        step1TaskId: task.kie_task_id_step1,
        hasShowaImage: !!task.showa_image_url,
        showaImageUrl: task.showa_image_url,
        
        // 检查第二步  
        hasStep2TaskId: !!task.kie_task_id_step2,
        step2TaskId: task.kie_task_id_step2,
        templateUsed: task.template_used,
        hasFinalPoster: !!task.final_poster_url,
        finalPosterUrl: task.final_poster_url,
        
        // 时间信息
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        ageMinutes: Math.round((Date.now() - new Date(task.created_at).getTime()) / (1000 * 60))
      },
      
      // 分析
      analysis: {
        executedSteps: task.step,
        hasCompleteFlow: !!(task.kie_task_id_step1 && task.kie_task_id_step2),
        hasTemplateIntegration: !!task.template_used,
        likelyHasWatermark: !!(task.final_poster_url && task.template_used),
        
        // 推测问题
        possibleIssues: []
      }
    };

    // 问题分析
    if (!task.kie_task_id_step1) {
      response.analysis.possibleIssues.push('第一步TaskID未保存');
    }
    if (!task.kie_task_id_step2) {
      response.analysis.possibleIssues.push('第二步TaskID未保存 - 可能第二步未执行');
    }
    if (!task.template_used) {
      response.analysis.possibleIssues.push('没有使用模板 - 第二步可能失败');
    }
    if (!task.showa_image_url) {
      response.analysis.possibleIssues.push('第一步中间结果未保存');
    }
    if (task.step === 1 && task.status === 'completed') {
      response.analysis.possibleIssues.push('任务在第一步就完成了，可能跳过了第二步');
    }

    console.log('✅ 任务追踪完成');
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ 追踪失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
