/**
 * NODE_ENV 演示脚本
 * 展示 NODE_ENV 如何影响应用行为
 */

console.log('🔍 NODE_ENV 演示');
console.log('==========================================\n');

// 1. 获取当前环境
const currentEnv = process.env.NODE_ENV || 'development';
console.log(`📍 当前环境: ${currentEnv}`);
console.log(`📍 原始 NODE_ENV: ${process.env.NODE_ENV || '(未设置，使用默认值)'}\n`);

// 2. 演示环境判断
console.log('🎛️ 环境判断示例:');
if (currentEnv === 'development') {
  console.log('✅ 开发环境 - 显示详细日志');
  console.log('✅ 开发环境 - 连接测试 LINE 账号');
  console.log('✅ 开发环境 - 数据库查询: WHERE environment = "development"');
} else if (currentEnv === 'production') {
  console.log('🔴 生产环境 - 精简日志输出');
  console.log('🔴 生产环境 - 连接正式 LINE 账号');
  console.log('🔴 生产环境 - 数据库查询: WHERE environment = "production"');
}

console.log('\n🗃️ 数据库环境过滤演示:');
console.log(`SQL: SELECT * FROM users WHERE environment = '${currentEnv}'`);
console.log(`结果: 只返回 ${currentEnv} 环境的用户数据\n`);

// 3. 演示 Stripe 环境标识
console.log('💳 Stripe 支付环境标识:');
const stripeMetadata = {
  userId: 'user123',
  planType: 'standard',
  environment: currentEnv  // 这里会标记支付属于哪个环境
};
console.log('支付订单 metadata:', JSON.stringify(stripeMetadata, null, 2));

console.log('\n🔗 LINE Webhook 连接:');
if (currentEnv === 'development') {
  console.log('📱 连接到: 原有测试 LINE 账号');
  console.log('🌐 域名: 开发环境域名');
} else {
  console.log('📱 连接到: 新的正式 LINE 账号');  
  console.log('🌐 域名: line-photo-revival-bot.vercel.app');
}

console.log('\n🎯 关键作用总结:');
console.log('1. 🎚️ 控制应用行为（日志级别、错误显示等）');
console.log('2. 🗄️ 数据环境隔离（同一数据库，不同环境数据）');
console.log('3. 📱 LINE 账号路由（开发账号 vs 正式账号）');
console.log('4. 💳 支付环境标记（区分测试订单和正式订单）');
console.log('5. 🔧 功能开关（某些功能只在特定环境启用）');

console.log('\n💡 总结:');
console.log(`NODE_ENV 就像一个"环境开关"，告诉应用：`);
console.log(`"我现在运行在 ${currentEnv} 环境，请使用对应的配置和行为"`);

console.log('\n🚀 在 Vercel 中:');
console.log('- Development 部署 → 自动设置 NODE_ENV=development');
console.log('- Production 部署 → 自动设置 NODE_ENV=production');
console.log('- 同一套代码，不同环境，不同行为！'); 