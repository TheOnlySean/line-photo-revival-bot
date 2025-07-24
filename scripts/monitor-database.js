const db = require('../config/database');

async function monitorDatabase() {
  console.log('🔍 数据库监控开始...');
  let monitorCount = 0;
  const maxMonitors = 20; // 最多监控20次
  
  const monitorInterval = setInterval(async () => {
    monitorCount++;
    console.log(`\n📊 ===== 监控第 ${monitorCount} 次 =====`);
    console.log('⏰ 时间:', new Date().toISOString());
    
    try {
      // 1. 连接池状态
      const poolStatus = db.getPoolStatus();
      console.log('🏊 连接池状态:', {
        总连接数: poolStatus.totalCount,
        空闲连接数: poolStatus.idleCount,
        等待连接数: poolStatus.waitingCount,
        使用率: `${Math.round((poolStatus.totalCount - poolStatus.idleCount) / poolStatus.totalCount * 100)}%`
      });
      
      // 2. 数据库健康检查
      const healthCheck = await db.healthCheck();
      if (healthCheck.healthy) {
        console.log('✅ 数据库连接正常:', { 响应时间: healthCheck.duration + 'ms' });
      } else {
        console.error('❌ 数据库连接异常:', healthCheck.error);
      }
      
      // 3. 测试用户查询
      const testUserId = 'test_monitor_user';
      const userQueryStart = Date.now();
      try {
        await db.getUserByLineId(testUserId);
        const userQueryDuration = Date.now() - userQueryStart;
        console.log('👤 用户查询测试:', { 响应时间: userQueryDuration + 'ms' });
      } catch (userError) {
        console.log('👤 用户查询测试: 用户不存在（正常）');
      }
      
      // 4. 测试基础查询
      const tableQueryStart = Date.now();
      try {
        const result = await db.query('SELECT COUNT(*) as total FROM users LIMIT 1');
        const tableQueryDuration = Date.now() - tableQueryStart;
        console.log('📊 表查询测试:', { 
          用户总数: result.rows[0]?.total || 0,
          响应时间: tableQueryDuration + 'ms' 
        });
      } catch (tableError) {
        console.error('❌ 表查询失败:', tableError.message);
      }
      
      // 5. 性能警告
      if (healthCheck.duration > 5000) {
        console.error('🚨 严重警告: 数据库响应超过5秒！');
      } else if (healthCheck.duration > 2000) {
        console.warn('⚠️ 警告: 数据库响应较慢 (>2秒)');
      } else if (healthCheck.duration > 1000) {
        console.log('💡 提示: 数据库响应有点慢 (>1秒)');
      }
      
      if (poolStatus.waitingCount > 0) {
        console.warn('⚠️ 连接池警告: 有请求在等待连接!', {
          等待数量: poolStatus.waitingCount
        });
      }
      
    } catch (error) {
      console.error('❌ 监控过程中出错:', error.message);
    }
    
    // 监控完成检查
    if (monitorCount >= maxMonitors) {
      console.log(`\n🏁 监控完成 (共${maxMonitors}次)`);
      console.log('💡 监控总结:');
      console.log('- 如果看到大量慢查询，可能需要优化索引');
      console.log('- 如果连接池经常满，可能需要调整max配置');
      console.log('- 如果健康检查经常失败，可能是网络或服务器问题');
      
      clearInterval(monitorInterval);
      process.exit(0);
    }
    
  }, 5000); // 每5秒监控一次
  
  // 优雅退出处理
  process.on('SIGINT', () => {
    console.log('\n🛑 收到退出信号，正在停止监控...');
    clearInterval(monitorInterval);
    process.exit(0);
  });
  
  console.log('📈 监控正在运行... (按 Ctrl+C 停止)');
  console.log(`⏱️ 将监控 ${maxMonitors} 次，每次间隔5秒`);
}

// 显示使用帮助
function showHelp() {
  console.log(`
🔍 数据库监控工具

功能：
- 实时监控数据库连接池状态
- 检查数据库响应时间和健康状态  
- 测试常用查询的性能
- 提供性能警告和建议

使用方法：
  node scripts/monitor-database.js

监控指标：
- 连接池使用率
- 数据库响应时间
- 查询执行时间
- 连接等待情况

警告级别：
- 绿色: 响应时间 < 1秒
- 黄色: 响应时间 1-2秒  
- 橙色: 响应时间 2-5秒
- 红色: 响应时间 > 5秒

按 Ctrl+C 随时停止监控
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    monitorDatabase();
  }
}

module.exports = monitorDatabase; 