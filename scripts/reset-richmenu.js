const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret,
});

// Main Rich Menu Configuration
const mainRichMenu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "写真復活 Main Menu (6 Buttons)",
  chatBarText: "メニュー",
  areas: [
    // 第一行：手振り、昭和カバー、個性化
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "postback", data: "action=WAVE_VIDEO" }
    },
    {
      bounds: { x: 833, y: 0, width: 833, height: 843 },
      action: { type: "postback", data: "action=CREATE_POSTER" }
    },
    {
      bounds: { x: 1666, y: 0, width: 834, height: 843 },
      action: { type: "postback", data: "action=PERSONALIZE" }
    },
    // 第二行
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: { type: "postback", data: "action=COUPON" }
    },
    {
      bounds: { x: 833, y: 843, width: 833, height: 843 },
      action: { type: "uri", uri: "https://angelsphoto.ai" }
    },
    {
      bounds: { x: 1666, y: 843, width: 834, height: 843 },
      action: { type: "uri", uri: `https://line.me/R/nv/recommendOA/${lineConfig.basicId}` }
    }
  ]
};

// Processing Rich Menu Configuration
const processingRichMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "写真復活 Processing Menu",
  chatBarText: "生成中...",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: "postback", data: "action=CHECK_STATUS" }
    }
  ]
};

async function setupRichMenu() {
  console.log('🔄 开始重新创建Rich Menu...');
  try {
    // 创建主菜单
    const mainRichMenuId = await client.createRichMenu(mainRichMenu);
    console.log('✅ 主菜单创建成功, ID:', mainRichMenuId);

    // 上传主菜单图片
    const mainImagePath = path.resolve(__dirname, '../assets/richmenu-main-resized.jpg');
    await client.setRichMenuImage(mainRichMenuId, fs.createReadStream(mainImagePath));
    console.log('✅ 主菜单图片上传成功');

    // 创建处理中菜单
    const processingRichMenuId = await client.createRichMenu(processingRichMenu);
    console.log('✅ 处理中菜单创建成功, ID:', processingRichMenuId);

    // 上传处理中菜单图片
    const processingImagePath = path.resolve(__dirname, '../assets/richmenu-processing-resized.jpg');
    await client.setRichMenuImage(processingRichMenuId, fs.createReadStream(processingImagePath));
    console.log('✅ 处理中菜单图片上传成功');
    
    // 设置主菜单为默认
    await client.setDefaultRichMenu(mainRichMenuId);
    console.log('✅ 主菜单已设为默认');

  } catch (error) {
    console.error('❌ 创建Rich Menu失败:', error.originalError?.response?.data || error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupRichMenu()
    .then(() => {
      console.log('🎉 Rich Menu重置完成!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 重置失败:', error);
      process.exit(1);
    });
}

module.exports = { setupRichMenu }; 