/**
 * 清理特定任务脚本
 * 清理指定ID的海报任务
 */

const db = require('../config/database');
const LineAdapter = require('../adapters/line-adapter');

async function cleanSpecificTask(taskId = 6) {
  console.log(`🧹 清理特定任务 ID: ${taskId}...`);
  
  try {
    // 1. 获取任务信息
    const task = await db.query(`
      SELECT pt.*, u.line_user_id
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.id = $1
    `, [taskId]);
    
    if (task.rows.length === 0) {
      console.log('❌ 任务不存在');
      return { success: false, error: 'Task not found' };
    }
    
    const taskInfo = task.rows[0];
    const elapsedTime = Date.now() - new Date(taskInfo.created_at).getTime();
    const elapsedMinutes = Math.floor(elapsedTime / 60000);
    
    console.log(`📋 任务信息:`);
    console.log(`   ID: ${taskInfo.id}`);
    console.log(`   用户: ${taskInfo.line_user_id}`);
    console.log(`   状态: ${taskInfo.status}`);
    console.log(`   运行时间: ${elapsedMinutes}分钟`);
    console.log(`   步骤: ${taskInfo.step}`);

    // 2. 清理任务
    console.log('\n🗑️ 清理任务...');
    
    await db.query(
      `UPDATE poster_tasks 
       SET status = 'failed', 
           error_message = 'Manual cleanup - stuck task',
           updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );
    
    console.log('✅ 任务已标记为失败');

    // 3. 恢复配额
    await db.restorePosterQuota(taskInfo.user_id);
    console.log('✅ 用户配额已恢复');

    // 4. 重置用户界面到主菜单
    const lineAdapter = new LineAdapter();
    try {
      await lineAdapter.switchToMainMenu(taskInfo.line_user_id);
      console.log('✅ 用户界面已切换到主菜单');
    } catch (menuError) {
      console.warn('⚠️ 切换菜单失败:', menuError.message);
    }

    // 5. 发送清理通知
    try {
      await lineAdapter.pushMessage(taskInfo.line_user_id, {
        type: 'text',
        text: '🔧 システムメンテナンス完了\n\n' +
              'ポスター生成機能が最適化されました！\n\n' +
              '再度お試しください。✨\n\n' +
              'ご利用配額は消費されておりませんのでご安心ください。'
      });
      console.log('✅ 清理通知已发送');
    } catch (notifyError) {
      console.warn('⚠️ 发送通知失败:', notifyError.message);
    }

    return {
      success: true,
      taskId: taskId,
      elapsedMinutes: elapsedMinutes,
      userNotified: true
    };

  } catch (error) {
    console.error('❌ 清理特定任务失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const taskId = process.argv[2] ? parseInt(process.argv[2]) : 6;
  
  cleanSpecificTask(taskId)
    .then((result) => {
      console.log('\n📊 清理结果:', result);
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = cleanSpecificTask;
