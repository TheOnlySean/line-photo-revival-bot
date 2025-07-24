const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function testWelcomeFlow() {
  console.log('🧪 测试欢迎消息和免费试用流程...');
  
  // 注意：这个脚本不会真正发送消息，只是验证API连接和消息结构
  
  try {
    // 测试1: 验证LINE Bot连接
    console.log('\n📋 测试1: 验证LINE Bot API连接');
    try {
      const profile = await client.getBotInfo();
      console.log('✅ LINE Bot连接成功:');
      console.log(`   Bot名称: ${profile.displayName}`);
      console.log(`   Bot ID: ${profile.userId}`);
      console.log(`   基本ID: ${profile.basicId}`);
    } catch (error) {
      console.error('❌ LINE Bot连接失败:', error.message);
      return;
    }
    
    // 测试2: 验证免费试用消息结构
    console.log('\n📋 测试2: 验证免费试用消息结构');
    try {
      const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');
      
      // 创建简化的试用消息进行测试
      const testMessage = {
        type: 'template',
        altText: '🎁 免费试用选项',
        template: {
          type: 'buttons',
          title: '🎁 無料体験',
          text: '下記からお選びください：',
          actions: trialPhotos.slice(0, 2).map(photo => ({
            type: 'postback',
            label: trialPhotoDetails[photo.id].title,
            data: `action=free_trial&photo_id=${photo.id}&type=${photo.type}`
          }))
        }
      };
      
      console.log('✅ 简化试用消息创建成功:');
      console.log(`   消息类型: ${testMessage.type}`);
      console.log(`   模板类型: ${testMessage.template.type}`);
      console.log(`   按钮数量: ${testMessage.template.actions.length}`);
      
      testMessage.template.actions.forEach((action, index) => {
        console.log(`   按钮${index + 1}: ${action.label}`);
        console.log(`     动作数据: ${action.data}`);
      });
      
    } catch (error) {
      console.error('❌ 试用消息结构验证失败:', error.message);
    }
    
    // 测试3: 创建实际可发送的测试消息
    console.log('\n📋 测试3: 创建实际测试消息');
    
    const welcomeTest = {
      type: 'text',
      text: '🎉 写真復活へようこそ！\n\n✨ 高性価比のAI技術で写真を生き生きとした動画に変換いたします\n\n🎁 新規ユーザー様には無料体験をご用意しております'
    };
    
    const trialTest = {
      type: 'template',
      altText: '🎁 無料体験',
      template: {
        type: 'buttons',
        title: '🎁 無料体験をお試しください',
        text: 'サンプル写真を選んでAI動画生成を体験：',
        actions: [
          {
            type: 'postback',
            label: '👋 女性挥手微笑',
            data: 'action=free_trial&photo_id=trial_1&type=wave'
          },
          {
            type: 'postback',
            label: '🤵 男性友好问候', 
            data: 'action=free_trial&photo_id=trial_2&type=wave'
          },
          {
            type: 'postback',
            label: '💕 情侣温馨互动',
            data: 'action=free_trial&photo_id=trial_3&type=group'
          }
        ]
      }
    };
    
    console.log('✅ 测试消息创建完成');
    console.log('\n📱 欢迎消息预览:');
    console.log(`"${welcomeTest.text}"`);
    
    console.log('\n🎁 试用选项预览:');
    console.log(`标题: ${trialTest.template.title}`);
    console.log(`描述: ${trialTest.template.text}`);
    trialTest.template.actions.forEach((action, index) => {
      console.log(`${index + 1}. ${action.label}`);
    });
    
    console.log('\n💡 下一步测试建议:');
    console.log('1. 重新添加LINE Bot为好友');
    console.log('2. 检查是否收到欢迎消息');
    console.log('3. 检查是否立即收到免费试用选项');
    console.log('4. 如果仍未收到，检查Vercel部署日志');
    
    console.log('\n🔍 调试信息:');
    console.log('- 代码已修改为立即发送（移除setTimeout）');
    console.log('- 添加了详细的console.log调试日志');
    console.log('- 改善了错误处理和备选方案');
    console.log('- 在Vercel函数日志中应该能看到详细过程');
    
  } catch (error) {
    console.error('❌ 测试欢迎流程失败:', error);
  }
}

// 创建手动发送测试消息的功能（仅供调试）
async function sendManualTestMessage() {
  console.log('⚠️ 这是手动测试功能，需要提供真实用户ID');
  console.log('💡 请不要在生产环境中使用');
  
  // 这里不实际发送，只是展示如何手动测试
  const testUserId = 'YOUR_USER_ID_HERE'; // 需要替换为真实用户ID
  
  if (testUserId === 'YOUR_USER_ID_HERE') {
    console.log('❌ 请先设置真实的用户ID');
    return;
  }
  
  try {
    const testMessage = {
      type: 'text',
      text: '🧪 这是手动测试消息！\n\n如果您收到此消息，说明pushMessage功能正常工作。\n\n现在应该很快收到免费试用选项。'
    };
    
    console.log('📤 发送测试消息...');
    await client.pushMessage(testUserId, testMessage);
    console.log('✅ 测试消息发送成功');
    
    // 等待1秒后发送试用选项
    setTimeout(async () => {
      const trialMessage = {
        type: 'template',
        altText: '🎁 测试：免费试用',
        template: {
          type: 'buttons',
          title: '🧪 测试：免费试用',
          text: '这是测试版本的免费试用选项：',
          actions: [
            {
              type: 'postback',
              label: '👋 测试选项1',
              data: 'action=free_trial&photo_id=trial_1&type=wave'
            },
            {
              type: 'postback',
              label: '💕 测试选项2',
              data: 'action=free_trial&photo_id=trial_3&type=group'
            }
          ]
        }
      };
      
      try {
        await client.pushMessage(testUserId, trialMessage);
        console.log('✅ 试用选项测试消息发送成功');
      } catch (error) {
        console.error('❌ 试用选项测试消息发送失败:', error);
      }
    }, 1000);
    
  } catch (error) {
    console.error('❌ 手动测试消息发送失败:', error);
  }
}

// 显示当前修复状态
function showFixStatus() {
  console.log(`
🔧 免费试用功能修复状态

✅ 已完成的修复:
1. **移除setTimeout延迟**
   - 原因：Vercel serverless函数可能在延迟前结束
   - 修复：立即发送免费试用选项

2. **增强调试日志**
   - handleFollow: 添加流程开始和完成日志
   - sendWelcomeMessage: 添加发送开始和成功日志
   - sendFreeTrialOptions: 添加详细流程日志
   - 错误处理: 添加详细错误信息

3. **改善错误处理**
   - 主要Carousel失败时发送简化版本
   - 双重错误处理确保不中断流程
   - 详细记录错误代码和用户ID

🎯 当前部署状态:
- ✅ 代码已推送到GitHub
- ✅ Vercel应该已自动部署
- ✅ 新的handleFollow逻辑已生效

📱 预期用户体验:
1. 用户添加LINE Bot为好友
2. 立即收到欢迎消息
3. 同时收到免费试用选项（3张照片的选择卡片）
4. 点击选择后开始模拟生成过程
5. 1分钟后收到演示视频

🔍 如果仍未收到免费试用选项:
1. 检查Vercel函数日志中的详细输出
2. 查看是否有错误日志
3. 确认pushMessage权限设置
4. 可能需要等待Vercel部署完成（通常1-2分钟）

💡 下一步建议:
1. 重新测试添加好友流程
2. 如有问题，分享Vercel日志进行进一步诊断
3. 可以尝试发送手动测试消息验证pushMessage功能
`);
}

if (require.main === module) {
  if (process.argv.includes('--manual')) {
    sendManualTestMessage();
  } else if (process.argv.includes('--status')) {
    showFixStatus();
  } else {
    testWelcomeFlow();
  }
}

module.exports = { 
  testWelcomeFlow,
  sendManualTestMessage,
  showFixStatus
}; 