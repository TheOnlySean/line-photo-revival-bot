const line = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const db = require('../config/database');
const LineBot = require('../services/line-bot');

async function uploadRichMenuImages() {
  try {
    console.log('📤 开始上传Rich Menu图片...');
    
    // 初始化 LINE client
    const client = new line.Client(lineConfig);
    const lineBot = new LineBot(client, db);
    
    // 获取当前Rich Menu列表
    const richMenus = await client.getRichMenuList();
    console.log('📋 找到Rich Menu列表:');
    
    for (const menu of richMenus) {
      console.log(`  - ${menu.name}: ${menu.richMenuId}`);
    }
    
    // 查找主菜单和处理中菜单
    const mainMenu = richMenus.find(menu => menu.name.includes('Main Menu'));
    const processingMenu = richMenus.find(menu => menu.name.includes('Processing Menu'));
    
    if (!mainMenu) {
      throw new Error('未找到主菜单');
    }
    
    if (!processingMenu) {
      throw new Error('未找到处理中菜单');
    }
    
    console.log(`✅ 主菜单ID: ${mainMenu.richMenuId}`);
    console.log(`✅ 处理中菜单ID: ${processingMenu.richMenuId}`);
    
    // 上传主菜单图片
    console.log('📤 上传主菜单图片...');
    await lineBot.uploadRichMenuImage(mainMenu.richMenuId, 'main');
    
    // 上传处理中菜单图片
    console.log('📤 上传处理中菜单图片...');
    await lineBot.uploadRichMenuImage(processingMenu.richMenuId, 'processing');
    
    console.log('✅ 所有图片上传成功！');
    
    // 尝试设置主菜单为默认
    console.log('🔄 设置主菜单为默认...');
    await client.setDefaultRichMenu(mainMenu.richMenuId);
    console.log('✅ 主菜单已设置为默认！');
    
  } catch (error) {
    console.error('❌ 上传图片失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  uploadRichMenuImages()
    .then(() => {
      console.log('🎉 Rich Menu图片上传完成!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 上传失败:', error);
      process.exit(1);
    });
}

module.exports = { uploadRichMenuImages }; 