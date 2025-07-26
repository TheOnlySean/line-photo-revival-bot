const line = require('@line/bot-sdk');
const lineConfig = require('../../config/line-config');
const db = require('../../config/database');
const LineBot = require('../../services/line-bot');
const VideoGenerator = require('../../services/video-generator');

// GET /api/cron/check-tasks - Fixed Database import issue
module.exports = async (req, res) => {
  // 仅允许 GET / HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const startTime = Date.now();

  try {
    console.log('🕒 Cron: 检查视频生成任务开始');

    // 查找仍在进行中的视频任务
    const pendingQuery = `
      SELECT DISTINCT u.line_id
      FROM videos v
      JOIN users u ON u.id = v.user_id
      WHERE v.status IN ('processing','generating','queueing','wait')
      AND v.task_id IS NOT NULL
      LIMIT 50;
    `;
    const { rows } = await db.query(pendingQuery);
    console.log(`🔍 发现 ${rows.length} 个用户有进行中的任务`);

    if (rows.length === 0) {
      res.status(200).json({ ok: true, processedUsers: 0, msg: '暂无待处理任务' });
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

    for (const row of rows) {
      const lineId = row.line_id;
      try {
        console.log(`📌 处理用户 ${lineId}`);
        const result = await videoGenerator.checkPendingTasks(lineId);
        if (result.success) {
          processedUsers++;
        }
      } catch (userErr) {
        console.error(`❌ 处理用户 ${lineId} 失败:`, userErr.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cron 完成，处理 ${processedUsers} 个用户，用时 ${duration}ms`);

    res.status(200).json({ ok: true, processedUsers, duration });
  } catch (error) {
    console.error('❌ Cron 任务失败:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}; 