/**
 * 紧急清理卡住任务API
 * 手动清理超时的海报任务并恢复用户状态
 */

const db = require('../../config/database');
const LineAdapter = require('../../adapters/line-adapter');

export default async function handler(req, res) {
  try {
    console.log('🚨 开始紧急清理卡住的海报任务...');
    
    const lineAdapter = new LineAdapter();
    const results = [];
    
    // 1. 查找所有卡住的任务（超过3分钟）
    const stuckTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.status = 'processing'
      AND pt.created_at < NOW() - INTERVAL '3 minutes'
      ORDER BY pt.created_at DESC
    `);
    
    console.log(`🔍 找到 ${stuckTasks.rows.length} 个卡住的任务`);
    
    for (const task of stuckTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      
      console.log(`🧹 清理任务 - 用户: ${task.line_user_id}, 任务ID: ${task.id}, 运行时间: ${elapsedMinutes}分钟`);
      
      try {
        // 1. 标记任务失败
        await db.query(
          `UPDATE poster_tasks 
           SET status = 'failed', 
               error_message = 'Emergency cleanup - task stuck for ${elapsedMinutes} minutes',
               updated_at = NOW()
           WHERE id = $1`,
          [task.id]
        );
        
        // 2. 恢复用户配额
        await db.restorePosterQuota(task.user_id);
        
        // 3. 切换用户回主菜单
        try {
          await lineAdapter.switchToMainMenu(task.line_user_id);
        } catch (menuError) {
          console.warn('⚠️ 切换菜单失败（非关键错误）:', menuError.message);
        }
        
        // 4. 发送错误通知给用户
        try {
          await lineAdapter.pushMessage(task.line_user_id, {
            type: 'text',
            text: '❌ 申し訳ございません。海報生成でタイムアウトが発生しました。\n\n' +
                  'ネットワークの問題か、処理時間が予想より長くかかった可能性があります。\n\n' +
                  'もう一度お試しください。\n\n' +
                  '您這次生成的配額沒有被扣除請您放心'
          });
        } catch (notifyError) {
          console.warn('⚠️ 发送通知失败（非关键错误）:', notifyError.message);
        }
        
        results.push({
          taskId: task.id,
          lineUserId: task.line_user_id,
          displayName: task.display_name,
          elapsedMinutes: elapsedMinutes,
          status: 'cleaned',
          actions: ['task_failed', 'quota_restored', 'menu_switched', 'user_notified']
        });
        
        console.log(`✅ 任务 ${task.id} 清理完成`);
        
      } catch (cleanError) {
        console.error(`❌ 清理任务 ${task.id} 失败:`, cleanError);
        results.push({
          taskId: task.id,
          lineUserId: task.line_user_id,
          elapsedMinutes: elapsedMinutes,
          status: 'error',
          error: cleanError.message
        });
      }
    }
    
    // 2. 检查是否还有其他问题任务
    const remainingTasks = await db.query(`
      SELECT COUNT(*) as count 
      FROM poster_tasks 
      WHERE status = 'processing'
    `);
    
    const summary = {
      foundStuckTasks: stuckTasks.rows.length,
      cleanedTasks: results.filter(r => r.status === 'cleaned').length,
      errorTasks: results.filter(r => r.status === 'error').length,
      remainingProcessingTasks: parseInt(remainingTasks.rows[0].count)
    };
    
    console.log('📊 清理完成统计:', summary);

    return res.json({
      success: true,
      message: '紧急清理完成',
      results: results,
      summary: summary,
      nextSteps: summary.remainingProcessingTasks > 0 ? 
        ['还有进行中的任务，可能需要继续监控'] : 
        ['所有卡住任务已清理完毕'],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 紧急清理失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
