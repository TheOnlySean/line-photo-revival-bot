const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function resizeRichMenuImages() {
  try {
    console.log('🖼️ 開始調整 Rich Menu 圖片尺寸...');
    
    const assetsDir = path.join(__dirname, '..', 'assets');
    const mainPath = path.join(assetsDir, 'main.jpg');
    const processingPath = path.join(assetsDir, 'processing.jpg');
    
    // 檢查文件是否存在
    if (!fs.existsSync(mainPath)) {
      throw new Error('main.jpg 不存在');
    }
    if (!fs.existsSync(processingPath)) {
      throw new Error('processing.jpg 不存在');
    }
    
    // 調整 main.jpg 到 2500x1686 (完整高度)
    console.log('📏 調整 main.jpg 到 2500x1686...');
    await sharp(mainPath)
      .resize(2500, 1686, {
        fit: 'fill',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 90 })
      .toFile(path.join(assetsDir, 'richmenu-main-resized.jpg'));
    
    // 檢查 processing.jpg 尺寸 (應該已經是 2500x843)
    const processingInfo = await sharp(processingPath).metadata();
    console.log(`📏 processing.jpg 當前尺寸: ${processingInfo.width}x${processingInfo.height}`);
    
    if (processingInfo.width === 2500 && processingInfo.height === 843) {
      console.log('✅ processing.jpg 尺寸正確，複製為最終版本');
      fs.copyFileSync(processingPath, path.join(assetsDir, 'richmenu-processing-resized.jpg'));
    } else {
      console.log('📏 調整 processing.jpg 到 2500x843...');
      await sharp(processingPath)
        .resize(2500, 843, {
          fit: 'fill',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .jpeg({ quality: 90 })
        .toFile(path.join(assetsDir, 'richmenu-processing-resized.jpg'));
    }
    
    console.log('✅ 圖片調整完成！');
    console.log('📁 生成的文件:');
    console.log('  - richmenu-main-resized.jpg (2500x1686)');
    console.log('  - richmenu-processing-resized.jpg (2500x843)');
    
  } catch (error) {
    console.error('❌ 調整圖片失敗:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  resizeRichMenuImages();
}

module.exports = { resizeRichMenuImages }; 