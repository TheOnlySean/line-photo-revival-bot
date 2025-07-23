const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

async function recreateRichMenuWithImage() {
  try {
    console.log('🔄 重新创建Rich Menu并上传图片...');
    
    // 1. 删除所有现有Rich Menu
    console.log('🗑️ 删除现有Rich Menu...');
    const existingMenus = await client.getRichMenuList();
    
    for (const menu of existingMenus) {
      console.log(`删除: ${menu.name}`);
      await client.deleteRichMenu(menu.richMenuId);
    }
    
    // 2. 创建新的简化Rich Menu
    console.log('🎨 创建新的Rich Menu...');
    const richMenuConfig = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: false,
      name: "写真復活 Test Menu",
      chatBarText: "テスト",
      areas: [
        {
          bounds: {
            x: 0,
            y: 0,
            width: 1250,
            height: 843
          },
          action: {
            type: "postback",
            data: "action=wave",
            displayText: "手振り動画"
          }
        },
        {
          bounds: {
            x: 1250,
            y: 0,
            width: 1250,
            height: 843
          },
          action: {
            type: "postback",
            data: "action=group",
            displayText: "寄り添い動画"
          }
        },
        {
          bounds: {
            x: 0,
            y: 843,
            width: 2500,
            height: 843
          },
          action: {
            type: "uri",
            uri: "https://angelsphoto.ai"
          }
        }
      ]
    };
    
    const newMenuId = await client.createRichMenu(richMenuConfig);
    console.log('✅ Rich Menu创建成功:', newMenuId);
    
    // 3. 立即上传图片
    console.log('📷 上传图片...');
    const imagePath = path.join(__dirname, '..', 'assets', 'richmenu-main.png');
    
    if (!fs.existsSync(imagePath)) {
      throw new Error(`图片文件不存在: ${imagePath}`);
    }
    
    const imageBuffer = fs.readFileSync(imagePath);
    const stats = fs.statSync(imagePath);
    console.log(`📊 图片大小: ${(stats.size / 1024).toFixed(2)}KB`);
    
    // 使用正确的MIME类型
    await client.setRichMenuImage(newMenuId, imageBuffer, 'image/png');
    console.log('✅ 图片上传成功！');
    
    // 4. 验证图片上传
    console.log('🔍 验证图片...');
    try {
      const uploadedImage = await client.getRichMenuImage(newMenuId);
      console.log(`✅ 图片验证成功，大小: ${uploadedImage.length} bytes`);
    } catch (verifyError) {
      console.log('❌ 图片验证失败:', verifyError.message);
    }
    
    // 5. 设置为默认Rich Menu
    console.log('📱 设置为默认Rich Menu...');
    await client.setDefaultRichMenu(newMenuId);
    console.log('✅ 设置默认菜单成功！');
    
    console.log('\n🎉 Rich Menu完全设置完成！');
    console.log('📋 新菜单ID:', newMenuId);
    console.log('📱 请重启LINE应用测试新的Rich Menu');
    console.log('🧪 点击按钮应该触发postback事件而不是发送文本消息');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行脚本
recreateRichMenuWithImage(); 