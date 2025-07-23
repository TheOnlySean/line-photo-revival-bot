const axios = require('axios');
const lineConfig = require('../config/line-config');

async function testVideoPolling() {
  console.log('🧪 开始测试KIE.ai视频轮询过程...');
  console.log('🔑 API Key:', lineConfig.kieAi.apiKey.substring(0, 8) + '...');
  console.log('🌐 Base URL:', lineConfig.kieAi.baseUrl);
  
  try {
    // 步骤1: 提交视频生成任务
    console.log('\n📋 步骤1: 提交视频生成任务');
    const testImageUrl = 'https://example.com/test.jpg';
    
    const generateData = {
      prompt: "Test video generation for polling diagnostics",
      imageUrl: testImageUrl,
      aspectRatio: '1:1',
      duration: 5,
      quality: '720p',
      waterMark: ''
    };

    console.log('📤 发送生成请求:', `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.generateEndpoint}`);
    
    const generateResponse = await axios.post(
      `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.generateEndpoint}`,
      generateData,
      {
        headers: {
          'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('📡 生成API响应:', generateResponse.status, generateResponse.data);

    if (generateResponse.status === 200 && generateResponse.data.code === 200) {
      const taskId = generateResponse.data.data.taskId;
      console.log('✅ 任务提交成功，Task ID:', taskId);
      
      // 步骤2: 开始轮询测试
      console.log('\n📋 步骤2: 开始轮询测试 (最多测试10次)');
      await testPollingProcess(taskId, 10);
      
    } else {
      console.error('❌ 任务提交失败:', generateResponse.data);
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.response) {
      console.error('❌ API错误详情:', error.response.status, error.response.data);
    }
  }
}

async function testPollingProcess(taskId, maxPolls = 10) {
  console.log(`🔄 开始轮询测试 - Task ID: ${taskId}`);
  
  for (let i = 1; i <= maxPolls; i++) {
    console.log(`\n🔍 ===== 轮询第 ${i}/${maxPolls} 次 =====`);
    
    try {
      const statusResponse = await axios.get(
        `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.detailEndpoint}`,
        {
          params: { taskId },
          headers: {
            'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`
          },
          timeout: 30000
        }
      );
      
      console.log('📡 状态API响应:', statusResponse.status);
      console.log('📊 响应数据:', JSON.stringify(statusResponse.data, null, 2));
      
      if (statusResponse.data && statusResponse.data.code === 200) {
        const data = statusResponse.data.data;
        const status = data.state;
        const videoInfo = data.videoInfo;
        
        console.log('✅ 状态解析:');
        console.log('   - 原始状态:', data.state);
        console.log('   - 生成时间:', data.generateTime);
        console.log('   - 视频信息:', videoInfo ? '有' : '无');
        console.log('   - 失效标志:', data.expireFlag);
        console.log('   - 失败代码:', data.failCode);
        console.log('   - 失败消息:', data.failMsg);
        
        if (videoInfo) {
          console.log('🎬 视频信息详情:', videoInfo);
        }
        
        // 判断是否完成
        switch (status) {
          case 'success':
          case 'completed':
            console.log('🎉 视频生成成功！');
            if (videoInfo && videoInfo.videoUrl) {
              console.log('✅ 视频URL可用:', videoInfo.videoUrl);
            } else {
              console.log('⚠️ 生成成功但无视频URL');
            }
            return; // 完成，停止轮询
            
          case 'fail':
          case 'failed':
          case 'error':
            console.log('❌ 视频生成失败');
            return; // 失败，停止轮询
            
          case 'wait':
          case 'queueing':
          case 'generating':
          case 'processing':
            console.log(`⏳ 仍在处理中 (${status})，继续轮询...`);
            break;
            
          default:
            console.log(`⚠️ 未知状态: ${status}`);
        }
        
      } else {
        console.error('❌ 状态API返回错误:', statusResponse.data);
      }
      
    } catch (error) {
      console.error('❌ 轮询请求失败:', error.message);
      if (error.response) {
        console.error('❌ 错误详情:', error.response.status, error.response.data);
      }
    }
    
    // 等待15秒后继续下一次轮询 (除非是最后一次)
    if (i < maxPolls) {
      console.log('⏱️ 等待15秒后继续轮询...');
      await sleep(15000);
    }
  }
  
  console.log(`\n🏁 轮询测试完成 (共${maxPolls}次)`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  testVideoPolling();
}

module.exports = testVideoPolling; 