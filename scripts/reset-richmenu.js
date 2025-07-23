const axios = require('axios');

// 从环境变量或命令行参数获取部署URL
const VERCEL_URL = process.env.VERCEL_URL || process.argv[2] || 'https://line-photo-revival-bot.vercel.app';

async function resetRichMenu() {
  try {
    console.log('🔄 正在重新设置Rich Menu...');
    console.log(`📡 目标URL: ${VERCEL_URL}`);
    
    // 调用重新设置Rich Menu的API
    const response = await axios.post(`${VERCEL_URL}/api/setup-rich-menu`, {}, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      console.log('✅ Rich Menu重新设置成功！');
      console.log('📋 结果:', response.data);
    } else {
      console.error('❌ Rich Menu设置失败:', response.data);
    }
    
  } catch (error) {
    console.error('❌ 调用API失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', error.response.data);
    }
  }
}

// 运行脚本
resetRichMenu(); 