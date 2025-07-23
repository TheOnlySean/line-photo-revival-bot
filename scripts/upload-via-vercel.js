const axios = require('axios');

const VERCEL_URL = 'https://line-photo-revival-bot.vercel.app';

async function uploadViaVercel() {
  try {
    console.log('🔄 通过Vercel API上传Rich Menu图片...');
    console.log('📡 Vercel URL:', VERCEL_URL);
    
    // 调用Vercel的Rich Menu设置API
    const response = await axios.post(`${VERCEL_URL}/api/setup-rich-menu`, {}, {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      console.log('✅ Rich Menu通过Vercel设置成功！');
      console.log('📋 结果:', response.data);
      
      // 强制刷新所有用户的Rich Menu
      console.log('🔄 强制刷新用户Rich Menu...');
      const resetResponse = await axios.post(`${VERCEL_URL}/api/reset-user-richmenu`, {
        userId: 'all'
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (resetResponse.data.success) {
        console.log('✅ 用户Rich Menu刷新成功！');
      }
      
      console.log('🎉 完整设置完成！');
      console.log('⚠️ 请重启LINE应用测试新配置');
      console.log('🧪 然后点击Rich Menu按钮测试postback功能');
      
    } else {
      console.error('❌ Rich Menu设置失败:', response.data);
    }
    
  } catch (error) {
    console.error('❌ 调用Vercel API失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', error.response.data);
    }
  }
}

// 运行脚本
uploadViaVercel(); 