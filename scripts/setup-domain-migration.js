/**
 * 域名迁移设置脚本
 * 帮助配置开发/生产环境的域名分离
 */

console.log('🌐 LINE Bot 域名迁移设置指南');
console.log('=====================================\n');

console.log('📋 推荐域名配置：');
console.log('');
console.log('🔴 生产环境:');
console.log('  Project Name: line-photo-revival-bot');  
console.log('  Domain: line-photo-revival-bot.vercel.app');
console.log('  Environment: production');
console.log('  LINE Webhook: https://line-photo-revival-bot.vercel.app/webhook');
console.log('');
console.log('🟡 开发环境:');
console.log('  Project Name: line-photo-revival-bot-dev');
console.log('  Domain: line-photo-revival-bot-dev.vercel.app');
console.log('  Environment: development');
console.log('  LINE Webhook: https://line-photo-revival-bot-dev.vercel.app/webhook');
console.log('');

console.log('🔧 Vercel 设置步骤：');
console.log('=====================================');
console.log('');
console.log('1️⃣ 创建生产环境项目:');
console.log('   - 前往 Vercel Dashboard');
console.log('   - 点击 "New Project"');
console.log('   - 项目名称: line-photo-revival-bot');
console.log('   - 连接到您的 GitHub 仓库');
console.log('   - 部署分支: main (或 production)');
console.log('');

console.log('2️⃣ 重命名现有项目为开发环境:');
console.log('   - 进入现有项目的 Settings');
console.log('   - General → Project Name');
console.log('   - 改名为: line-photo-revival-bot-dev');
console.log('');

console.log('🔑 环境变量配置：');
console.log('=====================================');
console.log('');
console.log('🔴 生产环境变量 (line-photo-revival-bot):');
console.log('   NODE_ENV=production');
console.log('   LINE_CHANNEL_SECRET=[新的生产环境Secret]');
console.log('   LINE_CHANNEL_ACCESS_TOKEN=[新的生产环境Token]');
console.log('   LINE_CHANNEL_ID=[新的生产环境ID]');
console.log('   [其他共用变量保持不变]');
console.log('');

console.log('🟡 开发环境变量 (line-photo-revival-bot-dev):');
console.log('   NODE_ENV=development');  
console.log('   LINE_CHANNEL_SECRET=[原有开发环境Secret]');
console.log('   LINE_CHANNEL_ACCESS_TOKEN=[原有开发环境Token]');
console.log('   LINE_CHANNEL_ID=[原有开发环境ID]');
console.log('   [其他共用变量保持不变]');
console.log('');

console.log('📱 LINE Developer Console 配置：');
console.log('=====================================');
console.log('');
console.log('🔴 生产环境 LINE Channel:');
console.log('   Webhook URL: https://line-photo-revival-bot.vercel.app/webhook');
console.log('   ✅ Use webhook: Enabled');
console.log('   ✅ Verify 按钮测试连接');
console.log('');

console.log('🟡 开发环境 LINE Channel:');
console.log('   Webhook URL: https://line-photo-revival-bot-dev.vercel.app/webhook');
console.log('   ✅ Use webhook: Enabled');
console.log('   ✅ Verify 按钮测试连接');
console.log('');

console.log('✅ 验证清单：');
console.log('=====================================');
console.log('[ ] 生产环境项目创建完成');
console.log('[ ] 开发环境项目重命名完成');
console.log('[ ] 生产环境环境变量配置完成');
console.log('[ ] 开发环境环境变量配置完成');
console.log('[ ] 生产环境 LINE Webhook 配置完成');
console.log('[ ] 开发环境 LINE Webhook 配置完成');
console.log('[ ] 生产环境 Webhook 连接测试通过');
console.log('[ ] 开发环境 Webhook 连接测试通过');
console.log('');

console.log('🚀 测试建议：');
console.log('=====================================');
console.log('1. 首先在开发环境测试所有功能');
console.log('2. 确认环境分离数据隔离正常');
console.log('3. 验证 Stripe 支付环境标识正确');
console.log('4. 最后在生产环境进行最终测试');
console.log('');

console.log('💡 小贴士：');
console.log('- Vercel 会自动为每个项目分配域名');
console.log('- 环境变量中的 VERCEL_URL 会自动设置为当前域名');
console.log('- 支付 URL 会根据 VERCEL_URL 自动调整');
console.log('- 数据库和 Stripe API 两个环境共用，通过 metadata 区分');
console.log('');

console.log('🎉 完成后您将拥有：');
console.log('✅ 稳定的生产环境 (line-photo-revival-bot.vercel.app)');
console.log('✅ 安全的开发环境 (line-photo-revival-bot-dev.vercel.app)');
console.log('✅ 完全隔离的数据环境');
console.log('✅ 专业的部署流程'); 