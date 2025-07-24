const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizeRichMenuImages() {
  console.log('🎨 优化Rich Menu图片大小（保持原尺寸）...');
  
  try {
    const assetsDir = path.join(__dirname, '../assets');
    
    // 优化主菜单图片
    console.log('\n🔄 优化主菜单图片...');
    const mainOriginal = path.join(assetsDir, 'richmenu-main.png');
    
    if (fs.existsSync(mainOriginal)) {
      const originalStats = fs.statSync(mainOriginal);
      console.log(`原始大小: ${(originalStats.size / 1024).toFixed(2)} KB`);
      
      // 尝试不同的压缩级别，直到文件大小 < 1MB
      let compressionLevel = 6; // 中等压缩
      let optimizedPath = '';
      
      while (compressionLevel <= 9) {
        optimizedPath = path.join(assetsDir, `richmenu-main-optimized-${compressionLevel}.png`);
        
        await sharp(mainOriginal)
          .png({ 
            compressionLevel: compressionLevel,
            quality: 90, // 保持高质量
            effort: 10 // 最大压缩努力
          })
          .toFile(optimizedPath);
        
        const optimizedStats = fs.statSync(optimizedPath);
        const optimizedSizeKB = optimizedStats.size / 1024;
        
        console.log(`压缩级别 ${compressionLevel}: ${optimizedSizeKB.toFixed(2)} KB`);
        
        if (optimizedSizeKB < 1024) { // < 1MB
          console.log(`✅ 主菜单优化成功: ${optimizedSizeKB.toFixed(2)} KB`);
          // 替换原文件
          fs.copyFileSync(optimizedPath, mainOriginal);
          fs.unlinkSync(optimizedPath); // 删除临时文件
          break;
        }
        
        compressionLevel++;
        if (fs.existsSync(optimizedPath)) {
          fs.unlinkSync(optimizedPath); // 删除不合格的文件
        }
      }
      
      if (compressionLevel > 9) {
        console.log('⚠️ 无法将主菜单图片压缩到1MB以下，使用最高压缩级别');
        // 使用最高压缩级别
        await sharp(mainOriginal)
          .png({ 
            compressionLevel: 9,
            quality: 80, // 降低质量以减少大小
            effort: 10
          })
          .toFile(optimizedPath);
        fs.copyFileSync(optimizedPath, mainOriginal);
        fs.unlinkSync(optimizedPath);
      }
    }
    
    // 优化处理中菜单图片
    console.log('\n🔄 优化处理中菜单图片...');
    const processingOriginal = path.join(assetsDir, 'richmenu-processing.png');
    
    if (fs.existsSync(processingOriginal)) {
      const originalStats = fs.statSync(processingOriginal);
      console.log(`原始大小: ${(originalStats.size / 1024).toFixed(2)} KB`);
      
      // 尝试不同的压缩级别
      let compressionLevel = 6;
      let optimizedPath = '';
      
      while (compressionLevel <= 9) {
        optimizedPath = path.join(assetsDir, `richmenu-processing-optimized-${compressionLevel}.png`);
        
        await sharp(processingOriginal)
          .png({ 
            compressionLevel: compressionLevel,
            quality: 90,
            effort: 10
          })
          .toFile(optimizedPath);
        
        const optimizedStats = fs.statSync(optimizedPath);
        const optimizedSizeKB = optimizedStats.size / 1024;
        
        console.log(`压缩级别 ${compressionLevel}: ${optimizedSizeKB.toFixed(2)} KB`);
        
        if (optimizedSizeKB < 1024) { // < 1MB
          console.log(`✅ 处理中菜单优化成功: ${optimizedSizeKB.toFixed(2)} KB`);
          // 替换原文件
          fs.copyFileSync(optimizedPath, processingOriginal);
          fs.unlinkSync(optimizedPath);
          break;
        }
        
        compressionLevel++;
        if (fs.existsSync(optimizedPath)) {
          fs.unlinkSync(optimizedPath);
        }
      }
      
      if (compressionLevel > 9) {
        console.log('⚠️ 无法将处理中图片压缩到1MB以下，使用最高压缩级别');
        await sharp(processingOriginal)
          .png({ 
            compressionLevel: 9,
            quality: 80,
            effort: 10
          })
          .toFile(optimizedPath);
        fs.copyFileSync(optimizedPath, processingOriginal);
        fs.unlinkSync(optimizedPath);
      }
    }
    
    // 显示最终结果
    console.log('\n📊 优化结果:');
    if (fs.existsSync(mainOriginal)) {
      const finalMainStats = fs.statSync(mainOriginal);
      const mainSizeKB = finalMainStats.size / 1024;
      console.log(`主菜单: ${mainSizeKB.toFixed(2)} KB ${mainSizeKB < 1024 ? '✅' : '❌'}`);
    }
    
    if (fs.existsSync(processingOriginal)) {
      const finalProcessingStats = fs.statSync(processingOriginal);
      const processingSizeKB = finalProcessingStats.size / 1024;
      console.log(`处理中: ${processingSizeKB.toFixed(2)} KB ${processingSizeKB < 1024 ? '✅' : '❌'}`);
    }
    
    console.log('\n🎉 图片优化完成！');
    console.log('💡 下一步: 重新上传优化后的图片');
    console.log('   node scripts/upload-original-richmenu-images.js');
    
  } catch (error) {
    console.error('❌ 优化图片失败:', error);
  }
}

// 分析图片并提供优化建议
async function analyzeImages() {
  console.log('🔍 分析Rich Menu图片...');
  
  const assetsDir = path.join(__dirname, '../assets');
  const mainPath = path.join(assetsDir, 'richmenu-main.png');
  const processingPath = path.join(assetsDir, 'richmenu-processing.png');
  
  const images = [
    { name: '主菜单', path: mainPath },
    { name: '处理中菜单', path: processingPath }
  ];
  
  for (const img of images) {
    if (fs.existsSync(img.path)) {
      console.log(`\n📋 ${img.name}:`);
      
      const stats = fs.statSync(img.path);
      const sizeKB = stats.size / 1024;
      const sizeMB = sizeKB / 1024;
      
      console.log(`   文件大小: ${sizeKB.toFixed(2)} KB (${sizeMB.toFixed(2)} MB)`);
      console.log(`   大小状态: ${sizeKB < 1024 ? '✅ 符合要求' : '❌ 超过1MB限制'}`);
      
      // 获取图片元数据
      try {
        const metadata = await sharp(img.path).metadata();
        console.log(`   尺寸: ${metadata.width}×${metadata.height}`);
        console.log(`   格式: ${metadata.format}`);
        console.log(`   颜色通道: ${metadata.channels}`);
        console.log(`   色彩空间: ${metadata.space || 'unknown'}`);
        
        // 尺寸检查
        const expectedSizes = {
          '主菜单': { width: 2500, height: 1686 },
          '处理中菜单': { width: 2500, height: 843 }
        };
        
        const expected = expectedSizes[img.name];
        if (expected) {
          const sizeMatch = metadata.width === expected.width && metadata.height === expected.height;
          console.log(`   尺寸状态: ${sizeMatch ? '✅ 正确' : '❌ 不匹配'}`);
          if (!sizeMatch) {
            console.log(`   期望尺寸: ${expected.width}×${expected.height}`);
          }
        }
        
      } catch (metaError) {
        console.log(`   ❌ 无法读取图片元数据: ${metaError.message}`);
      }
    } else {
      console.log(`\n📋 ${img.name}: ❌ 文件不存在`);
    }
  }
  
  console.log('\n💡 优化建议:');
  console.log('1. 如果文件过大，使用图片优化功能');
  console.log('2. 如果尺寸不正确，使用尺寸调整功能');
  console.log('3. 确保使用PNG格式以保持透明度');
  console.log('4. 避免不必要的颜色深度和元数据');
}

// 显示帮助信息
function showHelp() {
  console.log(`
🎨 Rich Menu图片优化工具

功能：
- 在保持原尺寸的前提下减少文件大小
- 自动尝试不同压缩级别找到最佳平衡
- 确保文件大小 < 1MB 符合LINE要求
- 保持图片质量尽可能高

使用方法：
  node scripts/optimize-richmenu-images.js           # 优化图片大小
  node scripts/optimize-richmenu-images.js --analyze # 分析当前图片

优化策略：
1. 使用PNG压缩（保持无损质量）
2. 调整压缩级别（6-9）
3. 在文件大小和质量间平衡
4. 保持原始尺寸不变

注意事项：
⚠️ 会直接修改原文件
💾 建议先备份重要图片
🎯 目标是 < 1MB 且质量尽可能高

LINE要求：
- 主菜单: 2500×1686，< 1MB
- 处理中: 2500×843，< 1MB
- 格式: PNG
- 质量: 高清晰度
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else if (process.argv.includes('--analyze')) {
    analyzeImages();
  } else {
    optimizeRichMenuImages();
  }
}

module.exports = { optimizeRichMenuImages, analyzeImages }; 