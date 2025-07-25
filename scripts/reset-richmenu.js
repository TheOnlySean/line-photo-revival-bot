const axios = require('axios');
const lineConfig = require('../config/line-config');

const LINE_ACCESS_TOKEN = lineConfig.channelAccessToken;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

async function resetRichMenu() {
  try {
    console.log('🗑️ 开始重置Rich Menu...');
    
    // 1. 获取所有现有Rich Menu
    const listResponse = await axios.get(`${LINE_API_BASE}/richmenu/list`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    const richMenus = listResponse.data.richmenus;
    console.log(`📋 找到 ${richMenus.length} 个现有Rich Menu`);
    
    // 2. 删除所有现有Rich Menu
    for (const menu of richMenus) {
      try {
        console.log(`🗑️ 删除Rich Menu: ${menu.name} (${menu.richMenuId})`);
        await axios.delete(`${LINE_API_BASE}/richmenu/${menu.richMenuId}`, {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
          }
        });
        console.log(`✅ 已删除: ${menu.name}`);
      } catch (error) {
        console.error(`❌ 删除失败: ${menu.name}`, error.response?.data || error.message);
      }
    }
    
    // 3. 重新创建Rich Menu
    console.log('🔄 开始重新创建Rich Menu...');
    
    const line = require('@line/bot-sdk');
    const lineConfig = require('../config/line-config');
    const db = require('../config/database');
    const LineBot = require('../services/line-bot');
    
    // 初始化 LINE client
    const client = new line.Client(lineConfig);
    const lineBot = new LineBot(client, db);
    
    // 重新设置Rich Menu
    const result = await lineBot.setupRichMenu();
    console.log('✅ Rich Menu重新创建完成!', result);
    
  } catch (error) {
    console.error('❌ 重置Rich Menu失败:', error.response?.data || error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  resetRichMenu()
    .then(() => {
      console.log('🎉 Rich Menu重置完成!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 重置失败:', error);
      process.exit(1);
    });
}

module.exports = { resetRichMenu }; 