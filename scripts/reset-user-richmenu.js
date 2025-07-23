const axios = require('axios');
const lineConfig = require('../config/line-config');

const LINE_ACCESS_TOKEN = lineConfig.channelAccessToken;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

// 你的LINE用户ID (从数据库或日志中获取)
const USER_ID = process.argv[2];

async function resetUserRichMenu() {
  if (!USER_ID) {
    console.log('❌ 请提供用户ID');
    console.log('使用方法: node scripts/reset-user-richmenu.js <USER_ID>');
    console.log('');
    console.log('🔍 如果不知道用户ID，可以：');
    console.log('1. 发送任意消息给bot，查看服务器日志');
    console.log('2. 或者使用 "all" 来清除所有用户的Rich Menu');
    return;
  }
  
  try {
    console.log(`🔄 重置用户Rich Menu: ${USER_ID}`);
    
    if (USER_ID === 'all') {
      // 清除所有用户的Rich Menu (让他们使用默认菜单)
      console.log('🧹 清除所有用户的自定义Rich Menu...');
      
      try {
        await axios.delete(`${LINE_API_BASE}/user/all/richmenu`, {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
          }
        });
        console.log('✅ 成功清除所有用户的自定义Rich Menu');
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.log('📝 没有找到需要清除的自定义Rich Menu');
        } else {
          throw error;
        }
      }
    } else {
      // 清除特定用户的Rich Menu
      console.log(`🧹 清除用户 ${USER_ID} 的自定义Rich Menu...`);
      
      try {
        await axios.delete(`${LINE_API_BASE}/user/${USER_ID}/richmenu`, {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
          }
        });
        console.log('✅ 成功清除用户的自定义Rich Menu');
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.log('📝 用户没有自定义Rich Menu');
        } else {
          throw error;
        }
      }
    }
    
    // 获取主菜单ID
    const listResponse = await axios.get(`${LINE_API_BASE}/richmenu/list`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    const mainMenu = listResponse.data.richmenus.find(menu => menu.name.includes('Main Menu'));
    
    if (!mainMenu) {
      console.error('❌ 未找到主菜单！');
      return;
    }
    
    if (USER_ID === 'all') {
      // 为所有用户设置主菜单
      console.log('📱 为所有用户设置新的主菜单...');
      await axios.post(`${LINE_API_BASE}/user/all/richmenu/${mainMenu.richMenuId}`, {}, {
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        }
      });
    } else {
      // 为特定用户设置主菜单
      console.log(`📱 为用户 ${USER_ID} 设置新的主菜单...`);
      await axios.post(`${LINE_API_BASE}/user/${USER_ID}/richmenu/${mainMenu.richMenuId}`, {}, {
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        }
      });
    }
    
    console.log('🎉 Rich Menu设置完成！');
    console.log('⚠️  请重启LINE应用或等待几分钟生效');
    console.log('🧪 然后测试点击Rich Menu按钮');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行脚本
resetUserRichMenu(); 