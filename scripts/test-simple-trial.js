const MessageHandler = require('../services/message-handler');

// 超简单的模拟环境
const mockClient = {
  replyMessage: async (replyToken, messages) => {
    console.log('✅ 成功发送视频回复消息！');
    console.log(`回复Token: ${replyToken}`);
    
    messages.forEach((msg, index) => {
      if (msg.type === 'video') {
        console.log(`🎬 视频消息 ${index + 1}:`);
        console.log(`   视频URL: ${msg.originalContentUrl}`);
        console.log(`   预览图: ${msg.previewImageUrl}`);
      } else {
        console.log(`📝 文本消息 ${index + 1}: ${msg.text}`);
      }
    });
    
    return { success: true };
  }
};

const mockDb = {
  logInteraction: async () => ({ success: true })
};

const mockLineBot = {};

async function testSimpleTrial() {
  console.log('🧪 测试超简化免费试用流程');
  console.log('='.repeat(50));
  
  try {
    // 创建MessageHandler
    const messageHandler = new MessageHandler(mockClient, mockDb, mockLineBot);
    
    // 模拟用户和事件
    const mockUser = {
      id: 'test_user_123',
      line_id: 'test_line_user'
    };
    
    const mockEvent = {
      replyToken: 'mock_reply_token_12345'
    };
    
    const mockData = {
      photo_id: 'trial_1'
    };
    
    console.log('🎯 开始测试免费试用...');
    console.log(`选择照片: ${mockData.photo_id}`);
    
    // 测试免费试用
    const startTime = Date.now();
    
    await messageHandler.handleFreeTrialGenerate(mockEvent, mockUser, mockData);
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ 总耗时: ${duration}ms`);
    
    console.log('\n🎉 测试完成！');
    console.log('✅ 如果看到上面的视频消息，说明功能正常');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 检查配置
function checkTrialConfig() {
  console.log('\n🔧 检查试用配置...');
  
  try {
    const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');
    
    console.log(`✅ 找到 ${trialPhotos.length} 个试用照片`);
    
    trialPhotos.forEach(photo => {
      const details = trialPhotoDetails[photo.id];
      console.log(`📸 ${photo.id}: ${details.title}`);
      console.log(`   图片: ${photo.image_url.substring(0, 60)}...`);
      console.log(`   视频: ${photo.demo_video_url.substring(0, 60)}...`);
    });
    
  } catch (error) {
    console.error('❌ 配置检查失败:', error);
  }
}

async function main() {
  checkTrialConfig();
  await testSimpleTrial();
  
  console.log('\n📱 如果测试通过，请立即部署并测试LINE Bot：');
  console.log('1. 添加好友');
  console.log('2. 点击免费试用');
  console.log('3. 应该立即收到视频（不需要等待任何东西）');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testSimpleTrial }; 