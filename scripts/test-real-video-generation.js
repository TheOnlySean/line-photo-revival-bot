const axios = require('axios');
const lineConfig = require('../config/line-config');
const VideoGenerator = require('../services/video-generator');
const Database = require('../config/database');

async function testRealVideoGeneration() {
  console.log('🧪 开始测试真实视频生成流程...');
  console.log('🔑 API Key:', lineConfig.kieAi.apiKey.substring(0, 8) + '...');
  
  try {
    // 使用一个真实存在的图片URL (头像或示例图片)
    const testImageUrls = [
      'https://avatars.githubusercontent.com/u/1?v=4', // GitHub默认头像
      'https://picsum.photos/800/600', // Lorem Picsum随机图片
      'https://via.placeholder.com/800x600.jpg', // 占位图片
      'https://images.unsplash.com/photo-1575936123452-b67c3203c357?w=800&h=600&fit=crop' // Unsplash示例
    ];

    for (const imageUrl of testImageUrls) {
      console.log(`\n🖼️ 测试图片URL: ${imageUrl}`);
      
      try {
        // 先检查图片URL是否可访问
        const imageResponse = await axios.head(imageUrl, { timeout: 10000 });
        console.log('✅ 图片URL可访问:', imageResponse.status);
        
        // 提交视频生成任务
        const generateData = {
          prompt: "A person naturally waving hand with a warm smile, subtle head movement, friendly gesture, high quality portrait video",
          imageUrl: imageUrl,
          aspectRatio: '1:1',
          duration: 5,
          quality: '720p',
          waterMark: ''
        };

        console.log('📤 提交视频生成任务...');
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
          
          // 开始轮询测试 (最多15次，约4分钟)
          console.log('\n🔄 开始轮询视频生成状态...');
          const result = await pollVideoGeneration(taskId, 15);
          
          if (result.success) {
            console.log('🎉 视频生成成功！');
            console.log('🎬 视频URL:', result.videoUrl);
            console.log('🖼️ 缩略图URL:', result.thumbnailUrl);
            
            // 测试发送视频功能
            await testSendVideo(result);
            
            break; // 成功后退出循环
          } else {
            console.log('❌ 视频生成失败:', result.error);
            console.log('继续尝试下一个图片...\n');
          }
          
        } else {
          console.error('❌ 任务提交失败:', generateResponse.data);
        }
        
      } catch (imageError) {
        console.log('❌ 图片URL不可访问:', imageError.message);
        console.log('继续尝试下一个图片...\n');
        continue;
      }
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

async function pollVideoGeneration(taskId, maxAttempts = 15) {
  console.log(`🔄 开始轮询 Task ID: ${taskId} (最多${maxAttempts}次)`);
  
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`\n🔍 ===== 轮询第 ${i}/${maxAttempts} 次 =====`);
    
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
          console.log('🎬 视频信息详情:', JSON.stringify(videoInfo, null, 2));
        }
        
        // 判断最终状态
        switch (status) {
          case 'success':
            console.log('🎉 视频生成成功！');
            if (videoInfo && (videoInfo.videoUrl || videoInfo.url)) {
              return {
                success: true,
                videoUrl: videoInfo.videoUrl || videoInfo.url,
                thumbnailUrl: videoInfo.thumbnailUrl || videoInfo.thumbnail
              };
            } else {
              console.log('⚠️ 生成成功但无视频URL');
              return { success: false, error: '生成成功但无视频URL' };
            }
            
          case 'fail':
            console.log('❌ 视频生成失败');
            return { 
              success: false, 
              error: data.failMsg || '视频生成失败',
              failCode: data.failCode 
            };
            
          case 'wait':
          case 'queueing':
          case 'generating':
            console.log(`⏳ 仍在处理中 (${status})，15秒后继续轮询...`);
            if (i < maxAttempts) {
              await sleep(15000); // 等待15秒
            }
            break;
            
          default:
            console.log(`⚠️ 未知状态: ${status}`);
            if (i < maxAttempts) {
              await sleep(15000);
            }
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
  }
  
  return { success: false, error: '轮询超时' };
}

async function testSendVideo(result) {
  console.log('\n📤 测试视频发送功能...');
  
  // 这里可以测试视频文件是否可以访问
  try {
    const videoResponse = await axios.head(result.videoUrl, { timeout: 10000 });
    console.log('✅ 视频URL可访问:', videoResponse.status);
    console.log('🎬 视频内容类型:', videoResponse.headers['content-type']);
    console.log('📊 视频大小:', videoResponse.headers['content-length'], 'bytes');
  } catch (error) {
    console.error('❌ 视频URL不可访问:', error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  testRealVideoGeneration();
}

module.exports = testRealVideoGeneration; 