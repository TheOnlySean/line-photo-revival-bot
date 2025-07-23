const axios = require('axios');
const lineConfig = require('../config/line-config');

async function testKieAiApi() {
  console.log('🧪 开始测试KIE.ai API连接...');
  console.log('🔑 API Key:', lineConfig.kieAi.apiKey.substring(0, 8) + '...');
  console.log('🌐 Base URL:', lineConfig.kieAi.baseUrl);
  
  try {
    // 测试1: 检查账户状态
    console.log('\n📋 测试1: 检查账户连接状态');
    try {
      const accountResponse = await axios.get(`${lineConfig.kieAi.baseUrl}/api/v1/common/account`, {
        headers: {
          'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`
        },
        timeout: 10000
      });
      
      console.log('✅ 账户API连接成功:', accountResponse.status);
      console.log('📊 账户信息:', accountResponse.data);
    } catch (accountError) {
      console.log('⚠️ 账户API连接失败 (这可能是正常的):', accountError.message);
    }

    // 测试2: 测试视频生成API端点
    console.log('\n📋 测试2: 测试视频生成API端点');
    const testImageUrl = 'https://example.com/test.jpg';
    
    const generateData = {
      prompt: "Test prompt for API connectivity",
      imageUrl: testImageUrl,
      aspectRatio: '1:1',
      duration: 5,
      quality: '720p',
      waterMark: ''
    };

    console.log('📤 测试生成端点:', `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.generateEndpoint}`);
    console.log('📦 测试数据:', generateData);

    try {
      const generateResponse = await axios.post(
        `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.generateEndpoint}`,
        generateData,
        {
          headers: {
            'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000,
          validateStatus: () => true // 接受所有状态码进行分析
        }
      );

      console.log('📡 生成API响应状态:', generateResponse.status);
      console.log('📡 生成API响应数据:', generateResponse.data);

      if (generateResponse.status === 200 && generateResponse.data.code === 200) {
        console.log('✅ 生成API连接成功');
        
        // 如果有taskId，测试状态查询API
        if (generateResponse.data.data && generateResponse.data.data.taskId) {
          console.log('\n📋 测试3: 测试状态查询API');
          const taskId = generateResponse.data.data.taskId;
          console.log('🎯 Task ID:', taskId);
          
          try {
            const statusResponse = await axios.get(
              `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.detailEndpoint}`,
              {
                params: { taskId },
                headers: {
                  'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`
                },
                timeout: 10000
              }
            );
            
            console.log('📡 状态API响应:', statusResponse.status, statusResponse.data);
            console.log('✅ 状态查询API连接成功');
          } catch (statusError) {
            console.log('❌ 状态查询API失败:', statusError.message);
            if (statusError.response) {
              console.log('❌ 状态API错误详情:', statusError.response.status, statusError.response.data);
            }
          }
        }
      } else {
        console.log('⚠️ 生成API返回错误状态');
      }
      
    } catch (generateError) {
      console.log('❌ 生成API连接失败:', generateError.message);
      if (generateError.response) {
        console.log('❌ 生成API错误详情:', generateError.response.status, generateError.response.data);
      }
    }

    console.log('\n🎉 KIE.ai API测试完成！');
    console.log('\n💡 如果生成API返回错误，请检查：');
    console.log('   1. API Key是否正确');
    console.log('   2. 图片URL是否可访问');
    console.log('   3. 参数格式是否符合API要求');
    console.log('   4. 账户余额是否充足');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

if (require.main === module) {
  testKieAiApi();
}

module.exports = testKieAiApi; 