const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function resizeRichMenuImages() {
  console.log('🖼️ 调整Rich Menu图片到标准尺寸...');
  
  try {
    const assetsDir = path.join(__dirname, '../assets');
    
    // 备份原始图片
    console.log('💾 备份原始图片...');
    const mainOriginal = path.join(assetsDir, 'richmenu-main.png');
    const processingOriginal = path.join(assetsDir, 'richmenu-processing.png');
    const mainBackup = path.join(assetsDir, 'richmenu-main-backup.png');
    const processingBackup = path.join(assetsDir, 'richmenu-processing-backup.png');
    
    if (fs.existsSync(mainOriginal)) {
      fs.copyFileSync(mainOriginal, mainBackup);
      console.log('✅ 主菜单图片已备份');
    }
    
    if (fs.existsSync(processingOriginal)) {
      fs.copyFileSync(processingOriginal, processingBackup);
      console.log('✅ 处理中图片已备份');
    }
    
    // 调整主菜单图片到2500x1686
    console.log('\n🔄 调整主菜单图片尺寸...');
    if (fs.existsSync(mainOriginal)) {
      await sharp(mainOriginal)
        .resize(2500, 1686, {
          fit: 'fill', // 强制填充到目标尺寸
          background: { r: 255, g: 255, b: 255, alpha: 1 } // 白色背景
        })
        .png({ 
          quality: 100, // 最高质量
          compressionLevel: 0 // 无压缩
        })
        .toFile(path.join(assetsDir, 'richmenu-main-resized.png'));
      
      console.log('✅ 主菜单图片已调整到 2500×1686');
    }
    
    // 调整处理中菜单图片到2500x843
    console.log('\n🔄 调整处理中菜单图片尺寸...');
    if (fs.existsSync(processingOriginal)) {
      await sharp(processingOriginal)
        .resize(2500, 843, {
          fit: 'fill', // 强制填充到目标尺寸
          background: { r: 255, g: 255, b: 255, alpha: 1 } // 白色背景
        })
        .png({ 
          quality: 100, // 最高质量
          compressionLevel: 0 // 无压缩
        })
        .toFile(path.join(assetsDir, 'richmenu-processing-resized.png'));
      
      console.log('✅ 处理中图片已调整到 2500×843');
    }
    
    // 询问是否要替换原文件
    console.log('\n📋 调整完成！生成的文件:');
    console.log('- richmenu-main-resized.png (2500×1686)');
    console.log('- richmenu-processing-resized.png (2500×843)');
    console.log('- richmenu-main-backup.png (原始文件备份)');
    console.log('- richmenu-processing-backup.png (原始文件备份)');
    
    console.log('\n💡 下一步操作:');
    console.log('1. 检查调整后的图片质量');
    console.log('2. 如果满意，运行替换命令:');
    console.log('   node scripts/resize-richmenu-images.js --replace');
    console.log('3. 然后重新上传:');
    console.log('   node scripts/upload-original-richmenu-images.js');
    
  } catch (error) {
    console.error('❌ 调整图片尺寸失败:', error);
  }
}

async function replaceWithResized() {
  console.log('🔄 替换为调整后的图片...');
  
  try {
    const assetsDir = path.join(__dirname, '../assets');
    
    // 替换主菜单图片
    const mainResized = path.join(assetsDir, 'richmenu-main-resized.png');
    const mainOriginal = path.join(assetsDir, 'richmenu-main.png');
    
    if (fs.existsSync(mainResized)) {
      fs.copyFileSync(mainResized, mainOriginal);
      console.log('✅ 主菜单图片已替换');
    }
    
    // 替换处理中图片
    const processingResized = path.join(assetsDir, 'richmenu-processing-resized.png');
    const processingOriginal = path.join(assetsDir, 'richmenu-processing.png');
    
    if (fs.existsSync(processingResized)) {
      fs.copyFileSync(processingResized, processingOriginal);
      console.log('✅ 处理中图片已替换');
    }
    
    console.log('\n🎉 图片替换完成！');
    console.log('📱 现在可以重新上传Rich Menu图片:');
    console.log('   node scripts/upload-original-richmenu-images.js');
    
  } catch (error) {
    console.error('❌ 替换图片失败:', error);
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
🔄 Rich Menu图片尺寸调整工具

功能：
- 将现有图片调整到LINE标准尺寸
- 保持图片质量，使用无损放大
- 自动备份原始文件

使用方法：
  node scripts/resize-richmenu-images.js           # 调整图片尺寸
  node scripts/resize-richmenu-images.js --replace # 替换原始文件

调整规格：
- 主菜单: 调整到 2500×1686 像素
- 处理中菜单: 调整到 2500×843 像素
- 格式: PNG无损
- 质量: 100%（无压缩）

注意事项：
⚠️ 从小尺寸放大到大尺寸可能导致图片模糊
💡 建议使用原始高分辨率设计文件重新制作
🔧 这个工具只是临时解决方案

最佳实践：
1. 使用设计软件按标准尺寸重新设计
2. 确保文字和图标清晰可见
3. 测试不同设备上的显示效果
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else if (process.argv.includes('--replace')) {
    replaceWithResized();
  } else {
    resizeRichMenuImages();
  }
}

module.exports = { resizeRichMenuImages, replaceWithResized }; 