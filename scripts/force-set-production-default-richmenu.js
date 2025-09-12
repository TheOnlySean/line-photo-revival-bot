/**
 * 强制设置生产环境默认Rich Menu脚本
 * 确保生产环境用户能看到Rich Menu
 */

const https = require('https');

const forceSetProductionDefaultRichMenu = () => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      adminKey: 'setup-production-richmenu-2024',
      action: 'setDefault',
      richMenuId: 'richmenu-5cefd7b5ec7e15d51178e0e827615da0' // 最新的生产环境主菜单ID
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

    console.log('🔄 强制设置生产环境默认Rich Menu...');
    console.log('🔗 URL: https://line-photo-revival-bot.vercel.app/api/setup/production-richmenu');
    console.log('🆔 目标菜单ID: richmenu-5cefd7b5ec7e15d51178e0e827615da0');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log('✅ 默认Rich Menu设置成功！');
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

// 主函数
async function main() {
  try {
    console.log('🚀 开始强制设置生产环境默认Rich Menu...\n');
    
    // 尝试设置默认菜单
    const result = await forceSetProductionDefaultRichMenu();
    
    console.log('\n🎉 操作完成！');
    console.log('\n📝 后续建议:');
    console.log('1. 如果您还看不到菜单，请尝试：');
    console.log('   • 删除Bot好友，然后重新添加');
    console.log('   • 发送任意消息给Bot');
    console.log('   • 等待1-2分钟让服务器同步');
    console.log('');
    console.log('2. 如果菜单出现但功能异常：');
    console.log('   • 检查中间按钮是否显示为"昭和カバー"');
    console.log('   • 测试点击按钮是否有响应');
    console.log('   • 查看控制台日志确认API调用');

    return result;
    
  } catch (error) {
    console.error('❌ 设置失败:', error.message);
    
    console.log('\n🔧 替代方案:');
    console.log('1. 等待5-10分钟让LINE服务器完全同步');
    console.log('2. 重新添加Bot为好友');
    console.log('3. 发送消息触发菜单显示');
    console.log('4. 如果仍然有问题，可能需要检查LINE Channel配置');
    
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = forceSetProductionDefaultRichMenu;
