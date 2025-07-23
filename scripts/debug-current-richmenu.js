const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

async function debugCurrentRichMenu() {
  try {
    console.log('🔍 深度调试当前Rich Menu配置...');
    
    // 1. 获取所有Rich Menu
    console.log('📋 获取所有Rich Menu...');
    const richMenus = await client.getRichMenuList();
    console.log(`📊 总数: ${richMenus.length}`);
    
    for (let i = 0; i < richMenus.length; i++) {
      const menu = richMenus[i];
      console.log(`\n📱 Rich Menu ${i + 1}:`);
      console.log(`  ID: ${menu.richMenuId}`);
      console.log(`  名称: ${menu.name}`);
      console.log(`  尺寸: ${menu.size.width}x${menu.size.height}`);
      console.log(`  选中状态: ${menu.selected}`);
      console.log(`  聊天栏文字: ${menu.chatBarText}`);
      console.log(`  区域数: ${menu.areas.length}`);
      
      // 详细检查每个区域的action
      menu.areas.forEach((area, areaIndex) => {
        console.log(`\n  🔘 区域 ${areaIndex + 1}:`);
        console.log(`    边界: x=${area.bounds.x}, y=${area.bounds.y}, w=${area.bounds.width}, h=${area.bounds.height}`);
        console.log(`    动作类型: ${area.action.type}`);
        
        if (area.action.type === 'postback') {
          console.log(`    📤 Postback数据: "${area.action.data}"`);
          console.log(`    💬 显示文字: "${area.action.displayText || '无'}"`);
          console.log(`    📝 标签: "${area.action.label || '无'}"`);
        } else if (area.action.type === 'message') {
          console.log(`    💬 消息文本: "${area.action.text}"`);
        } else if (area.action.type === 'uri') {
          console.log(`    🔗 URI: "${area.action.uri}"`);
        } else {
          console.log(`    ❓ 其他动作: ${JSON.stringify(area.action, null, 6)}`);
        }
      });
      
      // 检查图片状态
      console.log('\n  🖼️ 检查图片状态...');
      try {
        const imageBuffer = await client.getRichMenuImage(menu.richMenuId);
        if (imageBuffer && imageBuffer.length > 0) {
          console.log(`  ✅ 图片存在 (${imageBuffer.length} bytes)`);
        } else {
          console.log('  ❌ 图片为空或不存在');
        }
      } catch (imageError) {
        console.log(`  ❌ 获取图片失败: ${imageError.message}`);
      }
    }
    
    // 2. 检查默认Rich Menu
    console.log('\n📱 检查默认Rich Menu设置...');
    try {
      const defaultMenuId = await client.getDefaultRichMenuId();
      console.log(`✅ 默认Rich Menu ID: ${defaultMenuId}`);
      
      const defaultMenu = richMenus.find(menu => menu.richMenuId === defaultMenuId);
      if (defaultMenu) {
        console.log(`✅ 默认菜单名称: ${defaultMenu.name}`);
        console.log(`📊 默认菜单区域数: ${defaultMenu.areas.length}`);
        
        // 重点检查默认菜单的第一个按钮
        if (defaultMenu.areas.length > 0) {
          const firstButton = defaultMenu.areas[0];
          console.log('\n🎯 重点检查第一个按钮:');
          console.log(`  类型: ${firstButton.action.type}`);
          
          if (firstButton.action.type === 'postback') {
            console.log(`  ✅ 确认是postback类型`);
            console.log(`  📤 数据: "${firstButton.action.data}"`);
            console.log(`  💬 显示文字: "${firstButton.action.displayText || '无'}"`);
          } else {
            console.log(`  ❌ 不是postback类型，是: ${firstButton.action.type}`);
            if (firstButton.action.type === 'message') {
              console.log(`  💬 消息文本: "${firstButton.action.text}"`);
              console.log('  🚨 这就是问题所在！按钮配置为message而不是postback！');
            }
          }
        }
      } else {
        console.log('❌ 找不到默认菜单对应的配置');
      }
    } catch (defaultError) {
      console.log(`❌ 获取默认Rich Menu失败: ${defaultError.message}`);
    }
    
    console.log('\n🏁 调试完成！');
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('🔍 错误堆栈:', error.stack);
  }
}

// 运行调试
debugCurrentRichMenu(); 