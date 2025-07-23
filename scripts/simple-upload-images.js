const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

// 初始化LINE客户端
const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

async function uploadRichMenuImages() {
  try {
    console.log('🚀 直接上传Rich Menu图片...');
    
    // 获取Rich Menu列表
    const richMenus = await client.getRichMenuList();
    console.log('📋 找到Rich Menu数量:', richMenus.length);
    
    if (richMenus.length === 0) {
      console.error('❌ 没有找到Rich Menu！');
      return;
    }
    
    // 为每个Rich Menu上传图片
    for (const menu of richMenus) {
      console.log(`\n🎯 处理Rich Menu: ${menu.name}`);
      console.log(`📍 ID: ${menu.richMenuId}`);
      
      // 确定图片文件
      let imageFileName;
      if (menu.name.includes('Main') || menu.name.includes('Standard')) {
        imageFileName = 'richmenu-main.png';
      } else if (menu.name.includes('Processing')) {
        imageFileName = 'richmenu-processing.png';
      } else {
        console.log('⚠️ 无法确定图片类型，跳过');
        continue;
      }
      
      const imagePath = path.join(__dirname, '..', 'assets', imageFileName);
      console.log('📁 图片路径:', imagePath);
      
      if (!fs.existsSync(imagePath)) {
        console.log('❌ 图片文件不存在:', imagePath);
        continue;
      }
      
      // 检查文件大小
      const stats = fs.statSync(imagePath);
      console.log(`📊 文件大小: ${(stats.size / 1024).toFixed(2)}KB`);
      
      if (stats.size > 1024 * 1024) {
        console.log('⚠️ 文件过大，尝试压缩版本...');
        
        const compressedPath = path.join(__dirname, '..', 'assets', 'richmenu-main-compressed.png');
        if (fs.existsSync(compressedPath)) {
          const compressedStats = fs.statSync(compressedPath);
          console.log(`📊 压缩文件大小: ${(compressedStats.size / 1024 / 1024).toFixed(2)}MB`);
          
          if (compressedStats.size <= 1024 * 1024) {
            imagePath = compressedPath;
            stats = compressedStats;
            console.log('✅ 使用压缩版本');
          } else {
            console.log('❌ 压缩版本仍然太大，跳过');
            continue;
          }
        } else {
          console.log('❌ 没有找到压缩版本，跳过');
          continue;
        }
      }
      
      try {
        // 读取图片
        const imageBuffer = fs.readFileSync(imagePath);
        console.log('📷 读取图片成功，开始上传...');
        
        // 上传图片
        await client.setRichMenuImage(menu.richMenuId, imageBuffer, 'image/png');
        console.log('✅ 图片上传成功！');
        
        // 验证上传
        try {
          const uploadedImage = await client.getRichMenuImage(menu.richMenuId);
          console.log(`✅ 验证成功，图片大小: ${uploadedImage.length} bytes`);
        } catch (verifyError) {
          console.log('❌ 验证失败，但上传可能已成功');
        }
        
      } catch (uploadError) {
        console.error('❌ 上传失败:', uploadError.message);
        
        if (uploadError.response) {
          console.error('📊 错误状态:', uploadError.response.status);
          console.error('📋 错误数据:', uploadError.response.data);
        }
      }
    }
    
    console.log('\n🎉 图片上传流程完成！');
    console.log('📱 请重启LINE应用测试Rich Menu');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', error.response.data);
    }
  }
}

// 运行脚本
uploadRichMenuImages(); 