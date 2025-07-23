const axios = require('axios');

const VERCEL_URL = 'https://line-photo-revival-bot.vercel.app';

async function forceResetUserRichMenu() {
  try {
    console.log('🔄 强制重置用户Rich Menu...');
    console.log('📡 通过Vercel API强制重置...');
    
    // 调用Vercel的重置API
    const resetResponse = await axios.post(`${VERCEL_URL}/api/reset-user-richmenu`, {
      userId: 'all', // 重置所有用户
      forceRefresh: true
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 重置响应:', resetResponse.data);
    
    if (resetResponse.data.success) {
      console.log('✅ 用户Rich Menu重置成功！');
      
      // 额外：再次检查Rich Menu状态
      console.log('🔍 检查当前Rich Menu状态...');
      const statusResponse = await axios.get(`${VERCEL_URL}/api/check-rich-menu-images`, {
        timeout: 15000
      });
      
      console.log('📋 当前Rich Menu状态:', statusResponse.data);
      
    } else {
      console.log('⚠️ 重置可能失败:', resetResponse.data);
    }
    
    console.log('');
    console.log('🧪 现在请按以下步骤测试：');
    console.log('1. 🔴 完全关闭LINE应用（从后台彻底清除）');
    console.log('2. ⏰ 等待30秒');
    console.log('3. 🔵 重新打开LINE应用');
    console.log('4. 💬 进入你的bot对话');
    console.log('5. 👆 点击Rich Menu按钮');
    console.log('');
    console.log('📋 期望结果：机器人应该回复：');
    console.log('   "👋【手振り動画生成】が選択されました"');
    console.log('   而不是你发送"手振り"文本消息');
    
  } catch (error) {
    console.error('❌ 重置失败:', error.message);
    
    if (error.response && error.response.data) {
      console.error('📋 错误详情:', error.response.data);
    }
    
    console.log('');
    console.log('🛠️ 手动解决步骤：');
    console.log('1. 在LINE应用中删除这个bot的对话');
    console.log('2. 重新添加bot为好友');
    console.log('3. 这会强制刷新Rich Menu');
    console.log('4. 或者等待24小时让LINE自动同步');
  }
}

// 运行脚本
forceResetUserRichMenu(); 