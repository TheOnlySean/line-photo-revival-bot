const LineBotService = require('../services/line-bot');
const lineConfig = require('../config/line-config');

async function forceUploadImages() {
  try {
    console.log('🚀 强制上传Rich Menu图片...');
    
    // 初始化LINE Bot服务
    const lineBot = new LineBotService(lineConfig);
    
    // 获取现有Rich Menu列表
    const richMenuListResponse = await lineBot.client.getRichMenuList();
    const richMenus = richMenuListResponse.richmenus;
    console.log('📋 找到Rich Menu数量:', richMenus.length);
    
    if (richMenus.length === 0) {
      console.error('❌ 没有找到Rich Menu！');
      return;
    }
    
    // 为每个Rich Menu上传对应图片
    for (const menu of richMenus) {
      console.log(`\n🎯 处理Rich Menu: ${menu.name}`);
      console.log(`📍 ID: ${menu.richMenuId}`);
      
      try {
        // 根据名称确定图片类型
        let imageType;
        if (menu.name.includes('Main') || menu.name.includes('Standard')) {
          imageType = 'main';
        } else if (menu.name.includes('Processing')) {
          imageType = 'processing';
        } else {
          console.log('⚠️ 无法确定图片类型，跳过');
          continue;
        }
        
        console.log(`📷 上传${imageType}图片...`);
        await lineBot.uploadRichMenuImage(menu.richMenuId, imageType);
        console.log('✅ 图片上传成功！');
        
      } catch (uploadError) {
        console.error('❌ 图片上传失败:', uploadError.message);
        
        // 如果主图片失败，尝试备用图片
        if (imageType === 'main') {
          console.log('🔄 尝试备用图片...');
          try {
            const fs = require('fs');
            const path = require('path');
            
            // 尝试压缩版本
            const compressedPath = path.join(__dirname, '..', 'assets', 'richmenu-main-compressed.png');
            if (fs.existsSync(compressedPath)) {
              const stats = fs.statSync(compressedPath);
              console.log(`📊 压缩图片大小: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
              
              if (stats.size <= 1024 * 1024) {
                const imageBuffer = fs.readFileSync(compressedPath);
                await lineBot.client.setRichMenuImage(menu.richMenuId, imageBuffer, 'image/png');
                console.log('✅ 压缩图片上传成功！');
              } else {
                console.log('❌ 压缩图片仍然太大');
              }
            }
          } catch (backupError) {
            console.error('❌ 备用图片也失败:', backupError.message);
          }
        }
      }
    }
    
    // 验证上传结果
    console.log('\n🔍 验证上传结果...');
    for (const menu of richMenus) {
      try {
        const imageData = await lineBot.client.getRichMenuImage(menu.richMenuId);
        console.log(`✅ ${menu.name}: 图片存在 (${imageData.length} bytes)`);
      } catch (checkError) {
        console.log(`❌ ${menu.name}: 图片不存在`);
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
forceUploadImages(); 