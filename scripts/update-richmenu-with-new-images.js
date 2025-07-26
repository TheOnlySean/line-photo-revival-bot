const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

// LINE Client
const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken
});

async function updateRichMenus() {
  try {
    console.log('🎨 開始更新 Rich Menu...');
    
    // 1. 刪除現有的 Rich Menu
    console.log('🗑️ 刪除現有 Rich Menu...');
    const existingMenus = await client.getRichMenuList();
    for (const menu of existingMenus) {
      console.log(`刪除: ${menu.name} (${menu.richMenuId})`);
      await client.deleteRichMenu(menu.richMenuId);
    }
    
    // 2. 創建新的 Main Rich Menu (完整高度 2500x1686)
    console.log('📋 創建 Main Rich Menu...');
    const mainRichMenu = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: true,
      name: "写真復活 Main Menu (6 Buttons)",
      chatBarText: "メニュー",
      areas: [
        // 第一行：手振り、寄り添い、個性化
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=WAVE_VIDEO" }
        },
        {
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: { type: "postback", data: "action=GROUP_VIDEO" }
        },
        {
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=PERSONALIZE" }
        },
        // 第二行：優惠券+充值、官網客服、好友分享
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: "postback", data: "action=COUPON" }
        },
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: { type: "postback", data: "action=WEBSITE" }
        },
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: { type: "postback", data: "action=SHARE" }
        }
      ]
    };
    
    const mainMenuId = await client.createRichMenu(mainRichMenu);
    console.log('✅ Main Rich Menu 創建成功:', mainMenuId);
    
    // 3. 創建新的 Processing Rich Menu (緊湊高度 2500x843)
    console.log('📋 創建 Processing Rich Menu...');
    const processingRichMenu = {
      size: {
        width: 2500,
        height: 843
      },
      selected: true,
      name: "写真復活 Processing Menu",
      chatBarText: "生成中...",
      areas: [
        // 整個區域都是一個按鈕（可選）
        {
          bounds: { x: 0, y: 0, width: 2500, height: 843 },
          action: { type: "postback", data: "action=CHECK_STATUS" }
        }
      ]
    };
    
    const processingMenuId = await client.createRichMenu(processingRichMenu);
    console.log('✅ Processing Rich Menu 創建成功:', processingMenuId);
    
    // 4. 上傳圖片
    console.log('🖼️ 上傳 Main Menu 圖片...');
    const mainImagePath = path.join(__dirname, '..', 'assets', 'richmenu-main-resized.jpg');
    const mainImageBuffer = fs.readFileSync(mainImagePath);
    await client.setRichMenuImage(mainMenuId, mainImageBuffer, 'image/jpeg');
    console.log('✅ Main Menu 圖片上傳成功');
    
    console.log('🖼️ 上傳 Processing Menu 圖片...');
    const processingImagePath = path.join(__dirname, '..', 'assets', 'richmenu-processing-resized.jpg');
    const processingImageBuffer = fs.readFileSync(processingImagePath);
    await client.setRichMenuImage(processingMenuId, processingImageBuffer, 'image/jpeg');
    console.log('✅ Processing Menu 圖片上傳成功');
    
    // 5. 設置默認 Rich Menu
    console.log('🎯 設置默認 Rich Menu...');
    await client.setDefaultRichMenu(mainMenuId);
    console.log('✅ 默認 Rich Menu 設置成功');
    
    // 6. 更新配置文件
    console.log('📝 更新配置文件...');
    const richMenuConfig = {
      mainRichMenuId: mainMenuId,
      processingRichMenuId: processingMenuId,
      updatedAt: new Date().toISOString(),
      note: "Updated with new user-provided images"
    };
    
    const configPath = path.join(__dirname, '..', 'config', 'richmenu-ids.json');
    fs.writeFileSync(configPath, JSON.stringify(richMenuConfig, null, 2));
    console.log('✅ 配置文件更新成功');
    
    console.log('\n🎉 Rich Menu 更新完成！');
    console.log('📋 新的 Rich Menu ID:');
    console.log(`  Main Menu: ${mainMenuId}`);
    console.log(`  Processing Menu: ${processingMenuId}`);
    
  } catch (error) {
    console.error('❌ 更新 Rich Menu 失敗:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  updateRichMenus();
}

module.exports = { updateRichMenus }; 