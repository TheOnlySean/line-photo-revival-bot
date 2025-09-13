/**
 * 检查特定用户的海报相关状态
 */

const db = require('../config/database');

async function checkUserPosterStatus(userId) {
  console.log(`🔍 检查用户 ${userId} 的海报状态...\n`);

  try {
    // 1. 检查用户基本信息
    console.log('👤 用户基本信息:');
    const userInfo = await db.query(
      'SELECT id, line_user_id, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userInfo.rows.length === 0) {
      console.log('❌ 用户不存在');
      return { success: false, error: '用户不存在' };
    }
    
    const user = userInfo.rows[0];
    console.log(`- 用户ID: ${user.id}`);
    console.log(`- LINE用户ID: ${user.line_user_id}`);
    console.log(`- 注册时间: ${user.created_at}`);

    // 2. 检查订阅状态
    console.log('\n💳 订阅状态:');
    const subscription = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [userId]
    );
    
    if (subscription.rows.length === 0) {
      console.log('❌ 没有订阅记录');
      console.log('⚠️  这可能是问题所在：没有订阅的用户需要先创建基础记录！');
    } else {
      const sub = subscription.rows[0];
      console.log('✅ 找到订阅记录:');
      console.log(`- 计划类型: ${sub.plan_type}`);
      console.log(`- 状态: ${sub.status}`);
      console.log(`- 海报配额: ${sub.monthly_poster_quota}`);
      console.log(`- 已用海报: ${sub.posters_used_this_month}`);
      console.log(`- 首次免费状态: ${sub.first_poster_used ? '已使用' : '未使用'} (${sub.first_poster_used})`);
      console.log(`- 创建时间: ${sub.created_at}`);
    }

    // 3. 检查海报生成历史
    console.log('\n📸 海报生成历史:');
    const posterHistory = await db.query(
      'SELECT * FROM poster_tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    console.log(`- 总生成次数: ${posterHistory.rows.length}`);
    if (posterHistory.rows.length > 0) {
      console.log('- 最近生成记录:');
      posterHistory.rows.slice(0, 3).forEach((task, index) => {
        console.log(`  ${index + 1}. ID=${task.id}, 状态=${task.status}, 时间=${task.created_at}`);
      });
    }

    // 4. 测试配额检查功能
    console.log('\n🔍 测试配额检查功能:');
    try {
      const quotaCheck = await db.checkPosterQuota(userId);
      console.log('✅ 配额检查结果:');
      console.log(`- hasQuota: ${quotaCheck.hasQuota}`);
      console.log(`- remaining: ${quotaCheck.remaining}`);
      console.log(`- total: ${quotaCheck.total}`);
      console.log(`- isFirstFree: ${quotaCheck.isFirstFree || false}`);
      console.log(`- planType: ${quotaCheck.planType || 'undefined'}`);
      console.log(`- isUnlimited: ${quotaCheck.isUnlimited}`);
    } catch (quotaError) {
      console.log('❌ 配额检查失败:', quotaError.message);
    }

    return {
      success: true,
      user: user,
      hasSubscription: subscription.rows.length > 0,
      subscription: subscription.rows[0] || null,
      posterHistory: posterHistory.rows
    };

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 运行脚本
if (require.main === module) {
  const userId = process.argv[2] || 7; // 默认检查用户ID 7
  
  checkUserPosterStatus(parseInt(userId))
    .then((result) => {
      console.log('\n✅ 检查完成');
      if (result.success) {
        console.log('\n🎯 问题诊断:');
        if (!result.hasSubscription) {
          console.log('❌ 主要问题: 用户没有订阅记录，首次免费逻辑无法生效');
          console.log('💡 解决方案: 需要为无订阅用户创建基础记录');
        } else if (result.subscription?.first_poster_used) {
          console.log('❌ 主要问题: 用户已被标记为使用过首次免费');
          console.log('💡 解决方案: 需要重置first_poster_used为false');
        } else {
          console.log('✅ 数据看起来正常，可能是其他逻辑问题');
        }
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = checkUserPosterStatus;
