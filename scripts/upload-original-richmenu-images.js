const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function uploadOriginalImages() {
  console.log('🖼️ 开始上传原尺寸Rich Menu图片（无压缩）...');
  
  try {
    // 获取所有Rich Menu
    const richMenuList = await client.getRichMenuList();
    console.log(`📋 找到 ${richMenuList.length} 个Rich Menu`);
    
    // 检查图片文件信息
    const mainImagePath = path.join(__dirname, '../assets/richmenu-main.png');
    const processingImagePath = path.join(__dirname, '../assets/richmenu-processing.png');
    
    // 显示当前图片信息
    console.log('\n📏 当前图片信息:');
    if (fs.existsSync(mainImagePath)) {
      const mainStats = fs.statSync(mainImagePath);
      console.log(`主菜单图片: ${(mainStats.size / 1024).toFixed(2)} KB`);
    }
    
    if (fs.existsSync(processingImagePath)) {
      const processingStats = fs.statSync(processingImagePath);
      console.log(`处理中图片: ${(processingStats.size / 1024).toFixed(2)} KB`);
    }
    
    console.log('\n📐 LINE Rich Menu标准尺寸要求:');
    console.log('- 主菜单: 2500 x 1686 像素');
    console.log('- 处理中菜单: 2500 x 843 像素');
    console.log('- 格式: PNG');
    console.log('- 大小: < 1MB');
    
    for (const menu of richMenuList) {
      console.log(`\n🎯 处理Rich Menu: ${menu.name}`);
      console.log(`   ID: ${menu.richMenuId}`);
      
      let imagePath = '';
      let expectedSize = '';
      
      // 根据菜单名称确定对应的图片文件
      if (menu.name.includes('Main') || menu.name.includes('主要') || menu.name.includes('メイン')) {
        imagePath = mainImagePath;
        expectedSize = '2500 x 1686';
        console.log('🖼️ 使用主菜单图片: richmenu-main.png');
      } else if (menu.name.includes('Processing') || menu.name.includes('生成中') || menu.name.includes('処理中')) {
        imagePath = processingImagePath;
        expectedSize = '2500 x 843';
        console.log('🖼️ 使用处理中菜单图片: richmenu-processing.png');
      } else {
        console.log('⚠️ 无法确定图片类型，跳过');
        continue;
      }
      
      // 检查图片文件是否存在
      if (!fs.existsSync(imagePath)) {
        console.error(`❌ 图片文件不存在: ${imagePath}`);
        continue;
      }
      
      // 获取图片信息
      const stats = fs.statSync(imagePath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      console.log(`📏 图片大小: ${fileSizeKB} KB (${fileSizeMB} MB)`);
      console.log(`📐 期望尺寸: ${expectedSize}`);
      
      // 检查文件大小限制
      if (stats.size > 1024 * 1024) { // 1MB
        console.warn(`⚠️ 图片大小超过1MB限制: ${fileSizeMB} MB`);
        console.log('💡 建议: 可能需要优化图片大小，但保持尺寸不变');
      }
      
      try {
        // 读取原始图片数据（不进行任何处理）
        console.log('📤 正在上传原尺寸图片（无压缩处理）...');
        const imageBuffer = fs.readFileSync(imagePath);
        
        console.log(`📊 上传数据大小: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
        console.log('🔄 保持原始图片质量和尺寸...');
        
        // 直接上传原始图片数据
        await client.setRichMenuImage(menu.richMenuId, imageBuffer, 'image/png');
        console.log('✅ 原尺寸图片上传成功！');
        
        // 稍等一下确保上传完成
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (uploadError) {
        console.error(`❌ 图片上传失败: ${uploadError.message}`);
        
        if (uploadError.response) {
          console.error(`📊 API错误状态: ${uploadError.response.status}`);
          if (uploadError.response.data) {
            console.error(`📋 API错误详情:`, uploadError.response.data);
          }
        }
        
        // 如果是400错误，可能是尺寸问题
        if (uploadError.response && uploadError.response.status === 400) {
          console.log('💡 可能的问题:');
          console.log('- 图片尺寸不符合LINE要求');
          console.log('- 图片格式不正确');
          console.log('- 图片文件损坏');
          console.log('- Rich Menu已有图片，无法重复上传');
        }
      }
    }
    
    console.log('\n🎉 原尺寸图片上传完成！');
    console.log('');
    console.log('📱 请在LINE中验证：');
    console.log('1. 主菜单图片是否显示清晰（无压缩）');
    console.log('2. 处理中菜单图片是否显示清晰（无压缩）');
    console.log('3. 图片细节是否保持原始质量');
    console.log('4. 点击区域是否准确响应');
    console.log('');
    console.log('💡 如果图片仍然模糊，可能需要：');
    console.log('- 确保原始图片符合LINE标准尺寸');
    console.log('- 检查图片是否在保存时被压缩');
    console.log('- 使用无损PNG格式');
    
  } catch (error) {
    console.error('❌ 上传原尺寸图片失败:', error.message);
    
    if (error.response) {
      console.error('📊 API错误状态:', error.response.status);
      console.error('📋 API错误详情:', error.response.data);
    }
  }
}

// 检查图片尺寸和质量
async function checkImageQuality() {
  console.log('🔍 检查图片质量和尺寸...');
  
  const mainImagePath = path.join(__dirname, '../assets/richmenu-main.png');
  const processingImagePath = path.join(__dirname, '../assets/richmenu-processing.png');
  
  const images = [
    { name: '主菜单', path: mainImagePath, expectedSize: '2500x1686' },
    { name: '处理中菜单', path: processingImagePath, expectedSize: '2500x843' }
  ];
  
  for (const img of images) {
    console.log(`\n📋 ${img.name}图片:`);
    console.log(`   文件路径: ${img.path}`);
    console.log(`   期望尺寸: ${img.expectedSize}`);
    
    if (fs.existsSync(img.path)) {
      const stats = fs.statSync(img.path);
      console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   ✅ 文件存在`);
      
      // 可以使用外部工具检查实际尺寸
      console.log('   💡 建议使用图片查看器确认实际尺寸');
    } else {
      console.log(`   ❌ 文件不存在`);
    }
  }
  
  console.log('\n📐 LINE Rich Menu图片要求:');
  console.log('- 主菜单: 宽2500px × 高1686px');
  console.log('- 处理中菜单: 宽2500px × 高843px');
  console.log('- 格式: PNG（推荐无损压缩）');
  console.log('- 文件大小: < 1MB');
  console.log('- 颜色深度: 建议24位真彩色');
}

// 显示帮助信息
function showHelp() {
  console.log(`
🖼️ 原尺寸Rich Menu图片上传工具

功能：
- 上传无压缩的原尺寸Rich Menu图片
- 保持图片原始质量和细节
- 检查图片尺寸和文件大小
- 确保符合LINE API要求

使用方法：
  node scripts/upload-original-richmenu-images.js        # 上传原尺寸图片
  node scripts/upload-original-richmenu-images.js --check # 只检查图片质量

重要说明：
⚠️ 图片尺寸要求（不可压缩）：
- 主菜单: 2500 x 1686 像素
- 处理中菜单: 2500 x 843 像素

💡 获得最佳效果：
- 使用PNG格式（无损）
- 避免JPEG格式（有损压缩）
- 确保图片为RGB模式
- 文件大小控制在1MB以内

🎨 设计建议：
- 使用高质量的原始设计文件
- 导出时选择"无压缩"或"最高质量"
- 避免在编辑软件中降低分辨率
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else if (process.argv.includes('--check')) {
    checkImageQuality();
  } else {
    uploadOriginalImages();
  }
}

module.exports = { uploadOriginalImages, checkImageQuality }; 