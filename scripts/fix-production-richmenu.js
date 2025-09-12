/**
 * 修复生产环境Rich Menu问题
 * 确保生产环境正确显示新的昭和カバー菜单
 */

const https = require('https');

// 方案1: 重新完整部署
async function redeployProductionRichMenu() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      adminKey: 'setup-production-richmenu-2024',
      forceRecreate: true
    });

    const options = {
      hostname: 'line-photo-revival-bot.vercel.app',
      port: 443,
      path: '/api/setup/production-richmenu',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-admin-key': 'setup-production-richmenu-2024'
      }
    };

    console.log('🔄 重新部署生产环境Rich Menu...');

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log('✅ 重新部署成功！');
            console.log('📋 结果:', result);
            resolve(result);
          } else {
            console.error('❌ 重新部署失败:', res.statusCode, result);
            reject(new Error(`重新部署失败: ${res.statusCode}`));
          }
        } catch (error) {
          console.error('❌ 解析响应失败:', error);
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 方案2: 直接使用cURL调用（更可靠）
function generateCurlCommand() {
  return `curl -X POST "https://line-photo-revival-bot.vercel.app/api/setup/production-richmenu" \\
  -H "Content-Type: application/json" \\
  -H "x-admin-key: setup-production-richmenu-2024" \\
  -d '{"adminKey": "setup-production-richmenu-2024", "forceRecreate": true}'`;
}

async function main() {
  console.log('🔧 修复生产环境Rich Menu问题...\n');
  
  try {
    // 方案1: 使用Node.js重新部署
    console.log('1️⃣ 尝试重新部署...');
    const result = await redeployProductionRichMenu();
    
    console.log('\n✅ 重新部署完成！');
    console.log('📋 新的菜单ID:');
    console.log(`   主菜单: ${result.mainRichMenuId}`);
    console.log(`   Processing菜单: ${result.processingRichMenuId}`);
    
    console.log('\n⏰ 请等待1-2分钟，然后：');
    console.log('1. 删除Bot好友并重新添加');
    console.log('2. 或发送任意消息给Bot');
    console.log('3. 检查菜单中间按钮是否显示"昭和カバー"');
    
  } catch (error) {
    console.error('❌ Node.js部署失败:', error.message);
    
    console.log('\n🔧 备用方案 - 手动cURL调用:');
    console.log('如果上面的方法失败，请在终端运行以下命令：');
    console.log('');
    console.log(generateCurlCommand());
    console.log('');
    console.log('然后检查响应是否成功。');
  }
  
  console.log('\n📝 故障排除提示:');
  console.log('如果菜单还是没有更新：');
  console.log('1. ⏰ 等待5-10分钟（LINE服务器同步时间）');
  console.log('2. 👥 完全删除Bot好友，重新添加');
  console.log('3. 💬 发送消息给Bot触发菜单显示');
  console.log('4. 📱 重启LINE应用');
  console.log('5. 🔍 检查生产环境TOKEN配置是否正确');
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ 修复脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 修复脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { redeployProductionRichMenu, generateCurlCommand };
