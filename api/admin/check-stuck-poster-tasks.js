/**
 * 检查卡住的海报任务API
 * 诊断当前进行中的海报任务状态
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  try {
    console.log('🔍 检查卡住的海报任务...');
    
    // 1. 查找所有进行中的海报任务
    const activeTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.status = 'processing'
      ORDER BY pt.created_at DESC
    `);
    
    console.log(`📊 找到 ${activeTasks.rows.length} 个进行中的海报任务`);
    
    const taskDiagnostics = [];
    
    for (const task of activeTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);
      
      const taskInfo = {
        taskId: task.id,
        lineUserId: task.line_user_id,
        displayName: task.display_name,
        status: task.status,
        step: task.step,
        elapsedTime: `${elapsedMinutes}分${elapsedSeconds}秒`,
        createdAt: task.created_at,
        kieTaskId1: task.kie_task_id_step1,
        kieTaskId2: task.kie_task_id_step2,
        isStuck: elapsedTime > 180000 // 超过3分钟算卡住
      };
      
      // 如果任务卡住，自动清理
      if (taskInfo.isStuck) {
        console.log(`🧹 清理卡住的任务 - ID: ${task.id}, 用户: ${task.line_user_id}`);
        
        try {
          // 标记任务失败
          await db.query(
            `UPDATE poster_tasks 
             SET status = 'failed', error_message = 'Task timeout after 3+ minutes', updated_at = NOW()
             WHERE id = $1`,
            [task.id]
          );
          
          // 恢复用户配额
          const userResult = await db.query('SELECT id FROM users WHERE line_user_id = $1', [task.line_user_id]);
          if (userResult.rows.length > 0) {
            await db.restorePosterQuota(userResult.rows[0].id);
            console.log(`✅ 已恢复用户 ${task.line_user_id} 的海报配额`);
          }
          
          taskInfo.cleaned = true;
          
        } catch (cleanError) {
          console.error('❌ 清理卡住任务失败:', cleanError);
          taskInfo.cleanError = cleanError.message;
        }
      }
      
      taskDiagnostics.push(taskInfo);
      
      console.log(`📋 任务 ${task.id}: ${task.line_user_id} - ${taskInfo.elapsedTime} - ${taskInfo.isStuck ? '🚨 卡住' : '⏳ 正常'}`);
    }
    
    // 2. 检查最近的任务失败情况
    const recentFailedTasks = await db.query(`
      SELECT pt.*, u.line_user_id
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.status = 'failed'
      AND pt.created_at > NOW() - INTERVAL '1 hour'
      ORDER BY pt.created_at DESC
      LIMIT 5
    `);
    
    console.log(`📊 最近1小时失败任务: ${recentFailedTasks.rows.length} 个`);
    
    const failedTasksInfo = recentFailedTasks.rows.map(task => ({
      taskId: task.id,
      lineUserId: task.line_user_id,
      errorMessage: task.error_message,
      createdAt: task.created_at,
      failedAt: task.updated_at
    }));

    return res.json({
      success: true,
      message: '海报任务状态检查完成',
      activeTasks: taskDiagnostics,
      recentFailures: failedTasksInfo,
      summary: {
        activeCount: activeTasks.rows.length,
        stuckCount: taskDiagnostics.filter(t => t.isStuck).length,
        cleanedCount: taskDiagnostics.filter(t => t.cleaned).length,
        recentFailures: recentFailedTasks.rows.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 检查海报任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
