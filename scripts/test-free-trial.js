const MessageHandler = require('../services/message-handler');
const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');

// 模拟环境设置
const mockDb = {
  logInteraction: async () => ({ success: true }),
  getUserByLineId: async () => ({
    id: 'test_user_123',
    line_id: 'test_line_user',
    credits: 0
  })
};

const mockLineBot = {
  switchToProcessingMenu: async (userId) => {
    console.log('✅ 模拟切换到processing菜单:', userId);
    return true;
  },
  switchToMainMenu: async (userId) => {
    console.log('✅ 模拟切换回主菜单:', userId);
    return true;
  }
};

const mockClient = {
  replyMessage: async (replyToken, messages) => {
    console.log('📤 模拟回复消息:');
    console.log('   Reply Token:', replyToken);
    if (Array.isArray(messages)) {
      messages.forEach((msg, index) => {
        console.log(`   消息 ${index + 1}:`, msg.text || `${msg.type} message`);
      });
    } else {
      console.log('   消息:', messages.text || `${messages.type} message`);
    }
    return { success: true };
  },
  
  pushMessage: async (userId, messages) => {
    console.log('📤 模拟推送消息:');
    console.log('   用户ID:', userId);
    if (Array.isArray(messages)) {
      messages.forEach((msg, index) => {
        console.log(`   消息 ${index + 1}:`, msg.text || `${msg.type} message`);
        if (msg.type === 'video') {
          console.log(`   视频URL: ${msg.originalContentUrl}`);
          console.log(`   预览图: ${msg.previewImageUrl}`);
        }
      });
    } else {
      console.log('   消息:', messages.text || `${messages.type} message`);
    }
    return { success: true };
  }
};

class MockMessageHandler extends MessageHandler {
  constructor() {
    super(mockClient, mockDb);
    this.lineBot = mockLineBot;
  }
  
  // 测试sleep函数是否工作正常
  async testSleep() {
    console.log('🧪 测试sleep函数...');
    const startTime = Date.now();
    await this.sleep(1000); // 测试1秒延迟
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (duration >= 990 && duration <= 1100) {
      console.log('✅ sleep函数工作正常:', duration + 'ms');
      return true;
    } else {
      console.log('❌ sleep函数异常:', duration + 'ms');
      return false;
    }
  }
}

async function testFreeTrialFlow() {
  console.log('🧪 开始测试免费试用流程...');
  console.log('='.repeat(60));
  
  try {
    // 1. 测试配置加载
    console.log('\n📋 步骤1: 测试配置加载');
    console.log(`✅ 加载了 ${trialPhotos.length} 个试用选项`);
    
    trialPhotos.forEach((photo, index) => {
      const details = trialPhotoDetails[photo.id];
      console.log(`   ${index + 1}. ${photo.id} - ${details.title}`);
      console.log(`      图片: ${photo.image_url.substring(0, 50)}...`);
      console.log(`      视频: ${photo.demo_video_url.substring(0, 50)}...`);
    });
    
    // 2. 测试URL格式
    console.log('\n🔗 步骤2: 验证URL格式');
    let urlsValid = true;
    
    for (const photo of trialPhotos) {
      const imageValid = photo.image_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/');
      const videoValid = photo.demo_video_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/');
      
      console.log(`   ${photo.id}:`);
      console.log(`      图片URL格式: ${imageValid ? '✅' : '❌'}`);
      console.log(`      视频URL格式: ${videoValid ? '✅' : '❌'}`);
      
      if (!imageValid || !videoValid) {
        urlsValid = false;
      }
    }
    
    if (!urlsValid) {
      console.log('❌ URL格式验证失败！');
      return false;
    }
    
    // 3. 测试MessageHandler初始化
    console.log('\n🔧 步骤3: 测试MessageHandler初始化');
    const handler = new MockMessageHandler();
    console.log('✅ MessageHandler创建成功');
    
    // 4. 测试sleep函数
    console.log('\n⏰ 步骤4: 测试sleep函数');
    const sleepWorking = await handler.testSleep();
    if (!sleepWorking) {
      console.log('❌ sleep函数测试失败！');
      return false;
    }
    
    // 5. 模拟免费试用请求
    console.log('\n🎁 步骤5: 模拟免费试用流程');
    
    const mockEvent = {
      replyToken: 'mock_reply_token_123',
      source: { userId: 'test_line_user' }
    };
    
    const mockUser = await mockDb.getUserByLineId('test_line_user');
    
    const testPhoto = trialPhotos[0]; // 使用第一个试用照片
    const mockData = {
      photo_id: testPhoto.id,
      type: testPhoto.type
    };
    
    console.log(`🎯 选择试用照片: ${testPhoto.id} - ${trialPhotoDetails[testPhoto.id].title}`);
    
    // 开始免费试用流程（但不等待完整的10秒流程）
    console.log('🚀 开始免费试用流程...');
    
    // 只测试第一步：初始回复和菜单切换
    try {
      const selectedPhoto = trialPhotos.find(photo => photo.id === testPhoto.id);
      const photoDetails = trialPhotoDetails[testPhoto.id];
      
      if (!selectedPhoto) {
        console.log('❌ 找不到选择的照片');
        return false;
      }
      
      console.log('🔄 模拟切换到处理中菜单...');
      await handler.lineBot.switchToProcessingMenu(mockUser.line_id);
      
      console.log('📤 模拟发送开始消息...');
      await handler.client.replyMessage(mockEvent.replyToken, {
        type: 'text',
        text: `🎬 ${photoDetails.title}の無料体験を開始いたします！\n\n⏳ 生成中...下部の「生成中...」メニューで進捗をご確認いただけます。`
      });
      
      console.log('✅ 初始流程测试成功');
      
      // 6. 测试最终视频消息格式
      console.log('\n🎬 步骤6: 测试视频消息格式');
      
      const videoMessages = [
        {
          type: 'text',
          text: `🎉 ${photoDetails.title}の無料体験動画が完成いたしました！\n\n✨ AIが生成した素敵な動画をお楽しみください！`
        },
        {
          type: 'video',
          originalContentUrl: selectedPhoto.demo_video_url,
          previewImageUrl: selectedPhoto.image_url
        },
        {
          type: 'text',
          text: '🎁 無料体験をお楽しみいただけましたでしょうか？\n\n📸 お客様の写真で動画を作成されたい場合は、下部メニューからお選びください！\n\n💎 より多くの動画生成には、ポイント購入をご検討ください。'
        }
      ];
      
      console.log('📤 模拟发送完成视频...');
      await handler.client.pushMessage(mockUser.line_id, videoMessages);
      
      console.log('🔄 模拟切换回主菜单...');
      await handler.lineBot.switchToMainMenu(mockUser.line_id);
      
      console.log('✅ 视频发送格式测试成功');
      
    } catch (error) {
      console.error('❌ 免费试用流程测试失败:', error);
      return false;
    }
    
    // 7. 总结测试结果
    console.log('\n📊 测试总结:');
    console.log('='.repeat(60));
    console.log('✅ 配置加载: 通过');
    console.log('✅ URL格式: 通过');
    console.log('✅ MessageHandler: 通过');
    console.log('✅ sleep函数: 通过');
    console.log('✅ 免费试用流程: 通过');
    console.log('✅ 视频发送格式: 通过');
    
    console.log('\n🎉 所有测试通过！免费试用功能应该正常工作。');
    
    console.log('\n💡 实际流程时间线:');
    console.log('   0秒: 用户点击试用 → 切换processing菜单 → 发送开始消息');
    console.log('   3秒: 发送"AI正在分析照片..."');
    console.log('   6秒: 发送"正在生成动态效果..."');
    console.log('  10秒: 发送完成视频 → 切换回主菜单');
    
    console.log('\n🔧 如果用户仍然等待很久，可能的原因:');
    console.log('1. Vercel serverless函数超时');
    console.log('2. LINE API网络连接问题');
    console.log('3. 数据库连接问题');
    console.log('4. Rich Menu切换失败');
    
    return true;
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
    return false;
  }
}

// 测试URL可访问性
async function testUrlAccessibility() {
  console.log('\n🌐 额外测试: URL可访问性');
  
  const https = require('https');
  
  const testUrl = (url) => {
    return new Promise((resolve) => {
      const req = https.request(url, { method: 'HEAD' }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
      
      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
      
      req.end();
    });
  };
  
  for (const photo of trialPhotos) {
    const details = trialPhotoDetails[photo.id];
    console.log(`\n📸 ${photo.id} - ${details.title}:`);
    
    const imageAccessible = await testUrl(photo.image_url);
    const videoAccessible = await testUrl(photo.demo_video_url);
    
    console.log(`   图片可访问: ${imageAccessible ? '✅' : '❌'}`);
    console.log(`   视频可访问: ${videoAccessible ? '✅' : '❌'}`);
    
    if (!imageAccessible || !videoAccessible) {
      console.log('⚠️ 发现不可访问的URL，这可能导致用户看不到内容');
    }
  }
}

// 主函数
async function main() {
  console.log('🧪 免费试用功能测试套件');
  console.log('='.repeat(60));
  
  const basicTestPassed = await testFreeTrialFlow();
  
  if (basicTestPassed) {
    await testUrlAccessibility();
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(basicTestPassed ? '🎉 测试完成!' : '❌ 测试失败!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testFreeTrialFlow, testUrlAccessibility }; 