const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const LineBot = require('../services/line-bot');
const MessageHandler = require('../services/message-handler');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function testFreeTrialFlow() {
  console.log('🧪 测试免费试用完整流程...');
  
  try {
    // 创建LineBot实例
    const lineBot = new LineBot(client, null);
    
    // 测试1: 验证配置文件
    console.log('\n📋 测试1: 验证免费试用配置');
    try {
      const { trialPhotos, trialPhotoDetails, trialFlowConfig } = require('../config/demo-trial-photos');
      
      console.log(`✅ 找到 ${trialPhotos.length} 张试用照片:`);
      trialPhotos.forEach((photo, index) => {
        console.log(`   ${index + 1}. ${photo.title} (${photo.id})`);
        console.log(`      类型: ${photo.type}`);
        console.log(`      图片: ${photo.image_url}`);
        console.log(`      视频: ${photo.demo_video_url}`);
      });
      
      console.log(`✅ 试用详情配置: ${Object.keys(trialPhotoDetails).length} 项`);
      console.log(`✅ 流程配置: 欢迎延迟${trialFlowConfig.welcome_delay}ms, 生成时间${trialFlowConfig.generation_simulation_time}ms`);
      
    } catch (error) {
      console.error('❌ 配置文件验证失败:', error.message);
      return;
    }
    
    // 测试2: 测试Carousel创建
    console.log('\n📋 测试2: 测试Carousel卡片创建');
    try {
      const { trialPhotos } = require('../config/demo-trial-photos');
      const carousel = lineBot.createTrialPhotoCarousel(trialPhotos);
      
      console.log('✅ Carousel创建成功:');
      console.log(`   类型: ${carousel.type}`);
      console.log(`   模板类型: ${carousel.template.type}`);
      console.log(`   卡片数量: ${carousel.template.columns.length}`);
      
      // 验证每个卡片的结构
      carousel.template.columns.forEach((column, index) => {
        console.log(`   卡片${index + 1}:`);
        console.log(`     图片URL: ${column.hero.url}`);
        console.log(`     标题: ${column.body.contents[0].text}`);
        console.log(`     按钮动作: ${column.footer.contents[0].action.data}`);
      });
      
    } catch (error) {
      console.error('❌ Carousel创建失败:', error.message);
      return;
    }
    
    // 测试3: 模拟sendWelcomeMessage流程
    console.log('\n📋 测试3: 模拟欢迎消息流程');
    try {
      console.log('📱 模拟发送欢迎消息...');
      
      // 不实际发送，只验证方法存在
      if (typeof lineBot.sendWelcomeMessage === 'function') {
        console.log('✅ sendWelcomeMessage方法存在');
      } else {
        console.log('❌ sendWelcomeMessage方法不存在');
      }
      
      if (typeof lineBot.sendFreeTrialOptions === 'function') {
        console.log('✅ sendFreeTrialOptions方法存在');
      } else {
        console.log('❌ sendFreeTrialOptions方法不存在');
      }
      
      if (typeof lineBot.createTrialPhotoCarousel === 'function') {
        console.log('✅ createTrialPhotoCarousel方法存在');
      } else {
        console.log('❌ createTrialPhotoCarousel方法不存在');
      }
      
    } catch (error) {
      console.error('❌ 欢迎消息流程测试失败:', error.message);
    }
    
    // 测试4: 检查handleFollow实现
    console.log('\n📋 测试4: 检查handleFollow实现');
    try {
      // 读取MessageHandler源码检查
      const fs = require('fs');
      const path = require('path');
      const handlerPath = path.join(__dirname, '../services/message-handler.js');
      const handlerCode = fs.readFileSync(handlerPath, 'utf8');
      
      if (handlerCode.includes('sendWelcomeMessage(event.replyToken, userId)')) {
        console.log('✅ handleFollow正确调用sendWelcomeMessage并传递userId');
      } else if (handlerCode.includes('sendWelcomeMessage')) {
        console.log('⚠️ handleFollow调用sendWelcomeMessage但参数可能不正确');
      } else {
        console.log('❌ handleFollow没有调用sendWelcomeMessage');
      }
      
    } catch (error) {
      console.error('❌ handleFollow检查失败:', error.message);
    }
    
    // 测试5: 检查部署状态
    console.log('\n📋 测试5: 检查可能的部署问题');
    
    console.log('🔍 可能的问题原因:');
    console.log('1. 代码可能没有正确部署到Vercel');
    console.log('2. setTimeout在serverless环境中可能有问题');
    console.log('3. pushMessage权限或配置问题');
    console.log('4. 用户添加好友的时机问题');
    console.log('5. Rich Menu初始化可能中断了流程');
    
    console.log('\n💡 建议的调试步骤:');
    console.log('1. 检查Vercel部署日志');
    console.log('2. 测试立即发送（不用setTimeout）');
    console.log('3. 简化消息内容进行测试');
    console.log('4. 检查LINE Bot权限设置');
    
    console.log('\n🎉 免费试用流程代码结构测试完成！');
    
  } catch (error) {
    console.error('❌ 测试免费试用流程失败:', error);
  }
}

// 创建简化版本进行测试
async function createSimplifiedTrialTest() {
  console.log('\n🔧 生成简化版免费试用测试...');
  
  const testUserId = 'test_user_12345'; // 模拟用户ID
  
  try {
    const lineBot = new LineBot(client, null);
    
    // 创建简化的测试消息
    const testMessage = {
      type: 'text',
      text: '🎁 这是免费试用测试消息！\n\n如果您看到这条消息，说明免费试用功能正在工作。\n\n请点击下方Rich Menu进行体验。'
    };
    
    console.log('📨 测试消息创建成功:');
    console.log(JSON.stringify(testMessage, null, 2));
    
    // 创建简化的试用选项
    const simpleTrialMessage = {
      type: 'template',
      altText: '免费试用选项',
      template: {
        type: 'buttons',
        title: '🎁 免费试用',
        text: '请选择一个选项开始试用:',
        actions: [
          {
            type: 'postback',
            label: '👋 手挥试用',
            data: 'action=free_trial&photo_id=trial_1&type=wave'
          },
          {
            type: 'postback', 
            label: '🤝 寄り添い试用',
            data: 'action=free_trial&photo_id=trial_3&type=group'
          }
        ]
      }
    };
    
    console.log('\n📱 简化试用选项创建成功:');
    console.log(JSON.stringify(simpleTrialMessage, null, 2));
    
    console.log('\n💡 建议修改方案:');
    console.log('1. 暂时移除setTimeout，立即发送试用选项');
    console.log('2. 使用简化的buttons模板替代复杂的carousel');
    console.log('3. 添加更多调试日志');
    console.log('4. 在handleFollow中添加console.log确认执行');
    
  } catch (error) {
    console.error('❌ 创建简化测试失败:', error);
  }
}

// 检查现有Rich Menu状态
async function checkRichMenuStatus() {
  console.log('\n📋 检查Rich Menu状态...');
  
  try {
    const richMenus = await client.getRichMenuList();
    console.log(`✅ 找到 ${richMenus.length} 个Rich Menu`);
    
    for (const menu of richMenus) {
      console.log(`📋 Rich Menu: ${menu.name}`);
      console.log(`   ID: ${menu.richMenuId}`);
      console.log(`   是否选中: ${menu.selected}`);
      console.log(`   聊天栏文字: ${menu.chatBarText}`);
      console.log(`   区域数量: ${menu.areas.length}`);
    }
    
  } catch (error) {
    console.error('❌ 检查Rich Menu状态失败:', error);
  }
}

if (require.main === module) {
  if (process.argv.includes('--simple')) {
    createSimplifiedTrialTest();
  } else if (process.argv.includes('--richmenu')) {
    checkRichMenuStatus();
  } else {
    testFreeTrialFlow();
  }
}

module.exports = { 
  testFreeTrialFlow, 
  createSimplifiedTrialTest,
  checkRichMenuStatus 
}; 