const axios = require('axios');
const lineConfig = require('../config/line-config');

// 测试KIE.AI Runway API连接
async function testRunwayApi() {
  try {
    console.log('🔍 测试KIE.AI Runway API连接...');
    console.log('========================');
    
    const config = lineConfig.kieAi;
    console.log(`🔗 API Base URL: ${config.baseUrl}`);
    console.log(`🔑 API Key: ${config.apiKey.substring(0, 8)}****`);
    console.log('');

    // 测试账户信息API
    console.log('📊 测试账户信息API...');
    try {
      const accountResponse = await axios.get(
        `${config.baseUrl}/api/v1/common/account`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (accountResponse.data && accountResponse.data.code === 200) {
        console.log('✅ 账户信息API连接成功');
        console.log(`💰 账户余额信息:`, accountResponse.data.data || '无详细信息');
      } else {
        console.log('⚠️ 账户信息API响应异常:', accountResponse.data);
      }
    } catch (error) {
      console.log('❌ 账户信息API连接失败:', error.response?.data || error.message);
    }

    console.log('');

    // 测试Runway API (使用测试图片URL)
    console.log('🎬 测试Runway视频生成API...');
    
    const testImageUrl = 'https://images.unsplash.com/photo-1494790108755-2616b9dd4240?w=400';
    const requestData = {
      prompt: "Test video generation - a person with natural expressions and subtle movements",
      imageUrl: testImageUrl,
      aspectRatio: config.defaultParams.aspectRatio,
      duration: config.defaultParams.duration,
      quality: config.defaultParams.quality,
      waterMark: config.defaultParams.waterMark
    };

    console.log('📤 发送测试请求:', {
      ...requestData,
      imageUrl: 'https://images.unsplash.com/photo-1494790108755-2616b9dd4240 (测试图片)'
    });

    try {
      const generateResponse = await axios.post(
        `${config.baseUrl}${config.generateEndpoint}`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      console.log('📡 API响应状态:', generateResponse.status);
      console.log('📡 API响应数据:', generateResponse.data);

      if (generateResponse.data && generateResponse.data.code === 200) {
        console.log('✅ Runway API连接成功');
        const taskId = generateResponse.data.data.taskId;
        console.log(`🎯 任务ID: ${taskId}`);
        
        if (taskId) {
          console.log('');
          console.log('🔍 测试任务状态查询API...');
          
          // 等待3秒后查询状态
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          try {
            const statusResponse = await axios.get(
              `${config.baseUrl}${config.detailEndpoint}`,
              {
                params: { taskId },
                headers: {
                  'Authorization': `Bearer ${config.apiKey}`
                },
                timeout: 30000
              }
            );

            console.log('📊 任务状态查询结果:', statusResponse.data);
            
            if (statusResponse.data && statusResponse.data.code === 200) {
              console.log('✅ 任务状态查询API连接成功');
              const status = statusResponse.data.data.status;
              console.log(`📈 当前任务状态: ${status}`);
              
              if (status === 'wait' || status === 'queueing' || status === 'generating') {
                console.log('⏳ 任务正在处理中，这是正常的');
              }
            } else {
              console.log('⚠️ 任务状态查询响应异常');
            }
          } catch (error) {
            console.log('❌ 任务状态查询失败:', error.response?.data || error.message);
          }
        }
      } else {
        console.log('❌ Runway API请求失败:', generateResponse.data);
      }
    } catch (error) {
      console.log('❌ Runway API连接失败:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        console.log('💡 提示: API Key可能无效，请检查配置');
      } else if (error.response?.status === 429) {
        console.log('💡 提示: 请求频率过高，请稍后再试');
      } else if (error.response?.status >= 500) {
        console.log('💡 提示: API服务器错误，请稍后再试');
      }
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

// 测试LINE Bot配置
async function testLineConfig() {
  console.log('');
  console.log('🤖 测试LINE Bot配置...');
  console.log('========================');
  
  const config = lineConfig;
  
  console.log(`📱 Channel ID: ${config.channelId}`);
  console.log(`🔐 Channel Secret: ${config.channelSecret.substring(0, 8)}****`);
  console.log(`🎫 Access Token: ${config.channelAccessToken.substring(0, 20)}****`);
  console.log(`🔗 Webhook URL: ${config.webhookUrl}`);
  console.log('');
  
  // 验证配置完整性
  if (!config.channelId || !config.channelSecret || !config.channelAccessToken) {
    console.log('❌ LINE Bot配置不完整');
    return false;
  }
  
  console.log('✅ LINE Bot配置完整');
  return true;
}

// 测试数据库连接
async function testDatabase() {
  console.log('');
  console.log('💾 测试数据库连接...');
  console.log('========================');
  
  try {
    const db = require('../config/database');
    
    // 测试基础连接
    const result = await db.query('SELECT 1 as test');
    console.log('✅ 数据库连接成功');
    
    // 检查必要的表
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'videos', 'line_demo_contents', 'line_interactions')
    `);
    
    console.log('📋 检查数据表:');
    const tableNames = tables.rows.map(row => row.table_name);
    
    ['users', 'videos', 'line_demo_contents', 'line_interactions'].forEach(tableName => {
      if (tableNames.includes(tableName)) {
        console.log(`  ✅ ${tableName} 表存在`);
      } else {
        console.log(`  ❌ ${tableName} 表不存在`);
      }
    });
    
    // 检查演示内容
    const demoCount = await db.query('SELECT COUNT(*) as count FROM line_demo_contents');
    console.log(`🎬 演示内容数量: ${demoCount.rows[0].count} 条`);
    
    if (demoCount.rows[0].count === 0) {
      console.log('💡 提示: 请运行 "node scripts/init-demo-content.js" 初始化演示内容');
    }
    
    await db.close();
    return true;
    
  } catch (error) {
    console.log('❌ 数据库连接失败:', error.message);
    return false;
  }
}

// 主测试函数
async function main() {
  console.log('🚀 LINE Bot 系统测试');
  console.log('=====================');
  console.log('');
  
  let allTestsPassed = true;
  
  // 测试数据库
  const dbTest = await testDatabase();
  allTestsPassed = allTestsPassed && dbTest;
  
  // 测试LINE配置
  const lineTest = await testLineConfig();
  allTestsPassed = allTestsPassed && lineTest;
  
  // 测试KIE.AI API
  await testRunwayApi();
  
  console.log('');
  console.log('📊 测试总结');
  console.log('============');
  
  if (allTestsPassed) {
    console.log('🎉 基础配置测试通过！');
    console.log('');
    console.log('📝 下一步:');
    console.log('1. 启动服务器: npm start');
    console.log('2. 使用ngrok暴露端口: ngrok http 3000');
    console.log('3. 在LINE Developer Console设置Webhook URL');
    console.log('4. 测试LINE Bot功能');
  } else {
    console.log('❌ 部分配置测试失败，请检查上述错误');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testRunwayApi,
  testLineConfig,
  testDatabase
}; 