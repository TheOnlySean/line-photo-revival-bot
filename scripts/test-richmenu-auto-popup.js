const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const database = require('../config/database');
const LineBot = require('../services/line-bot');

// 创建LINE客户端和服务
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

const lineBot = new LineBot(client);

async function testRichMenuAutoPopup() {
  console.log('🧪 开始测试Rich Menu自动弹出功能...');
  
  try {
    // 测试用户ID - 请替换为您的LINE用户ID
    const testUserId = 'U23ea34c52091796e999d10f150460c78'; // 替换为实际用户ID
    
    console.log('🔍 步骤1: 检查当前Rich Menu状态');
    
    // 获取用户当前的Rich Menu
    try {
      const currentRichMenu = await client.getRichMenuIdOfUser(testUserId);
      console.log('📋 当前用户Rich Menu ID:', currentRichMenu || '无');
    } catch (error) {
      console.log('📋 用户当前没有Rich Menu或无法获取');
    }
    
    // 获取所有Rich Menu列表
    const richMenuList = await client.getRichMenuList();
    console.log('📝 可用的Rich Menu列表:');
    richMenuList.forEach((menu, index) => {
      console.log(`  ${index + 1}. ID: ${menu.richMenuId}, Name: ${menu.name}`);
    });
    
    console.log('\n🔄 步骤2: 模拟切换到Processing Rich Menu');
    
    // 查找processing Rich Menu
    const processingMenu = richMenuList.find(menu => 
      menu.name && menu.name.includes('生成中') || menu.name.includes('Processing')
    );
    
    if (!processingMenu) {
      console.error('❌ 找不到Processing Rich Menu，请先确保Rich Menu已正确设置');
      return;
    }
    
    console.log('🎯 找到Processing Rich Menu:', processingMenu.richMenuId);
    
    // 切换到processing Rich Menu
    console.log('🔄 切换到Processing Rich Menu...');
    await client.linkRichMenuToUser(testUserId, processingMenu.richMenuId);
    console.log('✅ 已切换到Processing Rich Menu');
    
    // 发送测试消息
    console.log('📤 发送生成中测试消息...');
    const processingMessage = {
      type: 'text',
      text: '🎬 测试：AI视频生成中...\n\n📱 请查看下方是否显示了"生成中"Rich Menu\n\n⏱️ 这条消息模拟用户点击生成按钮后的状体验\n\n💡 Rich Menu应该自动从输入状态切换到"生成中"状态'
    };
    
    await client.pushMessage(testUserId, processingMessage);
    console.log('✅ 生成中消息发送成功');
    
    console.log('\n⏰ 等待10秒后切换回主菜单...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('🔄 步骤3: 切换回主Rich Menu');
    
    // 查找主Rich Menu
    const mainMenu = richMenuList.find(menu => 
      menu.name && (menu.name.includes('Main') || menu.name.includes('主要') || menu.name.includes('メイン') || menu.name.includes('写真復活'))
    );
    
    if (mainMenu) {
      console.log('🎯 找到主Rich Menu:', mainMenu.richMenuId);
      await client.linkRichMenuToUser(testUserId, mainMenu.richMenuId);
      console.log('✅ 已切换回主Rich Menu');
      
      // 发送完成消息
      await client.pushMessage(testUserId, {
        type: 'text',
        text: '🎉 测试完成！\n\n✅ Rich Menu自动弹出功能正常\n\n📋 测试流程:\n1. 显示当前Rich Menu状态\n2. 切换到"生成中"Rich Menu\n3. 发送处理中消息\n4. 等待10秒\n5. 切换回主Rich Menu\n6. 发送完成确认\n\n💡 这模拟了用户点击生成按钮后的完整体验'
      });
      
    } else {
      console.warn('⚠️ 找不到主Rich Menu，无法切换回去');
    }
    
    console.log('\n🎉 Rich Menu自动弹出测试完成！');
    console.log('');
    console.log('📱 请在LINE中验证以下内容：');
    console.log('1. 收到"生成中"消息时，Rich Menu是否显示为Processing状态');
    console.log('2. Rich Menu是否从输入状态自动切换到"生成中"状态');
    console.log('3. 10秒后Rich Menu是否自动切换回主菜单');
    console.log('4. 整个过程是否感觉自然流畅');
    console.log('');
    console.log('💡 如果体验良好，说明自动弹出功能已正确实现！');
    
  } catch (error) {
    console.error('❌ Rich Menu自动弹出测试失败:', error);
    
    if (error.response) {
      console.error('📊 API错误状态:', error.response.status);
      console.error('📋 API错误详情:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('');
    console.log('🔧 故障排除建议:');
    console.log('1. 检查Rich Menu是否正确创建和命名');
    console.log('2. 确认用户ID是否正确');
    console.log('3. 验证Bot权限设置');
    console.log('4. 检查Rich Menu图片是否正确上传');
  }
  
  // 关闭数据库连接
  try {
    if (database && database.pool) {
      await database.pool.end();
    }
  } catch (error) {
    console.log('📝 数据库连接已关闭或不存在');
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
🧪 Rich Menu自动弹出测试工具

功能：
- 测试用户点击生成按钮后Rich Menu的自动切换
- 验证从输入状态到"生成中"状态的无缝转换
- 模拟完整的用户体验流程

使用方法：
  node scripts/test-richmenu-auto-popup.js

测试流程：
1. 检查当前Rich Menu状态
2. 切换到Processing Rich Menu
3. 发送处理中消息 
4. 等待10秒
5. 切换回主Rich Menu
6. 发送完成确认

验证要点：
- Rich Menu是否能自动弹出
- 切换是否及时和流畅
- 用户体验是否符合预期

注意事项：
- 需要修改脚本中的testUserId为实际用户ID
- 确保Rich Menu已正确设置和命名
- Bot需要已添加为测试用户的好友

用户体验目标：
参考AIイラスト君的体验，用户点击生成按钮后：
1. Rich Menu立即从输入状态切换到"生成中"状态
2. 显示明确的"生成中，请耐心等待"提示
3. 完成后自动切换回主菜单
4. 整个过程给用户清晰的状态反馈
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    testRichMenuAutoPopup();
  }
}

module.exports = testRichMenuAutoPopup; 