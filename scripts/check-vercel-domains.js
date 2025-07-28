/**
 * Vercel 域名分配机制说明
 * 解释开发和生产环境的不同域名
 */

console.log('🌐 Vercel 域名分配机制');
console.log('==========================================\n');

console.log('📋 同一个 Vercel 项目的不同域名：');
console.log('');

console.log('🔴 Production 环境 (主域名):');
console.log('  当部署到 main 分支时:');
console.log('  └── https://line-photo-revival-bot.vercel.app');
console.log('  这是您的正式域名，用于生产环境');
console.log('');

console.log('🟡 Development 环境 (分支域名):');
console.log('  当部署到其他分支时:');
console.log('  ├── https://line-photo-revival-bot-git-dev-yourname.vercel.app');
console.log('  ├── https://line-photo-revival-bot-git-feature-yourname.vercel.app');
console.log('  └── 或其他分支域名...');
console.log('');

console.log('💡 关键理解:');
console.log(' - 每个 Git 分支部署都有独立的域名');
console.log(' - main 分支 = 生产域名 (line-photo-revival-bot.vercel.app)');
console.log(' - 其他分支 = 开发域名 (带分支名的域名)');
console.log('');

console.log('📱 LINE Webhook URL 配置建议:');
console.log('==========================================');
console.log('');

console.log('🔴 新的正式 LINE 账号 (Production):');
console.log('   Webhook URL: https://line-photo-revival-bot.vercel.app/webhook');
console.log('   ✅ 这个域名对应 main 分支的部署');
console.log('   ✅ NODE_ENV 自动设置为 production');
console.log('');

console.log('🟡 原有测试 LINE 账号 (Development):');
console.log('   选项 1 - 使用相同域名 (简单方案):');
console.log('   └── https://line-photo-revival-bot.vercel.app/webhook');
console.log('   ✅ 代码会根据 LINE 账号信息自动判断环境');
console.log('');
console.log('   选项 2 - 使用开发分支域名 (完全隔离):');
console.log('   └── https://line-photo-revival-bot-git-dev-yourname.vercel.app/webhook');
console.log('   ✅ 完全独立的开发环境');
console.log('');

console.log('🎯 推荐方案:');
console.log('==========================================');
console.log('');
console.log('对于您的情况，推荐 **选项1 - 使用相同域名**:');
console.log('');
console.log('✅ 优势:');
console.log('  - 配置简单，两个账号都指向同一个域名');
console.log('  - 代码会自动根据 LINE Channel 信息判断环境');
console.log('  - 我们已经做好了环境隔离逻辑');
console.log('');
console.log('🔧 工作原理:');
console.log('  1. 两个 LINE 账号都发送到同一个 webhook');
console.log('  2. 代码检查接收到的 LINE Channel ID');
console.log('  3. 根据 Channel ID 判断是开发还是生产环境');
console.log('  4. 自动处理对应环境的数据');
console.log('');

console.log('📝 配置总结:');
console.log('==========================================');
console.log('');
console.log('🔴 新的正式 LINE 账号:');
console.log('   Webhook: https://line-photo-revival-bot.vercel.app/webhook');
console.log('');
console.log('🟡 原有测试 LINE 账号:');
console.log('   Webhook: https://line-photo-revival-bot.vercel.app/webhook');
console.log('   (是的，可以是相同的URL！)');
console.log('');

console.log('💡 为什么可以用相同的URL？');
console.log('因为我们的代码会根据以下信息自动判断环境：');
console.log('├── LINE Channel ID');
console.log('├── Vercel 环境变量');  
console.log('└── 数据库环境字段');
console.log('');

console.log('🎉 结论: 两个账号可以使用相同的 Webhook URL！'); 