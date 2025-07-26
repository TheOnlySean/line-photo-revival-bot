const line = require('@line/bot-sdk');
const lineConfig = require('../../config/line-config');
const db = require('../../config/database');
const VideoGenerator = require('../../services/video-generator');
const LineAdapter = require('../../adapters/line-adapter');

// 移除 LINE SDK 依賴，使用 VideoGenerator 直接檢查任務

// GET /api/cron/check-tasks - 適配新數據庫結構
module.exports = async (req, res) => {
  // 仅允许 GET / HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const startTime = Date.now();

  try {
    console.log('🕒 Cron: 检查视频生成任务开始');

    // 查找仍在进行中的视频任务（適配新數據庫結構）
    const pendingQuery = `
      SELECT DISTINCT u.line_user_id
      FROM videos v
      JOIN users u ON u.id = v.user_id
      WHERE v.status IN ('processing', 'pending')
      AND v.task_id IS NOT NULL
      LIMIT 50;
    `;
    const { rows } = await db.query(pendingQuery);
    console.log(`🔍 发现 ${rows.length} 个用户有进行中的任务`);

    if (rows.length === 0) {
      const duration = Date.now() - startTime;
      res.status(200).json({ 
        ok: true, 
        processedUsers: 0, 
        msg: '暂无待处理任务',
        duration: `${duration}ms`
      });
      return;
    }

    // 創建LINE客戶端用於發送消息
    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: lineConfig.channelAccessToken
    });
    
    // 創建 LineAdapter 實例用於 Rich Menu 管理
    const lineAdapter = new LineAdapter();
    
    // 創建消息回調函數
    const messageCallback = async (eventType, data) => {
      if (eventType === 'video_completed') {
        const { lineUserId, videoUrl, thumbnailUrl } = data;
        try {
          // 發送視頻完成消息
          const message = {
            type: 'video',
            originalContentUrl: videoUrl,
            previewImageUrl: thumbnailUrl || videoUrl
          };
          
          await lineClient.pushMessage({
            to: lineUserId,
            messages: [
              { type: 'text', text: '✅ 動画生成が完了しました！' },
              message
            ]
          });
          
          // 切換回主菜單 (使用 LineAdapter)
          try {
            await lineAdapter.switchToMainMenu(lineUserId);
          } catch (menuError) {
            console.error('❌ 切換主菜單失敗:', menuError);
          }
          
          console.log('✅ 自動發送視頻完成通知成功');
        } catch (error) {
          console.error('❌ 自動發送視頻完成通知失敗:', error);
        }
      } else if (eventType === 'video_failed') {
        const { lineUserId, errorMessage } = data;
        try {
          await lineClient.pushMessage({
            to: lineUserId,
            messages: [{
              type: 'text',
              text: `❌ 動画生成に失敗しました：${errorMessage || '再度お試しください'}`
            }]
          });
          
          // 切換回主菜單 (使用 LineAdapter)
          try {
            await lineAdapter.switchToMainMenu(lineUserId);
          } catch (menuError) {
            console.error('❌ 切換主菜單失敗:', menuError);
          }
          
          console.log('✅ 自動發送視頻失敗通知成功');
        } catch (error) {
          console.error('❌ 自動發送視頻失敗通知失敗:', error);
        }
      }
    };
    
    const videoGenerator = new VideoGenerator(db, messageCallback);

    let processedUsers = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const lineUserId = row.line_user_id;
      try {
        console.log(`📌 處理用戶 ${lineUserId}`);
        
        // 檢查用戶的待處理任務
        await videoGenerator.checkPendingTasks(lineUserId);
        
        processedUsers++;
        successCount++;
        
        console.log(`✅ 用户 ${lineUserId} 任务检查完成`);
      } catch (error) {
        console.error(`❌ 检查用户任务失败 ${lineUserId}:`, error.message);
        errorCount++;
      }
    }

    // === 简化的恢复机制 ===
    // 检查是否有长时间无任务但可能卡在 processing menu 的用户
    try {
      console.log('🔍 检查可能卡住的用户...');
      
      // 查找最近15分钟内没有任务但可能需要恢复的用户
      // 这里我们查找最近有过任务但现在没有进行中任务的用户
      const stuckUsersQuery = `
        SELECT DISTINCT u.line_user_id, u.id as user_id, 
               MAX(v.created_at) as last_task_time,
               COUNT(CASE WHEN v.status IN ('processing', 'pending') THEN 1 END) as active_tasks
        FROM users u
        LEFT JOIN videos v ON u.id = v.user_id
        WHERE v.created_at > NOW() - INTERVAL '30 minutes'
        GROUP BY u.line_user_id, u.id
        HAVING COUNT(CASE WHEN v.status IN ('processing', 'pending') THEN 1 END) = 0
           AND MAX(v.created_at) < NOW() - INTERVAL '10 minutes'
        LIMIT 10
      `;
      
      const stuckUsers = await db.query(stuckUsersQuery);
      
      if (stuckUsers.rows.length > 0) {
        console.log(`🚨 发现 ${stuckUsers.rows.length} 个可能卡住的用户`);
        
        // 创建 LINE 客户端用于恢复操作
        const lineClient = new line.messagingApi.MessagingApiClient({
          channelAccessToken: lineConfig.channelAccessToken
        });
        
        for (const stuckUser of stuckUsers.rows) {
          try {
            const { line_user_id, last_task_time } = stuckUser;
            const minutesAgo = Math.round((Date.now() - new Date(last_task_time).getTime()) / 60000);
            
            console.log(`🔄 恢复用户 ${line_user_id} (最后任务: ${minutesAgo}分钟前)`);
            
            // 切换回主菜单
            const richMenuIds = require('../../config/richmenu-ids.json');
            await lineClient.linkRichMenuToUser(line_user_id, richMenuIds.mainRichMenuId);
            
            // 发送友好的恢复消息
            await lineClient.pushMessage({
              to: line_user_id,
              messages: [{
                type: 'text',
                text: '🔄 システムが正常に復旧しました。\n\n📱 メインメニューに戻りました。新しい動画生成を開始できます。'
              }]
            });
            
            console.log(`✅ 用户 ${line_user_id} 已恢复到主菜单`);
            
          } catch (recoveryError) {
            console.error(`❌ 恢复用户失败 ${stuckUser.line_user_id}:`, recoveryError.message);
          }
        }
      } else {
        console.log('✅ 没有发现卡住的用户');
      }
      
    } catch (recoveryError) {
      console.error('❌ 恢复机制执行失败:', recoveryError.message);
    }

    const duration = Date.now() - startTime;
    
    console.log(`🏁 Cron任务完成: 处理${processedUsers}个用户, 成功${successCount}, 失败${errorCount}, 耗时${duration}ms`);

    res.status(200).json({
      ok: true,
      processedUsers,
      successCount,
      errorCount,
      duration: `${duration}ms`,
      msg: `任务检查完成: ${successCount}成功, ${errorCount}失败`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ 检查待完成任务失败:', error);
    
    res.status(500).json({
      ok: false,
      error: error.message,
      duration: `${duration}ms`,
      msg: '任务检查过程中发生错误'
    });
  }
};