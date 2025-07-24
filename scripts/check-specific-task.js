const axios = require('axios');
const lineConfig = require('../config/line-config');

class TaskChecker {
  constructor() {
    this.kieAiConfig = lineConfig.kieAi;
  }

  // 查询特定Task ID状态
  async checkTaskStatus(taskId) {
    try {
      console.log('🔍 查询Task状态:', taskId);
      
      const response = await axios.get(
        `${this.kieAiConfig.baseUrl}${this.kieAiConfig.detailEndpoint}`,
        {
          params: { taskId },
          headers: {
            'Authorization': `Bearer ${this.kieAiConfig.apiKey}`
          },
          timeout: 60000
        }
      );

      console.log('📡 API响应:', response.data);

      if (response.data && response.data.code === 200) {
        const data = response.data.data;
        const status = data.state;
        const videoInfo = data.videoInfo;
        
        console.log('\n📊 详细状态分析:');
        console.log(`   🎯 任务状态: ${status}`);
        console.log(`   📅 生成时间: ${data.generateTime}`);
        console.log(`   🖼️ 原始图片: ${data.generateParam?.imageUrl}`);
        console.log(`   🎬 视频信息: ${videoInfo ? '有' : '无'}`);
        
        if (videoInfo) {
          console.log(`   📹 视频URL: ${videoInfo.videoUrl || videoInfo.url || '无'}`);
          console.log(`   🖼️ 缩略图: ${videoInfo.thumbnailUrl || videoInfo.thumbnail || '无'}`);
        }
        
        if (data.failMsg) {
          console.log(`   ❌ 错误信息: ${data.failMsg}`);
        }

        const videoUrl = videoInfo?.videoUrl || videoInfo?.url;
        
        // 根据状态给出诊断
        console.log('\n🔧 状态诊断:');
        switch (status) {
          case 'generating':
          case 'queueing':
          case 'wait':
            console.log('   ⏳ 任务正在处理中，需要继续等待');
            break;
          case 'success':
            if (videoUrl) {
              console.log('   ✅ 任务已完成，视频已生成');
              console.log('   🎯 问题：如果用户没收到视频，说明发送逻辑有问题');
            } else {
              console.log('   ⚠️ 任务显示成功但缺少视频URL');
            }
            break;
          case 'fail':
          case 'failed':
            console.log('   ❌ 任务生成失败');
            break;
          default:
            console.log(`   ❓ 未知状态: ${status}`);
        }

        return {
          success: true,
          status: status,
          videoUrl: videoUrl,
          thumbnailUrl: videoInfo?.thumbnailUrl || videoInfo?.thumbnail,
          data: data
        };
      } else {
        console.error('❌ API返回错误:', response.data);
        return { success: false, error: response.data?.message || '查询失败' };
      }

    } catch (error) {
      console.error('❌ 查询失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  // 等待并持续检查任务直到完成
  async waitForCompletion(taskId, maxWaitTime = 300000) {
    console.log(`⏰ 开始监控任务 ${taskId}，最大等待时间 ${maxWaitTime/1000}秒`);
    
    const startTime = Date.now();
    const pollInterval = 15000; // 15秒间隔
    
    while (Date.now() - startTime < maxWaitTime) {
      const result = await this.checkTaskStatus(taskId);
      
      if (!result.success) {
        console.log('❌ 查询失败，停止监控');
        return result;
      }
      
      const status = result.status;
      
      if (status === 'success') {
        console.log('🎉 任务完成！');
        return result;
      } else if (status === 'fail' || status === 'failed') {
        console.log('❌ 任务失败！');
        return result;
      } else {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏳ 继续等待... (${elapsed}秒已过去，状态: ${status})`);
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    console.log('⏰ 超时，停止监控');
    return { success: false, error: '监控超时' };
  }
}

async function main() {
  const checker = new TaskChecker();
  
  // 检查最近生成的几个Task ID
  const recentTaskIds = [
    '59e4efd5-5a69-4590-ac47-9dde9a6fda50', // 刚才测试生成的
    '9848bfbd-df30-4ec1-a8c8-650a6ee6d47c'  // 第二次测试生成的
  ];
  
  console.log('🔍 检查最近的Task ID状态');
  console.log('='.repeat(60));
  
  for (const taskId of recentTaskIds) {
    console.log(`\n🎯 检查任务: ${taskId}`);
    console.log('-'.repeat(40));
    
    const result = await checker.checkTaskStatus(taskId);
    
    if (result.success && result.status === 'success' && result.videoUrl) {
      console.log('\n🎬 发现已完成的视频！');
      console.log(`📹 视频URL: ${result.videoUrl}`);
      console.log(`🖼️ 缩略图: ${result.thumbnailUrl || '无'}`);
      console.log('\n💡 建议：可以用这个URL测试视频发送功能');
    }
  }
  
  // 可选：监控最新的任务
  if (recentTaskIds.length > 0) {
    const latestTaskId = recentTaskIds[recentTaskIds.length - 1];
    console.log(`\n⏰ 开始监控最新任务: ${latestTaskId}`);
    console.log('按Ctrl+C可随时停止监控');
    
    const result = await checker.waitForCompletion(latestTaskId, 180000); // 3分钟
    
    if (result.success && result.videoUrl) {
      console.log('\n🎉 监控完成！视频已生成');
      console.log(`📹 最终视频URL: ${result.videoUrl}`);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { TaskChecker }; 