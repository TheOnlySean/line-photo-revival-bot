/**
 * 检查特定KIE.AI任务状态的本地脚本
 * 快速诊断任务失败原因
 */

const axios = require('axios');
const lineConfig = require('../config/line-config');

async function checkSpecificTask(taskId) {
  console.log(`🔍 检查KIE.AI任务状态 - TaskID: ${taskId}`);
  
  try {
    const kieAi = {
      apiKey: lineConfig.kieAi.apiKey,
      baseUrl: 'https://api.kie.ai',
      queryTaskEndpoint: '/api/v1/jobs/recordInfo'
    };

    if (!kieAi.apiKey) {
      console.error('❌ KIE.AI API Key未配置');
      return;
    }

    console.log('📡 直接查询KIE.AI API...');
    console.log(`API Key: ${kieAi.apiKey.substring(0, 8)}...`);
    
    const response = await axios.get(
      `${kieAi.baseUrl}${kieAi.queryTaskEndpoint}?taskId=${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${kieAi.apiKey}`
        },
        timeout: 15000
      }
    );

    console.log('📊 KIE.AI API响应:', response.status);
    console.log('📋 响应数据:', JSON.stringify(response.data, null, 2));

    if (response.data.code === 200) {
      const taskData = response.data.data;
      
      console.log('\n📊 任务详细信息:');
      console.log(`状态: ${taskData.state}`);
      console.log(`模型: ${taskData.model}`);
      console.log(`创建时间: ${new Date(taskData.createTime).toLocaleString()}`);
      console.log(`更新时间: ${new Date(taskData.updateTime).toLocaleString()}`);
      
      if (taskData.completeTime) {
        console.log(`完成时间: ${new Date(taskData.completeTime).toLocaleString()}`);
      }
      
      // 计算实际处理时间
      const createTime = taskData.createTime;
      const finalTime = taskData.completeTime || taskData.updateTime;
      const actualProcessingTime = (finalTime - createTime) / 1000;
      console.log(`实际处理时间: ${actualProcessingTime.toFixed(1)}秒`);

      // 分析问题
      console.log('\n🔍 问题分析:');
      
      switch (taskData.state) {
        case 'success':
          console.log('✅ 任务成功完成！');
          if (taskData.resultJson) {
            const resultJson = JSON.parse(taskData.resultJson);
            console.log('🖼️ 生成结果URLs:', resultJson.resultUrls);
            console.log('🚨 问题: 我们的轮询逻辑没有正确处理成功状态！');
          }
          break;
          
        case 'fail':
          console.log('❌ 任务在KIE.AI那边失败了');
          console.log(`失败代码: ${taskData.failCode}`);
          console.log(`失败原因: ${taskData.failMsg}`);
          console.log('🔍 分析: KIE.AI处理失败，不是我们的问题');
          break;
          
        case 'waiting':
          console.log('⏳ 任务仍在等待队列中');
          console.log('🔍 分析: KIE.AI队列较忙，处理较慢');
          break;
          
        case 'queuing':
          console.log('⏳ 任务仍在处理队列中');
          console.log('🔍 分析: KIE.AI正在处理，但速度较慢');
          break;
          
        case 'generating':
          console.log('🎨 任务仍在生成中');
          console.log('🔍 分析: KIE.AI正在生成，但时间超过预期');
          break;
          
        default:
          console.log(`🤔 未知状态: ${taskData.state}`);
      }
      
      // 超时分析
      if (actualProcessingTime > 90) {
        console.log(`\n⏰ 超时分析:`);
        console.log(`- KIE.AI实际处理时间: ${actualProcessingTime.toFixed(1)}秒`);
        console.log(`- 我们的超时设置: 90秒 (旧版本)`);
        console.log(`- 结论: 我们的超时设置太短，需要增加到120-150秒`);
      }
      
    } else {
      console.log('❌ KIE.AI API返回错误:');
      console.log(`错误代码: ${response.data.code}`);
      console.log(`错误信息: ${response.data.message}`);
    }

    return {
      success: true,
      taskId: taskId,
      apiResponse: response.data,
      analysis: taskData?.state || 'unknown'
    };

  } catch (error) {
    console.error('❌ 检查任务状态失败:', error.message);
    
    if (error.response) {
      console.log('HTTP错误:', error.response.status);
      console.log('响应数据:', error.response.data);
    }
    
    if (error.code === 'ECONNABORTED') {
      console.log('🔍 分析: 查询KIE.AI API超时，可能网络问题');
    }
    
    return {
      success: false,
      error: error.message,
      analysis: 'api_connection_failed'
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const taskId = process.argv[2] || '1f6c3766fa3f7c9ad9f490907b0a4bf4';
  
  checkSpecificTask(taskId)
    .then((result) => {
      console.log('\n✅ 检查完成');
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = checkSpecificTask;
