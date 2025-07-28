const https = require('https');

const setupProductionRichMenu = () => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      adminKey: 'setup-production-richmenu-2024'
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

    console.log('🚀 正在调用生产环境Rich Menu设置API...');
    console.log('🔗 URL: https://line-photo-revival-bot.vercel.app/api/setup/production-richmenu');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log('✅ Rich Menu设置成功！');
            console.log('📋 结果:', result);
            resolve(result);
          } else {
            console.error('❌ API调用失败:', res.statusCode);
            console.error('错误详情:', result);
            reject(new Error(`API调用失败: ${res.statusCode}`));
          }
        } catch (error) {
          console.error('❌ 解析响应失败:', error);
          console.error('原始响应:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ 请求失败:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
};

// 如果直接运行此脚本
if (require.main === module) {
  setupProductionRichMenu()
    .then((result) => {
      console.log('\n🎉 生产环境Rich Menu设置完成！');
      console.log('📋 Main Menu ID:', result.mainRichMenuId);
      console.log('📋 Processing Menu ID:', result.processingRichMenuId);
      console.log('🕐 设置时间:', result.timestamp);
      
      console.log('\n✅ 下一步：');
      console.log('1. 重新添加新正式LINE账号为好友');
      console.log('2. 发送消息测试Rich Menu显示');
      console.log('3. 测试欢迎消息和演示功能');
      
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 设置失败:', error.message);
      process.exit(1);
    });
}

module.exports = { setupProductionRichMenu }; 