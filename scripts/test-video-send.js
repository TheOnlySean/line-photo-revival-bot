const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function testVideoSend() {
  console.log('📤 测试视频发送功能');
  console.log('='.repeat(60));
  
  // 使用之前测试发现的已完成视频
  const testVideos = [
    {
      videoUrl: 'https://tempfile.aiquickdraw.com/p/71309459-54cd-4d22-b036-cabcdb943c43.mp4',
      thumbnailUrl: 'https://tempfile.aiquickdraw.com/p/5d59b814-12b0-4bd8-aa37-dccd04396ddf.jpg',
      taskId: '59e4efd5-5a69-4590-ac47-9dde9a6fda50'
    },
    {
      videoUrl: 'https://tempfile.aiquickdraw.com/p/5e7827be-282e-49e0-8e0c-5f9f1d410abe.mp4',
      thumbnailUrl: 'https://tempfile.aiquickdraw.com/p/5249c5ce-6ca3-409e-9824-27ab812d470a.jpg',
      taskId: '9848bfbd-df30-4ec1-a8c8-650a6ee6d47c'
    }
  ];
  
  const testUserId = 'U23ea34c52091796e999d10f150460c78'; // 您的LINE用户ID
  
  for (const [index, video] of testVideos.entries()) {
    try {
      console.log(`\n🎬 测试发送视频 ${index + 1}:`);
      console.log(`   Task ID: ${video.taskId}`);
      console.log(`   视频URL: ${video.videoUrl}`);
      console.log(`   缩略图: ${video.thumbnailUrl}`);
      
      // 测试发送视频消息
      const messages = [
        {
          type: 'text',
          text: `🎉 测试视频 ${index + 1} - 来自Task ID: ${video.taskId.substring(0, 8)}...\n\n✨ 这是KIE.AI生成的视频！`
        },
        {
          type: 'video',
          originalContentUrl: video.videoUrl,
          previewImageUrl: video.thumbnailUrl
        }
      ];
      
      console.log('📤 正在发送视频消息...');
      await client.pushMessage(testUserId, messages);
      console.log('✅ 视频发送成功！');
      
      // 等待2秒再发送下一个
      if (index < testVideos.length - 1) {
        console.log('⏳ 等待2秒...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error('❌ 视频发送失败:', error.message);
      if (error.response) {
        console.error('❌ 错误详情:', error.response.status, error.response.data);
      }
      
      // 如果是URL问题，尝试不使用缩略图
      if (error.message.includes('400') || error.message.includes('Invalid')) {
        try {
          console.log('🔄 尝试不使用缩略图重新发送...');
          await client.pushMessage(testUserId, [
            {
              type: 'text',
              text: `🎬 视频 ${index + 1} (无缩略图版本)`
            },
            {
              type: 'video',
              originalContentUrl: video.videoUrl,
              previewImageUrl: video.videoUrl // 使用视频URL作为预览
            }
          ]);
          console.log('✅ 无缩略图版本发送成功！');
        } catch (retryError) {
          console.error('❌ 重试也失败:', retryError.message);
        }
      }
    }
  }
  
  console.log('\n📊 测试总结:');
  console.log('如果您收到了视频消息，说明发送逻辑没问题');
  console.log('如果没收到，可能是URL访问限制或LINE API限制');
  console.log('\n💡 请检查LINE客户端是否收到了测试视频');
}

// 测试URL可访问性
async function testUrlAccessibility() {
  const axios = require('axios');
  
  console.log('🌐 测试视频URL可访问性');
  console.log('-'.repeat(40));
  
  const testUrls = [
    'https://tempfile.aiquickdraw.com/p/71309459-54cd-4d22-b036-cabcdb943c43.mp4',
    'https://tempfile.aiquickdraw.com/p/5e7827be-282e-49e0-8e0c-5f9f1d410abe.mp4'
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`🔍 检查: ${url.substring(0, 60)}...`);
      const response = await axios.head(url, { timeout: 10000 });
      console.log(`✅ 可访问 - 状态: ${response.status}, 大小: ${response.headers['content-length']} bytes`);
    } catch (error) {
      console.error(`❌ 无法访问 - ${error.message}`);
    }
  }
}

async function main() {
  console.log('🧪 KIE.AI视频发送完整测试');
  console.log('='.repeat(60));
  
  // 1. 测试URL可访问性
  await testUrlAccessibility();
  
  console.log('\n');
  
  // 2. 测试视频发送
  await testVideoSend();
  
  console.log('\n✅ 所有测试完成！');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testVideoSend }; 