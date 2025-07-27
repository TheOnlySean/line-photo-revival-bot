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
    // 第一行
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "postback", data: "action=WAVE_VIDEO" }
    },
    {
      bounds: { x: 833, y: 0, width: 833, height: 843 },
      action: { type: "postback", data: "action=GROUP_VIDEO" }
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
      action: { type: "uri", uri: "https://line.me/R/msg/text/?%E2%9C%A8%20%E5%86%99%E7%9C%9F%E5%BE%A9%E6%B4%BB%E3%82%B5%E3%83%BC%E3%83%93%E3%82%B9%20%E2%9C%A8%0A%0A%E5%8F%A4%E3%81%84%E5%86%99%E7%9C%9F%E3%82%92%E7%BE%8E%E3%81%97%E3%81%84%E5%8B%95%E7%94%BB%E3%81%AB%E5%A4%89%E8%BA%AB%E3%81%95%E3%81%9B%E3%82%8B%E7%B4%A0%E6%99%B4%E3%82%89%E3%81%97%E3%81%84%E3%82%B5%E3%83%BC%E3%83%93%E3%82%B9%E3%82%92%E8%A6%8B%E3%81%A4%E3%81%91%E3%81%BE%E3%81%97%E3%81%9F%EF%BC%81%0A%0A%F0%9F%8E%AC%20%E6%89%8B%E6%8C%AF%E3%82%8A%E5%8B%95%E7%94%BB%0A%F0%9F%91%A5%20%E5%AF%84%E3%82%8A%E6%B7%BB%E3%81%84%E5%8B%95%E7%94%BB%0A%F0%9F%8E%A8%20%E3%82%AB%E3%82%B9%E3%82%BF%E3%83%9E%E3%82%A4%E3%82%BA%E5%8B%95%E7%94%BB%0A%0A%E3%81%9C%E3%81%B2%E4%B8%80%E7%B7%92%E3%81%AB%E8%A9%A6%E3%81%97%E3%81%A6%E3%81%BF%E3%81%BE%E3%81%9B%E3%82%93%E3%81%8B%EF%BC%9F%0A%0Ahttps%3A//angelsphoto.ai" }
    }
  ]
};

// Processing Rich Menu Configuration
const processingRichMenu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "写真復活 Processing Menu",
  chatBarText: "生成中...",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 1686 },
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