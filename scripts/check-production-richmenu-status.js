/**
 * 检查生产环境Rich Menu状态脚本
 * 验证生产环境的Rich Menu是否正确设置和显示
 */

const axios = require('axios');

async function checkProductionRichMenuStatus() {
  console.log('🔍 检查生产环境Rich Menu状态...\n');
  
  try {
    // 1. 调用检查API
    console.log('📡 调用生产环境Rich Menu状态检查...');
    
    const response = await axios.get('https://line-photo-revival-bot.vercel.app/api/richmenu/status', {
      timeout: 10000
    });

    if (response.status === 200) {
      console.log('✅ API调用成功');
      console.log('📊 Rich Menu状态:', response.data);
      
      const data = response.data;
      
      // 检查关键信息
      console.log('\n📋 详细状态:');
      console.log(`环境: ${data.environment || '未知'}`);
      console.log(`主菜单ID: ${data.mainRichMenuId || '未设置'}`);
      console.log(`Processing菜单ID: ${data.processingRichMenuId || '未设置'}`);
      console.log(`默认菜单: ${data.defaultRichMenuId || '未设置'}`);
      console.log(`初始化状态: ${data.initialized ? '✅ 已初始化' : '❌ 未初始化'}`);
      
      // 验证菜单是否正确
      if (data.mainRichMenuId && data.processingRichMenuId) {
        console.log('\n✅ Rich Menu配置完整');
        
        if (data.defaultRichMenuId === data.mainRichMenuId) {
          console.log('✅ 默认菜单设置正确');
        } else {
          console.log('⚠️ 默认菜单可能没有正确设置');
        }
      } else {
        console.log('\n❌ Rich Menu配置不完整');
      }
      
    } else {
      console.log(`❌ API调用失败: ${response.status}`);
    }

  } catch (error) {
    console.log('❌ 检查Rich Menu状态失败:', error.message);
    
    if (error.response) {
      console.log('HTTP状态码:', error.response.status);
      console.log('响应数据:', error.response.data);
    }
  }

  // 2. 提供故障排除建议
  console.log('\n🔧 故障排除建议:');
  console.log('');
  console.log('如果Rich Menu没有显示:');
  console.log('1. 👥 重新添加Bot为好友 (删除后重新添加)');
  console.log('2. 💬 发送任意消息给Bot触发菜单显示');
  console.log('3. 📱 关闭并重新打开LINE应用');
  console.log('4. ⏰ 等待1-2分钟让LINE服务器同步更新');
  console.log('');
  console.log('如果仍然有问题:');
  console.log('• 检查生产环境TOKEN是否正确配置');
  console.log('• 验证LINE Channel权限设置');
  console.log('• 查看Vercel部署日志确认API运行正常');

}

// 如果直接运行此脚本
if (require.main === module) {
  checkProductionRichMenuStatus()
    .then(() => {
      console.log('\n✅ 检查脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 检查脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = checkProductionRichMenuStatus;
