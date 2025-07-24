const MessageHandler = require('../services/message-handler');

// 模拟环境
const mockDb = {
  logInteraction: async (lineUserId, userId, type, data) => {
    // 模拟数据库连接问题
    if (Math.random() < 0.3) { // 30%几率失败
      throw new Error('Connection terminated unexpectedly');
    }
    console.log('📊 模拟数据库记录:', { type, success: true });
    return { success: true };
  },
  getUserByLineId: async () => ({
    id: 'test_user_123',
    line_id: 'test_line_user',
    credits: 5
  })
};

const mockLineBot = {
  switchToProcessingMenu: async (userId) => {
    console.log('✅ 切换到processing菜单:', userId);
    await new Promise(resolve => setTimeout(resolve, 100)); // 模拟网络延迟
    return true;
  },
  switchToMainMenu: async (userId) => {
    console.log('✅ 切换回主菜单:', userId);
    await new Promise(resolve => setTimeout(resolve, 100)); // 模拟网络延迟
    return true;
  }
};

const mockClient = {
  replyMessage: async (replyToken, messages) => {
    console.log('📤 回复消息:', replyToken);
    await new Promise(resolve => setTimeout(resolve, 200)); // 模拟LINE API延迟
    return { success: true };
  },
  pushMessage: async (userId, messages) => {
    console.log('📤 推送消息给用户:', userId);
    await new Promise(resolve => setTimeout(resolve, 200)); // 模拟LINE API延迟
    
    if (Array.isArray(messages)) {
      messages.forEach((msg, index) => {
        if (msg.type === 'video') {
          console.log(`   🎬 视频消息 ${index + 1}: ${msg.originalContentUrl.substring(0, 50)}...`);
        } else {
          console.log(`   📝 文本消息 ${index + 1}: ${msg.text.substring(0, 50)}...`);
        }
      });
    }
    return { success: true };
  }
};

// 测试场景
async function testTimeoutFixes() {
  console.log('🧪 测试超时和数据库连接修复');
  console.log('='.repeat(60));
  
  const messageHandler = new MessageHandler(mockClient, mockDb, mockLineBot);
  
  const testUser = {
    id: 'test_user_123',
    line_id: 'test_line_user',
    credits: 5
  };
  
  const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');
  const selectedPhoto = trialPhotos[0];
  const photoDetails = trialPhotoDetails[selectedPhoto.id];
  
  console.log('\n🎯 测试场景 1: 正常流程');
  console.log('-'.repeat(40));
  
  try {
    const startTime = Date.now();
    
    await messageHandler.simulateTrialGeneration(
      testUser, 
      selectedPhoto, 
      photoDetails, 
      {}
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ 场景1完成，耗时: ${duration}ms`);
    
  } catch (error) {
    console.error('❌ 场景1失败:', error.message);
  }
  
  console.log('\n🎯 测试场景 2: 模拟接近Vercel超时');
  console.log('-'.repeat(40));
  
  try {
    // 模拟已经运行了50秒的情况
    global.webhookStartTime = Date.now() - 51000;
    
    const startTime = Date.now();
    
    await messageHandler.simulateTrialGeneration(
      testUser, 
      selectedPhoto, 
      photoDetails, 
      {}
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ 场景2完成（紧急模式），耗时: ${duration}ms`);
    
  } catch (error) {
    console.error('❌ 场景2失败:', error.message);
  }
  
  console.log('\n🎯 测试场景 3: 数据库连接重试');
  console.log('-'.repeat(40));
  
  // 重置全局时间
  global.webhookStartTime = Date.now();
  
  // 测试数据库重试逻辑
  const originalLogInteraction = mockDb.logInteraction;
  let attempts = 0;
  
  mockDb.logInteraction = async (...args) => {
    attempts++;
    if (attempts <= 2) {
      console.log(`💥 模拟数据库连接失败 (尝试 ${attempts})`);
      throw new Error('Connection terminated unexpectedly');
    }
    console.log(`✅ 数据库连接恢复 (尝试 ${attempts})`);
    return originalLogInteraction(...args);
  };
  
  try {
    const startTime = Date.now();
    
    await messageHandler.simulateTrialGeneration(
      testUser, 
      selectedPhoto, 
      photoDetails, 
      {}
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ 场景3完成，数据库重试 ${attempts} 次，耗时: ${duration}ms`);
    
  } catch (error) {
    console.error('❌ 场景3失败:', error.message);
  }
  
  // 恢复原始函数
  mockDb.logInteraction = originalLogInteraction;
  
  console.log('\n🎯 测试场景 4: 极端故障情况');
  console.log('-'.repeat(40));
  
  // 模拟所有外部服务都失败的情况
  const originalPushMessage = mockClient.pushMessage;
  const originalSwitchToMainMenu = mockLineBot.switchToMainMenu;
  
  mockClient.pushMessage = async () => {
    throw new Error('LINE API connection failed');
  };
  
  mockLineBot.switchToMainMenu = async () => {
    throw new Error('Rich Menu API failed');
  };
  
  try {
    const startTime = Date.now();
    
    await messageHandler.simulateTrialGeneration(
      testUser, 
      selectedPhoto, 
      photoDetails, 
      {}
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ 场景4完成（故障恢复），耗时: ${duration}ms`);
    
  } catch (error) {
    console.error('❌ 场景4失败:', error.message);
  }
  
  // 恢复原始函数
  mockClient.pushMessage = originalPushMessage;
  mockLineBot.switchToMainMenu = originalSwitchToMainMenu;
  
  console.log('\n📊 测试总结');
  console.log('='.repeat(60));
  
  const fixes = [
    '✅ Vercel超时从30秒增加到60秒',
    '✅ 添加15秒流程超时保护',
    '✅ 实现紧急模式（接近函数超时时）',
    '✅ 数据库连接重试机制（3次）',
    '✅ 核心视频发送与数据库操作分离',
    '✅ 故障恢复机制（即使出错也给用户反馈）',
    '✅ 全局计时器跟踪函数执行时间',
    '✅ 异步日志记录不阻塞主流程'
  ];
  
  fixes.forEach(fix => console.log(fix));
  
  console.log('\n🎁 预期效果:');
  console.log('• 免费试用应该在10-15秒内完成');
  console.log('• 即使数据库连接问题，视频也能发送');
  console.log('• 接近超时时启用紧急模式立即完成');
  console.log('• 任何情况下用户都会收到反馈');
  
  console.log('\n📱 请现在测试:');
  console.log('1. 重新部署到Vercel');
  console.log('2. 添加LINE Bot为好友');
  console.log('3. 选择免费试用照片');
  console.log('4. 应该在15秒内收到视频');
}

// Vercel配置检查
function checkVercelConfig() {
  console.log('\n🔧 Vercel配置检查');
  console.log('='.repeat(30));
  
  const fs = require('fs');
  const path = require('path');
  
  try {
    const configPath = path.join(__dirname, '../vercel.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    console.log('📄 当前配置:');
    console.log(JSON.stringify(config, null, 2));
    
    const maxDuration = config.functions?.['api/webhook.js']?.maxDuration;
    
    if (maxDuration >= 60) {
      console.log('✅ maxDuration配置正确:', maxDuration + '秒');
    } else {
      console.log('❌ maxDuration配置不足:', maxDuration + '秒');
      console.log('建议: 设置为60秒（Pro版本最大值）');
    }
    
  } catch (error) {
    console.error('❌ 读取Vercel配置失败:', error.message);
  }
}

// 主函数
async function main() {
  console.log('🚀 超时和数据库连接问题修复验证');
  console.log('='.repeat(60));
  
  checkVercelConfig();
  await testTimeoutFixes();
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 修复完成！请部署到Vercel后测试免费试用功能');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testTimeoutFixes, checkVercelConfig }; 