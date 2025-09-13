/**
 * 添加首次海报免费功能的数据库字段
 */

const db = require('../config/database');

async function addFirstPosterFreeField() {
  console.log('🎨 添加首次海报免费功能的数据库字段...\n');

  try {
    // 1. 添加字段
    console.log('📊 添加 first_poster_used 字段...');
    await db.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS first_poster_used BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ 字段添加成功');

    // 2. 初始化现有用户数据
    console.log('\n🔄 初始化现有用户数据...');
    
    // 查询已经生成过海报的用户（从poster_tasks表）
    const usersWithPosters = await db.query(`
      SELECT DISTINCT s.user_id 
      FROM subscriptions s
      INNER JOIN poster_tasks pt ON s.user_id = pt.user_id
      WHERE pt.status = 'completed'
    `);

    if (usersWithPosters.rows.length > 0) {
      // 将已生成过海报的用户标记为已使用首次免费
      const userIds = usersWithPosters.rows.map(row => row.user_id);
      await db.query(`
        UPDATE subscriptions 
        SET first_poster_used = TRUE 
        WHERE user_id = ANY($1)
      `, [userIds]);
      
      console.log(`✅ 已将 ${usersWithPosters.rows.length} 个已生成海报的用户标记为已使用首次免费`);
    }

    // 3. 验证结果
    console.log('\n📊 验证数据状态...');
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN first_poster_used = TRUE THEN 1 END) as users_used_first,
        COUNT(CASE WHEN first_poster_used = FALSE THEN 1 END) as users_can_free
      FROM subscriptions
    `);
    
    const stat = stats.rows[0];
    console.log(`📋 用户统计：`);
    console.log(`- 总用户数: ${stat.total_users}`);
    console.log(`- 已使用首次免费: ${stat.users_used_first}`);
    console.log(`- 可享受首次免费: ${stat.users_can_free}`);

    console.log('\n🎉 首次海报免费功能数据库准备完成！');

    return {
      success: true,
      totalUsers: parseInt(stat.total_users),
      usersUsedFirst: parseInt(stat.users_used_first),
      usersCanFree: parseInt(stat.users_can_free)
    };

  } catch (error) {
    console.error('❌ 添加字段失败:', error.message);
    throw error;
  }
}

// 运行脚本
if (require.main === module) {
  addFirstPosterFreeField()
    .then((result) => {
      console.log('\n✅ 脚本执行完成');
      console.log('📊 结果:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = addFirstPosterFreeField;
