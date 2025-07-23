const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const fs = require('fs');
const path = require('path');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

async function fixRichMenuImages() {
  try {
    console.log('🔧 修复Rich Menu图片...');
    
    // 获取当前Rich Menu列表
    const richMenus = await client.getRichMenuList();
    console.log(`📋 找到 ${richMenus.length} 个Rich Menu`);
    
    // 查找主菜单
    const mainMenu = richMenus.find(menu => menu.name === '写真復活 Main Menu');
    if (!mainMenu) {
      console.log('❌ 找不到主菜单！');
      return;
    }
    
    console.log(`🎯 找到主菜单: ${mainMenu.richMenuId}`);
    
    // 检查图片文件
    const imagePaths = [
      path.join(__dirname, '..', 'assets', 'richmenu-main.png'),
      path.join(__dirname, '..', 'assets', 'richmenu.png'),
      path.join(__dirname, '..', 'richmenu-main.png'),
      path.join(__dirname, '..', 'richmenu.png')
    ];
    
    let imageBuffer = null;
    let usedImagePath = null;
    
    for (const imagePath of imagePaths) {
      if (fs.existsSync(imagePath)) {
        imageBuffer = fs.readFileSync(imagePath);
        usedImagePath = imagePath;
        console.log(`✅ 找到图片文件: ${usedImagePath}`);
        console.log(`📊 图片大小: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
        break;
      }
    }
    
    if (!imageBuffer) {
      console.log('❌ 找不到图片文件！创建简单测试图片...');
      
      // 创建一个简单的PNG图片
      imageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG署名
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR块开始
        0x09, 0xC4, 0x06, 0x96, 0x08, 0x02, 0x00, 0x00, // 宽2500, 高1686, RGB
        0x00, 0x8D, 0x58, 0x7D, 0x7A, // IHDR结束 + CRC
        0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT块 (最小数据)
        0x78, 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x0A, // CRC
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND
      ]);
      console.log('📊 使用最小PNG图片');
    }
    
    // 上传图片到主菜单
    console.log('📤 上传图片到主菜单...');
    await client.setRichMenuImage(mainMenu.richMenuId, imageBuffer, 'image/png');
    console.log('✅ 主菜单图片上传成功！');
    
    // 处理处理中菜单
    const processingMenu = richMenus.find(menu => menu.name === '写真復活 Processing Menu');
    if (processingMenu) {
      console.log(`🔄 处理处理中菜单: ${processingMenu.richMenuId}`);
      
      // 为处理中菜单也上传图片（可以是同一个图片）
      console.log('📤 上传图片到处理中菜单...');
      await client.setRichMenuImage(processingMenu.richMenuId, imageBuffer, 'image/png');
      console.log('✅ 处理中菜单图片上传成功！');
    }
    
    // 验证图片上传
    console.log('🔍 验证图片上传...');
    try {
      const verifyBuffer = await client.getRichMenuImage(mainMenu.richMenuId);
      if (verifyBuffer && verifyBuffer.length > 0) {
        console.log(`✅ 验证成功：主菜单图片大小 ${verifyBuffer.length} bytes`);
      } else {
        console.log('⚠️ 验证失败：图片可能没有上传成功');
      }
    } catch (verifyError) {
      console.log('⚠️ 验证过程中出错，但图片可能已上传成功');
    }
    
    console.log('\n🎉 图片修复完成！');
    console.log('');
    console.log('🧪 现在请测试：');
    console.log('1. 完全关闭LINE应用');
    console.log('2. 等待30秒');
    console.log('3. 重新打开LINE应用');
    console.log('4. 进入bot对话');
    console.log('5. 检查是否显示Rich Menu');
    console.log('6. 点击Rich Menu按钮');
    console.log('');
    console.log('📋 期望结果：现在应该能看到Rich Menu，点击后触发postback事件');
    
  } catch (error) {
    console.error('❌ 修复图片失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('🔍 错误堆栈:', error.stack);
  }
}

// 运行修复
fixRichMenuImages(); 