const axios = require('axios');
const lineConfig = require('../config/line-config');

class KieApiTester {
  constructor() {
    this.kieAiConfig = lineConfig.kieAi;
    console.log('🔧 KIE.AI配置:', {
      baseUrl: this.kieAiConfig.baseUrl,
      hasApiKey: !!this.kieAiConfig.apiKey,
      apiKeyLength: this.kieAiConfig.apiKey?.length || 0
    });
  }

  // 测试API连接
  async testApiConnection() {
    try {
      console.log('🌐 测试KIE.AI API连接...');
      console.log('🔧 使用生成端点进行连接测试');
      
      // 使用一个简单的请求测试连接（不实际生成）
      const testUrl = `${this.kieAiConfig.baseUrl}${this.kieAiConfig.generateEndpoint}`;
      console.log('📡 测试URL:', testUrl);
      
      // 先测试是否能访问基础URL
      const baseResponse = await axios.get(this.kieAiConfig.baseUrl, {
        timeout: 10000
      }).catch(err => {
        console.log('⚠️ 基础URL访问:', err.response?.status || err.message);
        return { status: 'reachable' }; // 即使404也说明服务器可达
      });
      
      console.log('✅ 基础服务器可达');
      
      // 测试API Key认证 - 发送一个故意错误的请求来验证认证
      try {
        await axios.post(testUrl, {}, {
          headers: {
            'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
      } catch (authError) {
        if (authError.response?.status === 400) {
          console.log('✅ API Key认证成功（返回400说明认证通过但参数错误）');
          return { success: true, message: 'API连接和认证正常' };
        } else if (authError.response?.status === 401) {
          console.error('❌ API Key认证失败');
          return { success: false, error: 'API Key认证失败' };
        } else {
          console.log('✅ API连接正常，状态码:', authError.response?.status);
          return { success: true, message: 'API连接正常' };
        }
      }

      return { success: true, message: 'API连接测试完成' };

    } catch (error) {
      console.error('❌ API连接测试失败:', error.message);
      if (error.response) {
        console.error('❌ 错误详情:', error.response.status, error.response.data);
      }
      return { success: false, error: error.message };
    }
  }

  // 测试提交视频生成任务
  async testVideoGeneration(testImageUrl) {
    try {
      console.log('🎬 测试视频生成任务提交...');
      
      const requestData = {
        prompt: "Transform this photo into a dynamic video with natural movements and expressions, bringing the person to life with subtle animations and realistic motion",
        imageUrl: testImageUrl,
        aspectRatio: this.kieAiConfig.defaultParams.aspectRatio,
        duration: this.kieAiConfig.defaultParams.duration,
        quality: this.kieAiConfig.defaultParams.quality,
        waterMark: this.kieAiConfig.defaultParams.waterMark
      };

      console.log('📤 请求数据:', requestData);

      const response = await axios.post(
        `${this.kieAiConfig.baseUrl}${this.kieAiConfig.generateEndpoint}`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      console.log('📡 生成任务响应:', response.status, response.data);

      if (response.data && response.data.code === 200) {
        const taskId = response.data.data.taskId;
        console.log('✅ 任务提交成功，Task ID:', taskId);
        return { success: true, taskId, response: response.data };
      } else {
        console.error('❌ 任务提交失败:', response.data);
        return { success: false, error: response.data?.message || '任务提交失败' };
      }

    } catch (error) {
      console.error('❌ 提交任务失败:', error.message);
      if (error.response) {
        console.error('❌ 错误详情:', error.response.status, error.response.data);
      }
      return { success: false, error: error.message };
    }
  }

  // 查询Task ID状态
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

      console.log('📡 状态查询响应:', response.status, response.data);

      if (response.data && response.data.code === 200) {
        const data = response.data.data;
        const status = data.state;
        const videoInfo = data.videoInfo;
        
        console.log('📊 任务状态分析:');
        console.log('  - 状态:', status);
        console.log('  - 视频信息:', videoInfo);
        console.log('  - 视频URL:', videoInfo?.videoUrl || videoInfo?.url);
        console.log('  - 缩略图:', videoInfo?.thumbnailUrl || videoInfo?.thumbnail);
        console.log('  - 错误信息:', data.failMsg || data.error);

        return {
          success: true,
          status: status,
          videoUrl: videoInfo?.videoUrl || videoInfo?.url,
          thumbnailUrl: videoInfo?.thumbnailUrl || videoInfo?.thumbnail,
          data: data
        };
      } else {
        console.error('❌ 状态查询失败:', response.data);
        return { success: false, error: response.data?.message || '状态查询失败' };
      }

    } catch (error) {
      console.error('❌ 查询状态失败:', error.message);
      if (error.response) {
        console.error('❌ 错误详情:', error.response.status, error.response.data);
      }
      return { success: false, error: error.message };
    }
  }

  // 从数据库查询最近的视频记录和Task ID
  async checkRecentTasks() {
    try {
      console.log('🔍 检查数据库中最近的任务...');
      
      const { Pool } = require('pg');
      
      // 创建数据库连接
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      const result = await pool.query(`
        SELECT id, user_id, task_id, status, video_url, created_at, error_message
        FROM videos 
        WHERE task_id IS NOT NULL 
        ORDER BY created_at DESC 
        LIMIT 10
      `);

      console.log(`📊 找到 ${result.rows.length} 个最近的任务:`);
      
      for (const task of result.rows) {
        console.log(`\n📋 任务 ${task.id}:`);
        console.log(`   Task ID: ${task.task_id}`);
        console.log(`   状态: ${task.status}`);
        console.log(`   视频URL: ${task.video_url || '无'}`);
        console.log(`   创建时间: ${task.created_at}`);
        console.log(`   错误信息: ${task.error_message || '无'}`);
        
        // 如果有Task ID且状态不是completed，检查API状态
        if (task.task_id && task.status !== 'completed') {
          console.log(`\n🔍 检查Task ID ${task.task_id} 的API状态...`);
          const apiStatus = await this.checkTaskStatus(task.task_id);
          
          if (apiStatus.success) {
            console.log(`✅ API状态: ${apiStatus.status}`);
            if (apiStatus.videoUrl) {
              console.log(`🎬 发现视频URL: ${apiStatus.videoUrl}`);
              console.log(`❗ 数据库状态 (${task.status}) vs API状态 (${apiStatus.status}) 不匹配！`);
              
              // 如果API已完成但数据库未更新，这就是问题所在
              if (apiStatus.status === 'success' && task.status !== 'completed') {
                console.log(`🚨 发现问题：API已生成完成但数据库未更新！`);
                console.log(`🎬 视频已经生成: ${apiStatus.videoUrl}`);
                console.log(`📸 缩略图: ${apiStatus.thumbnailUrl || '无'}`);
              }
            }
          }
        }
      }
      
      await pool.end();
      return result.rows;

    } catch (error) {
      console.error('❌ 检查数据库任务失败:', error.message);
      return [];
    }
  }
}

async function main() {
  console.log('🧪 KIE.AI API连接和状态测试');
  console.log('='.repeat(60));
  
  const tester = new KieApiTester();
  
  // 1. 测试API连接
  console.log('\n📡 第1步: 测试API连接');
  const connection = await tester.testApiConnection();
  
  if (!connection.success) {
    console.log('❌ API连接失败，无法继续测试');
    return;
  }
  
  // 2. 检查数据库中的最近任务
  console.log('\n📊 第2步: 检查数据库中的最近任务');
  await tester.checkRecentTasks();
  
  // 3. 可选：测试新的视频生成任务
  console.log('\n🎬 第3步: 测试新的视频生成（可选）');
  console.log('使用测试图片URL进行测试...');
  
  const testImageUrl = 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/1-avVzCLIlMDcxjLFpS5NLqwyUlt3sBm.png';
  const generation = await tester.testVideoGeneration(testImageUrl);
  
  if (generation.success) {
    console.log(`✅ 新任务已提交，Task ID: ${generation.taskId}`);
    console.log('⏰ 等待10秒后查询状态...');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const status = await tester.checkTaskStatus(generation.taskId);
    console.log('📊 新任务状态:', status);
  }
  
  console.log('\n✅ 测试完成！');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { KieApiTester }; 