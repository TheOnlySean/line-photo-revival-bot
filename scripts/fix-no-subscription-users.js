/**
 * 为没有订阅记录的用户创建基础订阅记录
 * 使其能够享受首次免费功能
 */

const db = require('../config/database');

async function fixNoSubscriptionUsers() {
  console.log('🔧 修复没有订阅记录的用户...\n');

  try {
    // 1. 找出没有订阅记录但有海报生成历史的用户
    const usersWithoutSubscription = await db.query(`
      SELECT DISTINCT u.id, u.line_user_id, u.created_at,
             COUNT(pt.id) as poster_count,
             MIN(pt.created_at) as first_poster_date
      FROM users u
      LEFT JOIN poster_tasks pt ON u.id = pt.user_id
      LEFT JOIN subscriptions s ON u.id = s.user_id
      WHERE s.user_id IS NULL AND pt.id IS NOT NULL
      GROUP BY u.id, u.line_user_id, u.created_at
      ORDER BY u.id
    `);

    console.log(`📊 找到 ${usersWithoutSubscription.rows.length} 个需要修复的用户\n`);

    if (usersWithoutSubscription.rows.length === 0) {
      console.log('✅ 没有需要修复的用户');
      return { success: true, fixedUsers: 0 };
    }

    // 2. 为每个用户创建基础订阅记录
    let fixedCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutSubscription.rows) {
      try {
        console.log(`🔄 处理用户 ${user.id} (${user.line_user_id}):`);
        console.log(`   - 已生成海报: ${user.poster_count} 张`);
        console.log(`   - 首次生成: ${user.first_poster_date}`);

        // 判断是否应该标记为已使用首次免费
        const hasUsedFirst = user.poster_count > 0;
        
        // 创建基础订阅记录（无计划状态）
        const result = await db.query(`
          INSERT INTO subscriptions (
            user_id, 
            plan_type, 
            status, 
            monthly_video_quota, 
            videos_used_this_month,
            monthly_poster_quota, 
            posters_used_this_month,
            first_poster_used,
            current_period_start,
            current_period_end,
            created_at,
            updated_at
          ) VALUES (
            $1, 'none', 'inactive', 
            0, 0, 0, 0, 
            $2, 
            NOW(), NOW() + INTERVAL '30 days',
            NOW(), NOW()
          ) RETURNING id
        `, [user.id, hasUsedFirst]);

        if (result.rows.length > 0) {
          console.log(`   ✅ 创建基础订阅记录成功 (ID: ${result.rows[0].id})`);
          console.log(`   🎁 首次免费状态: ${hasUsedFirst ? '已使用' : '可使用'}`);
          fixedCount++;
        }

      } catch (userError) {
        console.log(`   ❌ 处理用户 ${user.id} 失败: ${userError.message}`);
        errorCount++;
      }
      
      console.log(''); // 空行分隔
    }

    // 3. 验证结果
    console.log('📊 处理结果:');
    console.log(`✅ 成功修复: ${fixedCount} 个用户`);
    console.log(`❌ 处理失败: ${errorCount} 个用户`);

    // 4. 特别处理用户ID 7
    console.log('\n🎯 特别检查用户ID 7:');
    const user7Check = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = 7'
    );
    
    if (user7Check.rows.length > 0) {
      const sub = user7Check.rows[0];
      console.log('✅ 用户7现在有订阅记录:');
      console.log(`   - first_poster_used: ${sub.first_poster_used}`);
      console.log(`   - plan_type: ${sub.plan_type}`);
      console.log(`   - status: ${sub.status}`);
      
      // 重新测试配额检查
      const quotaCheck = await db.checkPosterQuota(7);
      console.log('🔍 重新测试配额检查:');
      console.log(`   - hasQuota: ${quotaCheck.hasQuota}`);
      console.log(`   - isFirstFree: ${quotaCheck.isFirstFree || false}`);
    }

    return {
      success: true,
      fixedUsers: fixedCount,
      errorUsers: errorCount
    };

  } catch (error) {
    console.error('❌ 修复过程出错:', error.message);
    return { success: false, error: error.message };
  }
}

// 运行脚本
if (require.main === module) {
  fixNoSubscriptionUsers()
    .then((result) => {
      console.log('\n✅ 修复脚本完成');
      console.log('📊 结果:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = fixNoSubscriptionUsers;
