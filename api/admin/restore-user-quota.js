/**
 * 恢复用户配额API
 * 恢复被错误扣除的配额
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  try {
    const lineUserId = 'U23ea34c52091796e999d10f150460c78';
    
    // 查找用户
    const user = await db.query(`
      SELECT id FROM users WHERE line_user_id = $1
    `, [lineUserId]);
    
    if (user.rows.length === 0) {
      return res.json({ success: false, error: 'User not found' });
    }
    
    const userId = user.rows[0].id;
    
    // 重置海报配额为满额
    await db.query(`
      UPDATE subscriptions 
      SET posters_used_this_month = 0
      WHERE user_id = $1 AND status = 'active'
    `, [userId]);
    
    // 检查结果
    const quota = await db.checkPosterQuota(userId);
    
    return res.json({
      success: true,
      message: '用户海报配额已恢复',
      quota: quota,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
