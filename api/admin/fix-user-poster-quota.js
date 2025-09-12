/**
 * 修复用户海报配额API
 * 为所有Trial/Standard用户正确设置海报配额
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  // 只允许POST请求和管理密钥
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== 'fix-user-poster-quota-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔧 开始修复用户海报配额...');
    
    // 1. 检查当前订阅状态
    console.log('1️⃣ 检查当前订阅状态...');
    const subscriptions = await db.query(`
      SELECT user_id, plan_type, status, monthly_poster_quota, posters_used_this_month,
             monthly_video_quota, videos_used_this_month
      FROM subscriptions 
      WHERE status = 'active'
      ORDER BY plan_type
    `);
    
    console.log(`📊 找到 ${subscriptions.rows.length} 个活跃订阅`);
    
    const beforeStats = {
      trial: 0,
      standard: 0,
      needsFix: 0
    };
    
    subscriptions.rows.forEach(sub => {
      beforeStats[sub.plan_type] = (beforeStats[sub.plan_type] || 0) + 1;
      if (sub.monthly_poster_quota === 0 || sub.monthly_poster_quota === null) {
        beforeStats.needsFix++;
      }
    });
    
    console.log('📊 修复前统计:', beforeStats);

    // 2. 修复Trial用户配额（应该是8张/月）
    console.log('2️⃣ 修复Trial用户海报配额...');
    const trialFixResult = await db.query(`
      UPDATE subscriptions 
      SET monthly_poster_quota = 8,
          posters_used_this_month = 0
      WHERE status = 'active' 
      AND plan_type = 'trial'
      AND (monthly_poster_quota = 0 OR monthly_poster_quota IS NULL)
      RETURNING user_id, plan_type, monthly_poster_quota, posters_used_this_month
    `);
    
    console.log(`✅ 修复了 ${trialFixResult.rowCount} 个Trial用户的海报配额`);

    // 3. 修复Standard用户配额（应该是无限=-1）
    console.log('3️⃣ 修复Standard用户海报配额...');
    const standardFixResult = await db.query(`
      UPDATE subscriptions 
      SET monthly_poster_quota = -1,
          posters_used_this_month = 0
      WHERE status = 'active' 
      AND plan_type = 'standard'
      AND (monthly_poster_quota = 0 OR monthly_poster_quota IS NULL)
      RETURNING user_id, plan_type, monthly_poster_quota, posters_used_this_month
    `);
    
    console.log(`✅ 修复了 ${standardFixResult.rowCount} 个Standard用户的海报配额`);

    // 4. 验证修复结果
    console.log('4️⃣ 验证修复结果...');
    const afterCheck = await db.query(`
      SELECT plan_type, 
             COUNT(*) as count,
             AVG(monthly_poster_quota) as avg_quota,
             MIN(monthly_poster_quota) as min_quota,
             MAX(monthly_poster_quota) as max_quota
      FROM subscriptions 
      WHERE status = 'active'
      GROUP BY plan_type
    `);
    
    console.log('📊 修复后统计:');
    const afterStats = {};
    afterCheck.rows.forEach(row => {
      const quotaDisplay = row.avg_quota == -1 ? '无限' : row.avg_quota;
      console.log(`   ${row.plan_type}: ${row.count}个用户, 配额: ${quotaDisplay}`);
      afterStats[row.plan_type] = {
        count: parseInt(row.count),
        avgQuota: parseFloat(row.avg_quota)
      };
    });

    // 5. 测试配额检查函数
    console.log('5️⃣ 测试修复后的配额检查...');
    const testUsers = await db.query(`
      SELECT user_id, plan_type 
      FROM subscriptions 
      WHERE status = 'active' 
      ORDER BY plan_type 
      LIMIT 2
    `);
    
    const testResults = [];
    for (const testUser of testUsers.rows) {
      try {
        const quota = await db.checkPosterQuota(testUser.user_id);
        testResults.push({
          userId: testUser.user_id,
          planType: testUser.plan_type,
          hasQuota: quota.hasQuota,
          remaining: quota.remaining,
          total: quota.total,
          isUnlimited: quota.isUnlimited || false,
          status: '✅ 正常'
        });
        console.log(`   ✅ 用户${testUser.user_id} (${testUser.plan_type}): 配额${quota.remaining}/${quota.total}${quota.isUnlimited ? ' (无限)' : ''}`);
      } catch (error) {
        testResults.push({
          userId: testUser.user_id,
          planType: testUser.plan_type,
          status: '❌ 错误',
          error: error.message
        });
        console.log(`   ❌ 用户${testUser.user_id} (${testUser.plan_type}): ${error.message}`);
      }
    }

    return res.json({
      success: true,
      message: '用户海报配额修复完成',
      results: {
        beforeStats,
        afterStats,
        trialUsersFixed: trialFixResult.rowCount,
        standardUsersFixed: standardFixResult.rowCount,
        testResults
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 修复用户海报配额失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
