const line = require('@line/bot-sdk');
const lineConfig = require('../../config/line-config');
const db = require('../../config/database');
const LineBot = require('../../services/line-bot');
const VideoGenerator = require('../../services/video-generator');

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

    // 初始化 LINE 客户端和工具
    const client = new line.Client({
      channelSecret: lineConfig.channelSecret,
      channelAccessToken: lineConfig.channelAccessToken
    });
    const lineBot = new LineBot(client, db);
    const videoGenerator = new VideoGenerator(db, lineBot);

    let processedUsers = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const lineUserId = row.line_user_id;
      try {
        console.log(`📌 处理用户 ${lineUserId}`);
        
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