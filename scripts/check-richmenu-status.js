const axios = require('axios');
const lineConfig = require('../config/line-config');

const LINE_ACCESS_TOKEN = lineConfig.channelAccessToken;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

async function checkRichMenuStatus() {
  try {
    console.log('🔍 检查Rich Menu完整状态...');
    
    // 1. 获取所有Rich Menu
    const listResponse = await axios.get(`${LINE_API_BASE}/richmenu/list`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    const richMenus = listResponse.data.richmenus;
    console.log('📋 Rich Menu总数:', richMenus.length);
    
    if (richMenus.length === 0) {
      console.error('❌ 没有找到任何Rich Menu！');
      return;
    }
    
    // 2. 检查每个Rich Menu的状态
    for (let i = 0; i < richMenus.length; i++) {
      const menu = richMenus[i];
      console.log(`\n📊 Rich Menu ${i + 1}:`);
      console.log(`  ID: ${menu.richMenuId}`);
      console.log(`  名称: ${menu.name}`);
      console.log(`  尺寸: ${menu.size.width}x${menu.size.height}`);
      console.log(`  区域数: ${menu.areas.length}`);
      
      // 检查是否有图片
      try {
        console.log('  🖼️ 检查图片状态...');
        const imageResponse = await axios.get(`${LINE_API_BASE}/richmenu/${menu.richMenuId}/content`, {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
          },
          responseType: 'arraybuffer'
        });
        
        const imageSize = imageResponse.data.byteLength;
        console.log(`  ✅ 图片存在，大小: ${imageSize} bytes`);
        
        if (imageSize < 1000) {
          console.log('  ⚠️ 图片可能损坏或不完整');
        }
        
      } catch (imageError) {
        if (imageError.response && imageError.response.status === 404) {
          console.log('  ❌ 图片不存在！');
        } else {
          console.log('  ❌ 图片检查失败:', imageError.message);
        }
      }
      
      // 检查第一个按钮的配置
      if (menu.areas.length > 0) {
        const firstArea = menu.areas[0];
        console.log('  🔘 第一个按钮:');
        console.log(`    类型: ${firstArea.action.type}`);
        console.log(`    数据: ${firstArea.action.data || 'N/A'}`);
        console.log(`    显示文字: ${firstArea.action.displayText || 'N/A'}`);
      }
    }
    
    // 3. 检查默认Rich Menu设置
    console.log('\n📱 检查默认Rich Menu设置...');
    try {
      const defaultResponse = await axios.get(`${LINE_API_BASE}/user/all/richmenu`, {
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        }
      });
      
      const defaultMenuId = defaultResponse.data.richMenuId;
      console.log(`✅ 默认Rich Menu ID: ${defaultMenuId}`);
      
      // 找到对应的菜单名称
      const defaultMenu = richMenus.find(menu => menu.richMenuId === defaultMenuId);
      if (defaultMenu) {
        console.log(`✅ 默认Rich Menu名称: ${defaultMenu.name}`);
      }
      
    } catch (defaultError) {
      if (defaultError.response && defaultError.response.status === 404) {
        console.log('❌ 没有设置默认Rich Menu！');
      } else {
        console.log('❌ 检查默认Rich Menu失败:', defaultError.message);
      }
    }
    
    // 4. 诊断建议
    console.log('\n💡 诊断建议:');
    
    const mainMenu = richMenus.find(menu => menu.name.includes('Main') || menu.name.includes('Standard'));
    if (!mainMenu) {
      console.log('❌ 没有找到主菜单，需要重新创建');
    } else {
      console.log('✅ 找到主菜单:', mainMenu.name);
      
      // 检查主菜单是否有图片
      try {
        await axios.get(`${LINE_API_BASE}/richmenu/${mainMenu.richMenuId}/content`, {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
          },
          responseType: 'arraybuffer'
        });
        console.log('✅ 主菜单有图片');
      } catch {
        console.log('❌ 主菜单缺少图片！这是问题的根源！');
        console.log('💡 解决方案: 需要重新上传图片');
      }
    }
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', error.response.data);
    }
  }
}

// 运行脚本
checkRichMenuStatus(); 