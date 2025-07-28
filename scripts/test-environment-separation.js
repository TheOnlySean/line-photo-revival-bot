/**
 * 环境分离测试脚本
 * 验证开发/生产环境的数据隔离是否正常工作
 */

const db = require('../config/database');

async function testEnvironmentSeparation() {
  console.log('🧪 开始测试环境分离...');
  
  const currentEnv = process.env.NODE_ENV || 'development';
  console.log(`📍 当前环境: ${currentEnv}`);
  
  try {
    // 1. 测试用户数据环境过滤
    console.log('\n📊 测试用户数据环境过滤...');
    const allUsers = await db.query('SELECT line_user_id, environment FROM users ORDER BY created_at');
    console.log('所有用户:', allUsers.rows);
    
    // 测试环境过滤的用户查询
    if (allUsers.rows.length > 0) {
      const testUserId = allUsers.rows[0].line_user_id;
      const user = await db.getUser(testUserId);
      console.log(`✅ getUser('${testUserId}')结果:`, user ? `找到用户(环境: ${user.environment})` : '未找到');
    }

    // 2. 测试视频数据环境过滤
    console.log('\n🎬 测试视频数据环境过滤...');
    const allVideos = await db.query('SELECT id, user_id, environment FROM videos ORDER BY created_at');
    console.log('所有视频:', allVideos.rows);
    
    if (allVideos.rows.length > 0) {
      const testUserId = allVideos.rows[0].user_id;
      const pendingTasks = await db.getUserPendingTasks(testUserId);
      console.log(`✅ getUserPendingTasks(${testUserId})结果:`, pendingTasks.length, '个任务');
    }

    // 3. 测试订阅数据环境过滤
    console.log('\n💳 测试订阅数据环境过滤...');
    const allSubscriptions = await db.query('SELECT user_id, environment, status FROM subscriptions ORDER BY created_at');
    console.log('所有订阅:', allSubscriptions.rows);
    
    if (allSubscriptions.rows.length > 0) {
      const testUserId = allSubscriptions.rows[0].user_id;
      const subscription = await db.getUserSubscription(testUserId);
      console.log(`✅ getUserSubscription(${testUserId})结果:`, subscription ? `找到订阅(环境: ${subscription.environment})` : '未找到');
    }

    // 4. 测试环境统计
    console.log('\n📈 环境数据统计:');
    
    const devUsers = await db.query("SELECT COUNT(*) FROM users WHERE environment = 'development'");
    const prodUsers = await db.query("SELECT COUNT(*) FROM users WHERE environment = 'production'");
    
    const devVideos = await db.query("SELECT COUNT(*) FROM videos WHERE environment = 'development'");
    const prodVideos = await db.query("SELECT COUNT(*) FROM videos WHERE environment = 'production'");
    
    const devSubs = await db.query("SELECT COUNT(*) FROM subscriptions WHERE environment = 'development'");
    const prodSubs = await db.query("SELECT COUNT(*) FROM subscriptions WHERE environment = 'production'");
    
    console.log('Development 环境:');
    console.log(`  - 用户: ${devUsers.rows[0].count} 个`);
    console.log(`  - 视频: ${devVideos.rows[0].count} 个`);
    console.log(`  - 订阅: ${devSubs.rows[0].count} 个`);
    
    console.log('Production 环境:');
    console.log(`  - 用户: ${prodUsers.rows[0].count} 个`);
    console.log(`  - 视频: ${prodVideos.rows[0].count} 个`);
    console.log(`  - 订阅: ${prodSubs.rows[0].count} 个`);

    // 5. 测试创建新用户（应该自动使用当前环境）
    console.log('\n👤 测试创建新用户...');
    const testLineUserId = `test_${Date.now()}`;
    const newUser = await db.ensureUserExists(testLineUserId, 'Test User');
    console.log(`✅ 创建用户结果:`, {
      id: newUser.id,
      line_user_id: newUser.line_user_id,
      environment: newUser.environment,
      expected_env: currentEnv
    });
    
    // 验证环境是否正确
    if (newUser.environment === currentEnv) {
      console.log('🎉 环境标识正确！');
    } else {
      console.log('❌ 环境标识错误！');
    }
    
    // 清理测试数据
    await db.query('DELETE FROM users WHERE line_user_id = $1', [testLineUserId]);
    console.log('🧹 已清理测试数据');

    console.log('\n🎉 环境分离测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testEnvironmentSeparation()
    .then(() => {
      console.log('✅ 测试脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = testEnvironmentSeparation; 