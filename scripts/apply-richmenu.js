const axios = require('axios');
const lineConfig = require('../config/line-config');

const LINE_ACCESS_TOKEN = lineConfig.channelAccessToken;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

async function checkAndApplyRichMenu() {
  try {
    console.log('🔍 检查现有Rich Menu状态...');
    
    // 1. 获取所有Rich Menu
    const listResponse = await axios.get(`${LINE_API_BASE}/richmenu/list`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    console.log('📋 现有Rich Menu列表:');
    const richMenus = listResponse.data.richmenus;
    richMenus.forEach((menu, index) => {
      console.log(`  ${index + 1}. ID: ${menu.richMenuId}`);
      console.log(`     名称: ${menu.name}`);
      console.log(`     区域数: ${menu.areas.length}`);
    });
    
    // 2. 查找主菜单 (包含"Main Menu"的菜单)
    const mainMenu = richMenus.find(menu => menu.name.includes('Main Menu'));
    
    if (!mainMenu) {
      console.error('❌ 未找到主菜单！请先运行 reset-richmenu.js');
      return;
    }
    
    console.log(`✅ 找到主菜单: ${mainMenu.richMenuId}`);
    
    // 3. 检查当前默认Rich Menu
    try {
      const defaultResponse = await axios.get(`${LINE_API_BASE}/user/all/richmenu`, {
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        }
      });
      
      console.log(`📌 当前默认菜单: ${defaultResponse.data.richMenuId}`);
      
      if (defaultResponse.data.richMenuId === mainMenu.richMenuId) {
        console.log('✅ 主菜单已经是默认菜单，无需更改');
        return;
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('📝 当前没有设置默认菜单');
      } else {
        throw error;
      }
    }
    
    // 4. 设置主菜单为默认菜单
    console.log('🔄 设置主菜单为默认菜单...');
    await axios.post(`${LINE_API_BASE}/user/all/richmenu/${mainMenu.richMenuId}`, {}, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    console.log('🎉 成功设置默认Rich Menu！');
    console.log('📱 所有用户现在将看到新的Rich Menu');
    console.log('⚠️  可能需要重启LINE应用或等待几分钟生效');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行脚本
checkAndApplyRichMenu(); 