const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function aggressiveRichMenuCompress() {
  console.log('🔥 激进压缩Rich Menu图片...');
  
  const assetsDir = path.join(__dirname, '../assets');
  const mainInput = path.join(assetsDir, 'richmenu-main.png');
  const mainOutput = path.join(assetsDir, 'richmenu-main-compressed.png');
  
  if (!fs.existsSync(mainInput)) {
    console.error('❌ 主图片不存在');
    return;
  }
  
  const originalStats = fs.statSync(mainInput);
  console.log(`📏 原图片大小: ${(originalStats.size / 1024).toFixed(2)} KB`);
  
  const maxSize = 1024 * 1024; // 1MB
  let bestResult = null;
  
  // 尝试不同的压缩策略
  const strategies = [
    { quality: 85, compressionLevel: 9, name: '高质量+最大压缩' },
    { quality: 80, compressionLevel: 9, name: '中高质量+最大压缩' },
    { quality: 75, compressionLevel: 9, name: '中等质量+最大压缩' },
    { quality: 70, compressionLevel: 9, name: '低质量+最大压缩' },
    { quality: 65, compressionLevel: 9, name: '更低质量+最大压缩' },
  ];
  
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    const tempOutput = path.join(assetsDir, `richmenu-main-temp-${i}.png`);
    
    try {
      console.log(`\n🧪 尝试策略: ${strategy.name}`);
      console.log(`   质量: ${strategy.quality}, 压缩级别: ${strategy.compressionLevel}`);
      
      await sharp(mainInput)
        .png({
          compressionLevel: strategy.compressionLevel,
          quality: strategy.quality,
          effort: 10,
          palette: false,
          progressive: false,
          adaptiveFiltering: true,  // 启用自适应过滤
          force: true
        })
        .toFile(tempOutput);
      
      const tempStats = fs.statSync(tempOutput);
      const sizeKB = tempStats.size / 1024;
      const sizeMB = sizeKB / 1024;
      
      console.log(`   📊 结果大小: ${sizeKB.toFixed(2)} KB (${sizeMB.toFixed(2)} MB)`);
      
      if (tempStats.size <= maxSize) {
        console.log(`   ✅ 符合大小要求！`);
        bestResult = {
          strategy: strategy,
          size: tempStats.size,
          path: tempOutput
        };
        break;
      } else {
        console.log(`   ❌ 仍然超过1MB`);
        fs.unlinkSync(tempOutput);
      }
      
    } catch (error) {
      console.log(`   ❌ 策略失败: ${error.message}`);
      if (fs.existsSync(tempOutput)) {
        fs.unlinkSync(tempOutput);
      }
    }
  }
  
  if (bestResult) {
    // 使用最佳结果
    fs.renameSync(bestResult.path, mainOutput);
    
    // 验证最终文件
    const finalMetadata = await sharp(mainOutput).metadata();
    
    console.log(`\n🎉 主图片激进压缩成功！`);
    console.log(`✅ 使用策略: ${bestResult.strategy.name}`);
    console.log(`📊 最终大小: ${(bestResult.size / 1024).toFixed(2)} KB`);
    console.log(`📏 尺寸: ${finalMetadata.width}×${finalMetadata.height}`);
    console.log(`🎨 格式: ${finalMetadata.format}`);
    console.log(`🌈 通道数: ${finalMetadata.channels}`);
    
    // 验证文件类型
    const { exec } = require('child_process');
    exec(`file "${mainOutput}"`, (error, stdout) => {
      if (!error) {
        console.log(`📄 文件类型: ${stdout.trim()}`);
      }
    });
    
  } else {
    console.error('\n❌ 所有压缩策略都无法将图片压缩到1MB以下');
    console.log('💡 建议：');
    console.log('1. 检查原图片是否过于复杂');
    console.log('2. 考虑重新设计图片以减少细节');
    console.log('3. 或者使用JPEG格式（但LINE可能不支持）');
    
    // 创建一个极限压缩版本供参考
    try {
      await sharp(mainInput)
        .png({
          compressionLevel: 9,
          quality: 50,  // 极低质量
          effort: 10,
          palette: false,
          force: true
        })
        .toFile(mainOutput);
      
      const extremeStats = fs.statSync(mainOutput);
      console.log(`\n🔥 极限压缩结果: ${(extremeStats.size / 1024).toFixed(2)} KB`);
      
      if (extremeStats.size > maxSize) {
        console.log(`   仍然超过1MB: ${(extremeStats.size / 1024 / 1024).toFixed(2)} MB`);
      }
      
    } catch (error) {
      console.error('❌ 极限压缩也失败了:', error.message);
    }
  }
  
  console.log('\n📋 生成的文件:');
  console.log(`- ${path.basename(mainOutput)}`);
}

async function testCompressedImages() {
  console.log('🧪 测试压缩后的图片...');
  
  const assetsDir = path.join(__dirname, '../assets');
  const compressedMain = path.join(assetsDir, 'richmenu-main-compressed.png');
  const optimizedProcessing = path.join(assetsDir, 'richmenu-processing-optimized.png');
  
  const images = [
    { name: 'main (compressed)', path: compressedMain },
    { name: 'processing (optimized)', path: optimizedProcessing }
  ];
  
  for (const image of images) {
    if (fs.existsSync(image.path)) {
      try {
        const stats = fs.statSync(image.path);
        const metadata = await sharp(image.path).metadata();
        
        console.log(`\n📋 ${image.name}:`);
        console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   尺寸: ${metadata.width}×${metadata.height}`);
        console.log(`   格式: ${metadata.format}`);
        console.log(`   通道数: ${metadata.channels}`);
        console.log(`   大小检查: ${stats.size <= 1024 * 1024 ? '✅ < 1MB' : '❌ > 1MB'}`);
        
      } catch (error) {
        console.error(`❌ 检查 ${image.name} 失败:`, error.message);
      }
    } else {
      console.log(`\n📋 ${image.name}: ❌ 文件不存在`);
    }
  }
}

async function replaceWithCompressedImages() {
  console.log('🔄 替换为压缩后的图片...');
  
  const assetsDir = path.join(__dirname, '../assets');
  
  const replacements = [
    {
      compressed: path.join(assetsDir, 'richmenu-main-compressed.png'),
      original: path.join(assetsDir, 'richmenu-main.png'),
      backup: path.join(assetsDir, 'richmenu-main-original.png')
    },
    {
      compressed: path.join(assetsDir, 'richmenu-processing-optimized.png'),
      original: path.join(assetsDir, 'richmenu-processing.png'),
      backup: path.join(assetsDir, 'richmenu-processing-original.png')
    }
  ];
  
  for (const replacement of replacements) {
    try {
      if (!fs.existsSync(replacement.compressed)) {
        console.log(`⚠️ 压缩后的图片不存在: ${path.basename(replacement.compressed)}`);
        continue;
      }
      
      // 备份原图片
      if (fs.existsSync(replacement.original)) {
        fs.copyFileSync(replacement.original, replacement.backup);
        console.log(`💾 已备份: ${path.basename(replacement.backup)}`);
      }
      
      // 替换为压缩后的图片
      fs.copyFileSync(replacement.compressed, replacement.original);
      console.log(`✅ 已替换: ${path.basename(replacement.original)}`);
      
      // 验证
      const stats = fs.statSync(replacement.original);
      console.log(`   新大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
    } catch (error) {
      console.error(`❌ 替换失败:`, error.message);
    }
  }
  
  console.log('\n🎉 所有图片已替换！');
  console.log('📱 现在可以测试Rich Menu上传了');
}

if (require.main === module) {
  if (process.argv.includes('--test')) {
    testCompressedImages();
  } else if (process.argv.includes('--replace')) {
    replaceWithCompressedImages();
  } else {
    aggressiveRichMenuCompress();
  }
}

module.exports = { 
  aggressiveRichMenuCompress, 
  testCompressedImages, 
  replaceWithCompressedImages 
}; 