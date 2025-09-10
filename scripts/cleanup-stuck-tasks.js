const db = require('../config/database');
const line = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

/**
 * 清理卡住的任务并恢复用户状态
 * 处理超过30分钟的pending任务和超过2小时的processing任务
 */
async function cleanupStuckTasks() {
  console.log('🧹 开始清理卡住的任务...');
  
  try {
    // 1. 查找卡住的任务
    const stuckTasksQuery = `
      SELECT v.*, u.line_user_id, u.display_name,
             EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 60 as minutes_ago
      FROM videos v
      JOIN users u ON v.user_id = u.id
      WHERE (
        (v.status = 'pending' AND v.created_at < NOW() - INTERVAL '30 minutes')
        OR
        (v.status = 'processing' AND v.created_at < NOW() - INTERVAL '2 hours')
      )
      ORDER BY v.created_at ASC
    `;
    
    const stuckTasks = await db.query(stuckTasksQuery);
    
    if (stuckTasks.rows.length === 0) {
      console.log('✅ 没有发现卡住的任务');
      return;
    }
    
    console.log(`🚨 发现 ${stuckTasks.rows.length} 个卡住的任务:`);
    
    // 2. 创建LINE客户端（用于通知用户）
    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: lineConfig.channelAccessToken
    });
    
    // 3. 处理每个卡住的任务
    let cleanedCount = 0;
    let notifiedCount = 0;
    let quotaRestoredCount = 0;
    
    for (const task of stuckTasks.rows) {
      const { id, user_id, line_user_id, display_name, status, minutes_ago, task_id } = task;
      
      console.log(`📋 处理任务 ${id}:`);
      console.log(`   用户: ${line_user_id} (${display_name})`);
      console.log(`   状态: ${status}`);
      console.log(`   卡住时间: ${Math.floor(minutes_ago)} 分钟`);
      console.log(`   Task ID: ${task_id || 'null'}`);
      
      try {
        // 3.1. 更新任务状态为失败
        await db.query(
          'UPDATE videos SET status = $1 WHERE id = $2',
          ['failed', id]
        );
        cleanedCount++;
        console.log(`   ✅ 任务状态已更新为失败`);
        
        // 3.2. 恢复用户配额（如果已扣除）
        try {
          const quotaResult = await db.restoreVideoQuota(user_id);
          if (quotaResult) {
            quotaRestoredCount++;
            console.log(`   💰 配额已恢复: ${quotaResult.videos_used_this_month}/${quotaResult.monthly_video_quota}`);
          }
        } catch (quotaError) {
          console.error(`   ❌ 配额恢复失败:`, quotaError.message);
        }
        
        // 3.3. 通知用户（如果任务很久）
        if (minutes_ago > 60) { // 超过1小时才通知
          try {
            await lineClient.pushMessage({
              to: line_user_id,
              messages: [{
                type: 'text',
                text: `🔄 申し訳ございません。\n\n先ほどの動画生成でシステムエラーが発生しました。利用枠は消費されておりません。\n\n📱 メインメニューから新しい動画生成をお試しください。`
              }]
            });
            notifiedCount++;
            console.log(`   📤 用户通知已发送`);
          } catch (notifyError) {
            console.error(`   ❌ 用户通知发送失败:`, notifyError.message);
          }
        }
        
        // 3.4. 切换用户到主菜单（重置Rich Menu）
        try {
          // 这里可以添加Rich Menu切换逻辑
          // 但需要导入LineAdapter，暂时跳过
          console.log(`   🔄 用户应切换到主菜单 (需要手动处理)`);
        } catch (menuError) {
          console.error(`   ❌ 菜单切换失败:`, menuError.message);
        }
        
      } catch (taskError) {
        console.error(`   ❌ 处理任务失败:`, taskError.message);
      }
      
      console.log('   ---');
    }
    
    // 4. 总结报告
    console.log(`\n📊 清理完成报告:`);
    console.log(`   🧹 清理任务数: ${cleanedCount}/${stuckTasks.rows.length}`);
    console.log(`   💰 恢复配额数: ${quotaRestoredCount}`);
    console.log(`   📤 通知用户数: ${notifiedCount}`);
    
  } catch (error) {
    console.error('❌ 清理过程出错:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  cleanupStuckTasks()
    .then(() => {
      console.log('✅ 清理完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 清理失败:', error);
      process.exit(1);
    });
}

module.exports = cleanupStuckTasks;
