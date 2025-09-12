/**
 * 紧急清理卡住的海报任务脚本
 * 清理指定用户的卡住任务并恢复状态
 */

const db = require('../config/database');

async function emergencyCleanStuckTask(lineUserId = 'U23ea34c52091796e999d10f150460c78') {
  console.log(`🚨 紧急清理用户 ${lineUserId} 的卡住任务...`);
  
  try {
    // 1. 查找该用户的卡住任务
    const stuckTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE u.line_user_id = $1 
      AND pt.status = 'processing'
      ORDER BY pt.created_at DESC
    `, [lineUserId]);
    
    console.log(`📊 找到 ${stuckTasks.rows.length} 个卡住的任务`);
    
    if (stuckTasks.rows.length === 0) {
      console.log('✅ 该用户没有卡住的任务');
      return { success: true, cleanedTasks: 0 };
    }

    const cleanResults = [];
    
    for (const task of stuckTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      
      console.log(`\n🧹 清理任务 ID: ${task.id}`);
      console.log(`   运行时间: ${elapsedMinutes}分钟`);
      console.log(`   步骤: ${task.step}`);
      
      try {
        // 标记任务失败
        await db.query(
          `UPDATE poster_tasks 
           SET status = 'failed', 
               error_message = 'Emergency cleanup - task stuck for ${elapsedMinutes} minutes',
               updated_at = NOW()
           WHERE id = $1`,
          [task.id]
        );
        
        console.log('✅ 任务已标记为失败');
        
        // 恢复用户配额
        await db.restorePosterQuota(task.user_id);
        console.log('✅ 用户配额已恢复');
        
        cleanResults.push({
          taskId: task.id,
          elapsedMinutes: elapsedMinutes,
          status: 'cleaned'
        });
        
      } catch (cleanError) {
        console.error(`❌ 清理任务 ${task.id} 失败:`, cleanError);
        cleanResults.push({
          taskId: task.id,
          elapsedMinutes: elapsedMinutes,
          status: 'error',
          error: cleanError.message
        });
      }
    }
    
    // 2. 检查用户当前状态
    console.log('\n📊 检查用户状态...');
    const userState = await db.query(`
      SELECT current_state FROM users WHERE line_user_id = $1
    `, [lineUserId]);
    
    if (userState.rows.length > 0) {
      console.log(`用户当前状态: ${userState.rows[0].current_state}`);
      
      // 如果用户状态异常，重置为idle
      if (userState.rows[0].current_state !== 'idle') {
        await db.query(
          `UPDATE users SET current_state = 'idle', updated_at = NOW() WHERE line_user_id = $1`,
          [lineUserId]
        );
        console.log('✅ 用户状态已重置为idle');
      }
    }
    
    // 3. 检查用户配额状态
    console.log('\n💰 检查配额状态...');
    const userInfo = await db.query(`
      SELECT u.id, s.monthly_poster_quota, s.posters_used_this_month, s.plan_type
      FROM users u
      JOIN subscriptions s ON s.user_id = u.id
      WHERE u.line_user_id = $1 AND s.status = 'active'
    `, [lineUserId]);
    
    if (userInfo.rows.length > 0) {
      const quota = userInfo.rows[0];
      const remaining = quota.monthly_poster_quota === -1 ? '无限' : 
                       (quota.monthly_poster_quota - quota.posters_used_this_month);
      console.log(`配额状态: ${quota.plan_type}计划, 剩余: ${remaining}/${quota.monthly_poster_quota === -1 ? '无限' : quota.monthly_poster_quota}`);
    }

    console.log('\n🎉 紧急清理完成！');
    console.log('📝 结果总结:');
    cleanResults.forEach(result => {
      console.log(`- 任务${result.taskId}: ${result.status} (运行了${result.elapsedMinutes}分钟)`);
    });
    
    console.log('\n✅ 用户现在可以重新尝试海报生成了！');

    return {
      success: true,
      cleanedTasks: cleanResults.length,
      results: cleanResults
    };

  } catch (error) {
    console.error('❌ 紧急清理失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  emergencyCleanStuckTask()
    .then(() => {
      console.log('\n✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = emergencyCleanStuckTask;
