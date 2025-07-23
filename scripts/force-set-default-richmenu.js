const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

async function forceSetDefaultRichMenu() {
  try {
    console.log('🔧 强制设置默认Rich Menu...');
    
    // 获取所有Rich Menu
    const richMenus = await client.getRichMenuList();
    console.log(`📋 找到 ${richMenus.length} 个Rich Menu`);
    
    if (richMenus.length === 0) {
      console.log('❌ 没有找到任何Rich Menu！');
      return;
    }
    
    // 找到最新创建的菜单（通常是最后一个）
    const latestMenu = richMenus[richMenus.length - 1];
    console.log(`🎯 最新菜单: ${latestMenu.name} (${latestMenu.richMenuId})`);
    
    // 强制设置为默认
    console.log('📱 设置为默认Rich Menu...');
    await client.setDefaultRichMenu(latestMenu.richMenuId);
    console.log('✅ 设置完成！');
    
    // 验证设置
    console.log('🔍 验证默认设置...');
    const defaultMenuId = await client.getDefaultRichMenuId();
    console.log(`📱 当前默认菜单ID: ${defaultMenuId}`);
    
    if (defaultMenuId === latestMenu.richMenuId) {
      console.log('🎉 默认Rich Menu设置成功！');
      
      // 显示菜单详情
      console.log('\n📊 当前Rich Menu详情:');
      console.log(`  名称: ${latestMenu.name}`);
      console.log(`  聊天栏文字: ${latestMenu.chatBarText}`);
      console.log(`  区域数: ${latestMenu.areas.length}`);
      
      if (latestMenu.areas.length > 0) {
        const firstArea = latestMenu.areas[0];
        console.log(`  第一个按钮动作: ${firstArea.action.type}`);
        if (firstArea.action.type === 'postback') {
          console.log(`  Postback数据: ${firstArea.action.data}`);
          console.log(`  显示文字: ${firstArea.action.displayText}`);
        }
      }
      
      console.log('\n🧪 现在请立即测试：');
      console.log('1. 🔴 完全关闭LINE应用（从后台清除）');
      console.log('2. ⏰ 等待30秒');
      console.log('3. 🔵 重新打开LINE应用');
      console.log('4. 💬 进入bot对话');
      console.log('5. 👀 检查底部是否显示"メニュー"');
      console.log('6. 👆 点击菜单区域');
      console.log('');
      console.log('📋 期望结果：');
      console.log('   ✅ 机器人回复："👋【手振り動画生成】が選択されました"');
      console.log('   ❌ 而不是你发送文本消息');
      console.log('');
      console.log('💡 如果还是发送文本消息，可能需要等待最多24小时LINE同步');
      
    } else {
      console.log('⚠️ 默认菜单设置可能失败');
    }
    
  } catch (error) {
    console.error('❌ 设置默认菜单失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('🔍 错误堆栈:', error.stack);
  }
}

// 运行脚本
forceSetDefaultRichMenu(); 