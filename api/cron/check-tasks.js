const line = require('@line/bot-sdk');
const lineConfig = require('../../config/line-config');
const db = require('../../config/database');
const VideoGenerator = require('../../services/video-generator');

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
          
          // 切換回主菜單
          try {
            const richMenuIds = require('../../config/richmenu-ids.json');
            await lineClient.linkRichMenuToUser({
              userId: lineUserId,
              richMenuId: richMenuIds.mainRichMenuId
            });
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
          
          // 切換回主菜單
          try {
            const richMenuIds = require('../../config/richmenu-ids.json');
            await lineClient.linkRichMenuToUser({
              userId: lineUserId,
              richMenuId: richMenuIds.mainRichMenuId
            });
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