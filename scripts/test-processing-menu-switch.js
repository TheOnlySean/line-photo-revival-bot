const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function testProcessingMenuSwitch() {
  console.log('🧪 测试Processing Rich Menu切换功能...');
  
  try {
    // 测试用户ID - 请替换为您的LINE用户ID
    const testUserId = 'U23ea34c52091796e999d10f150460c78'; // 替换为实际用户ID
    
    console.log('🔍 步骤1: 获取所有Rich Menu');
    
    // 获取所有Rich Menu列表
    const richMenuList = await client.getRichMenuList();
    console.log('📝 可用的Rich Menu:');
    richMenuList.forEach((menu, index) => {
      console.log(`  ${index + 1}. ID: ${menu.richMenuId}`);
      console.log(`     Name: ${menu.name}`);
      console.log(`     Selected: ${menu.selected}`);
      console.log('');
    });
    
    // 查找processing Rich Menu
    const processingMenu = richMenuList.find(menu => 
      menu.name && (menu.name.includes('生成中') || menu.name.includes('Processing'))
    );
    
    if (!processingMenu) {
      console.error('❌ 找不到Processing Rich Menu');
      return;
    }
    
    console.log('🎯 找到Processing Rich Menu:');
    console.log(`   ID: ${processingMenu.richMenuId}`);
    console.log(`   Name: ${processingMenu.name}`);
    
    console.log('\n🔄 步骤2: 切换到Processing Rich Menu');
    
    // 切换到processing Rich Menu
    await client.linkRichMenuToUser(testUserId, processingMenu.richMenuId);
    console.log('✅ 成功切换到Processing Rich Menu');
    
    // 发送测试消息，模拟用户点击生成按钮后的体验
    console.log('\n📤 步骤3: 发送"生成中"消息');
    
    const processingMessage = {
      type: 'text',  
      text: '🎬 测试：AI视频生成中...\n\n✅ Rich Menu已切换到"生成中"状态\n\n📱 请查看下方Rich Menu是否显示正确\n\n💡 这模拟了用户点击生成按钮后的即时反馈'
    };
    
    await client.pushMessage(testUserId, processingMessage);
    console.log('✅ "生成中"消息发送成功');
    
    console.log('\n🎉 Processing Rich Menu切换测试完成！');
    console.log('');
    console.log('📱 请在LINE中验证：');
    console.log('1. Rich Menu是否切换到"生成中"状态');
    console.log('2. 是否显示了正确的Processing菜单');
    console.log('3. 菜单切换是否感觉即时和流畅');
    console.log('');
    console.log('✨ 如果看到Processing Rich Menu，说明自动弹出功能正常工作！');
    console.log('');
    console.log('🎯 用户体验目标达成：');
    console.log('  用户点击生成按钮 → Rich Menu立即弹出 → 显示"生成中，请耐心等待"');
    
  } catch (error) {
    console.error('❌ Processing Rich Menu切换测试失败:', error.message);
    
    if (error.response) {
      console.error('📊 API错误状态:', error.response.status);
      console.error('📋 API错误详情:', error.response.data);
    }
    
    console.log('');
    console.log('🔧 可能的原因：');
    console.log('1. 用户ID不正确或用户未添加Bot为好友');
    console.log('2. Rich Menu未正确创建或命名');
    console.log('3. Bot权限设置问题');
    console.log('4. LINE API临时问题');
  }
}

// 模拟完整的用户点击生成按钮体验
async function simulateUserGenerateClick() {
  console.log('🎬 模拟用户点击生成按钮的完整体验...');
  
  try {
    const testUserId = 'U23ea34c52091796e999d10f150460c78';
    
    // 步骤1: 立即切换Rich Menu（这是关键改进）
    console.log('⚡ 步骤1: 立即切换Rich Menu (优先级最高)');
    const richMenuList = await client.getRichMenuList();
    const processingMenu = richMenuList.find(menu => 
      menu.name && (menu.name.includes('生成中') || menu.name.includes('Processing'))
    );
    
    if (processingMenu) {
      await client.linkRichMenuToUser(testUserId, processingMenu.richMenuId);
      console.log('✅ Rich Menu切换完成 - 用户立即看到"生成中"状态');
    }
    
    // 步骤2: 发送处理中消息
    console.log('📤 步骤2: 发送处理中消息');
    const processingMessage = {
      type: 'text',
      text: '🎬 AI视频生成开始！\n\n⏱️ 预计需要30-60秒\n💡 请耐心等待，完成后将自动发送视频'
    };
    
    await client.pushMessage(testUserId, processingMessage);
    console.log('✅ 处理中消息发送完成');
    
    // 步骤3: 模拟后续处理（扣点数、启动生成等）
    console.log('💰 步骤3: 执行后续处理（扣点数、启动视频生成）');
    console.log('✅ 后续处理模拟完成');
    
    console.log('\n🎉 用户点击生成按钮体验模拟完成！');
    console.log('');
    console.log('📋 优化后的处理顺序：');
    console.log('  1️⃣ Rich Menu切换 (即时视觉反馈)');
    console.log('  2️⃣ 发送处理消息 (用户确认)');
    console.log('  3️⃣ 执行后续处理 (扣点数、启动生成)');
    console.log('');
    console.log('✨ 这确保用户在点击按钮后立即看到Rich Menu状态变化！');
    
  } catch (error) {
    console.error('❌ 用户体验模拟失败:', error.message);
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
🧪 Processing Rich Menu切换测试工具

功能：
- 测试Rich Menu到Processing状态的切换
- 验证用户点击生成按钮后的即时反馈
- 模拟完整的用户体验流程

使用方法：
  node scripts/test-processing-menu-switch.js          # 基本测试
  node scripts/test-processing-menu-switch.js --sim   # 完整体验模拟

测试内容：
✅ Rich Menu列表获取
✅ Processing Menu识别  
✅ 用户Rich Menu切换
✅ 生成中消息发送
✅ 用户体验验证

预期结果：
- Rich Menu立即切换到"生成中"状态
- 用户看到明确的进度反馈
- 整个过程感觉流畅自然

注意事项：
- 修改testUserId为实际用户ID
- 确保Bot已添加为好友
- 确保Rich Menu已正确设置
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else if (process.argv.includes('--sim')) {
    simulateUserGenerateClick();
  } else {
    testProcessingMenuSwitch();
  }
}

module.exports = { testProcessingMenuSwitch, simulateUserGenerateClick }; 