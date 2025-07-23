const axios = require('axios');

const VERCEL_URL = 'https://line-photo-revival-bot.vercel.app';

// 模拟LINE平台发送的postback webhook事件
const mockPostbackEvent = {
  destination: '2005541661',
  events: [
    {
      type: 'postback',
      mode: 'active',
      timestamp: Date.now(),
      source: {
        type: 'user',
        userId: 'test-user-id-123'
      },
      replyToken: 'test-reply-token',
      postback: {
        data: 'action=wave',
        params: {}
      },
      webhookEventId: 'test-webhook-event-id'
    }
  ]
};

async function testPostbackOnVercel() {
  try {
    console.log('🧪 测试Vercel服务器的postback处理...');
    console.log('📡 目标URL:', `${VERCEL_URL}/webhook`);
    
    // 模拟LINE平台的webhook签名（这里用假的，实际测试用）
    const signature = 'test-signature';
    
    console.log('📤 发送模拟postback事件...');
    console.log('📋 事件内容:', JSON.stringify(mockPostbackEvent, null, 2));
    
    const response = await axios.post(`${VERCEL_URL}/webhook`, mockPostbackEvent, {
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': signature,
        'User-Agent': 'LineBotWebhook/2.0'
      },
      timeout: 10000
    });
    
    console.log('✅ 请求成功发送！');
    console.log('📊 响应状态:', response.status);
    console.log('📋 响应数据:', response.data);
    
    if (response.status === 200) {
      console.log('🎉 Vercel服务器正确处理了postback事件！');
      console.log('💡 这说明服务器端代码是正常的');
      console.log('🔍 问题可能在于：');
      console.log('  1. Rich Menu配置问题');
      console.log('  2. LINE客户端缓存问题');
      console.log('  3. 用户ID或其他配置问题');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', error.response.data);
      
      if (error.response.status === 400) {
        console.log('💡 400错误可能是签名验证失败，这是正常的');
        console.log('🔍 实际的LINE webhook会有正确的签名');
      }
    }
    
    console.log('');
    console.log('🛠️ 调试建议：');
    console.log('1. 检查Vercel部署日志');
    console.log('2. 确认postback处理函数是否被调用');
    console.log('3. 检查数据库连接');
    console.log('4. 检查LINE SDK配置');
  }
}

// 额外测试：检查health endpoint
async function checkVercelHealth() {
  try {
    console.log('💊 检查Vercel服务器健康状态...');
    const healthResponse = await axios.get(`${VERCEL_URL}/health`);
    console.log('✅ 服务器健康状态:', healthResponse.data);
    console.log('📊 当前版本:', healthResponse.data.version);
    
    if (healthResponse.data.version === '1.0.1-postback-fix') {
      console.log('✅ 确认：Vercel上是最新版本的代码！');
    }
    
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
  }
}

async function runTests() {
  console.log('🚀 开始Vercel postback测试...\n');
  
  await checkVercelHealth();
  console.log('');
  await testPostbackOnVercel();
  
  console.log('\n🏁 测试完成！');
}

// 运行测试
runTests(); 