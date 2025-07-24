const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function fixRichMenuImageFormat() {
  console.log('🎨 修复Rich Menu图片格式为24-bit RGB...');
  
  const assetsDir = path.join(__dirname, '../assets');
  
  const images = [
    { 
      name: 'main', 
      input: path.join(assetsDir, 'richmenu-main.png'),
      output: path.join(assetsDir, 'richmenu-main-fixed.png'),
      expectedSize: { width: 2500, height: 1686 }
    },
    { 
      name: 'processing', 
      input: path.join(assetsDir, 'richmenu-processing.png'),
      output: path.join(assetsDir, 'richmenu-processing-fixed.png'),
      expectedSize: { width: 2500, height: 843 }
    }
  ];

  for (const image of images) {
    try {
      console.log(`\n🔄 处理 ${image.name} 图片...`);
      
      // 检查原图片
      if (!fs.existsSync(image.input)) {
        throw new Error(`原图片不存在: ${image.input}`);
      }
      
      // 获取原图片信息
      const originalStats = fs.statSync(image.input);
      console.log(`📏 原图片大小: ${(originalStats.size / 1024).toFixed(2)} KB`);
      
      // 获取图片元数据
      const metadata = await sharp(image.input).metadata();
      console.log(`📊 原图片信息:`);
      console.log(`   尺寸: ${metadata.width}×${metadata.height}`);
      console.log(`   格式: ${metadata.format}`);
      console.log(`   颜色空间: ${metadata.space || 'unknown'}`);
      console.log(`   通道数: ${metadata.channels}`);
      console.log(`   位深度: ${metadata.depth}-bit`);
      console.log(`   是否有alpha: ${metadata.hasAlpha}`);
      
      // 验证尺寸
      if (metadata.width !== image.expectedSize.width || metadata.height !== image.expectedSize.height) {
        throw new Error(`图片尺寸不正确: ${metadata.width}×${metadata.height}, 期望: ${image.expectedSize.width}×${image.expectedSize.height}`);
      }
      
      console.log('🎯 转换为24-bit RGB格式...');
      
      // 转换图片格式
      await sharp(image.input)
        .png({
          compressionLevel: 6,        // 中等压缩
          quality: 100,              // 最高质量
          force: true                // 强制PNG格式
        })
        .ensureAlpha()               // 确保有alpha通道
        .raw()                       // 转为raw格式进行处理
        .toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => {
          console.log(`📊 处理后信息:`);
          console.log(`   尺寸: ${info.width}×${info.height}`);
          console.log(`   通道数: ${info.channels}`);
          
          // 重新保存为标准PNG
          return sharp(data, {
            raw: {
              width: info.width,
              height: info.height,
              channels: info.channels
            }
          })
          .png({
            compressionLevel: 6,
            quality: 100,
            palette: false            // 禁用调色板，强制RGB
          })
          .toFile(image.output);
        });
      
      // 检查转换后的文件
      const convertedStats = fs.statSync(image.output);
      const convertedMetadata = await sharp(image.output).metadata();
      
      console.log(`✅ ${image.name} 图片转换成功:`);
      console.log(`   文件大小: ${(convertedStats.size / 1024).toFixed(2)} KB`);
      console.log(`   尺寸: ${convertedMetadata.width}×${convertedMetadata.height}`);
      console.log(`   格式: ${convertedMetadata.format}`);
      console.log(`   颜色空间: ${convertedMetadata.space || 'unknown'}`);
      console.log(`   通道数: ${convertedMetadata.channels}`);
      console.log(`   位深度: ${convertedMetadata.depth}-bit`);
      
      // 验证是否符合LINE要求
      if (convertedStats.size > 1024 * 1024) {
        console.warn(`⚠️ 文件大小超过1MB: ${(convertedStats.size / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log(`✅ 文件大小符合要求: < 1MB`);
      }
      
    } catch (error) {
      console.error(`❌ 处理 ${image.name} 图片失败:`, error.message);
    }
  }
  
  console.log('\n🎉 图片格式修复完成！');
  console.log('');
  console.log('📋 生成的文件:');
  console.log('- richmenu-main-fixed.png (修复后的主菜单图片)');
  console.log('- richmenu-processing-fixed.png (修复后的处理中图片)');
  console.log('');
  console.log('💡 下一步操作:');
  console.log('1. 检查修复后的图片是否正确');
  console.log('2. 运行替换命令: node scripts/fix-richmenu-image-format.js --replace');
  console.log('3. 重新测试上传: node scripts/test-atomic-richmenu.js');
}

async function replaceWithFixedImages() {
  console.log('🔄 替换为修复后的图片...');
  
  const assetsDir = path.join(__dirname, '../assets');
  
  const replacements = [
    {
      fixed: path.join(assetsDir, 'richmenu-main-fixed.png'),
      original: path.join(assetsDir, 'richmenu-main.png'),
      backup: path.join(assetsDir, 'richmenu-main-original.png')
    },
    {
      fixed: path.join(assetsDir, 'richmenu-processing-fixed.png'),
      original: path.join(assetsDir, 'richmenu-processing.png'),
      backup: path.join(assetsDir, 'richmenu-processing-original.png')
    }
  ];
  
  for (const replacement of replacements) {
    try {
      if (!fs.existsSync(replacement.fixed)) {
        console.log(`⚠️ 修复后的图片不存在: ${replacement.fixed}`);
        continue;
      }
      
      // 备份原图片
      if (fs.existsSync(replacement.original)) {
        fs.copyFileSync(replacement.original, replacement.backup);
        console.log(`💾 已备份原图片: ${path.basename(replacement.backup)}`);
      }
      
      // 替换为修复后的图片
      fs.copyFileSync(replacement.fixed, replacement.original);
      console.log(`✅ 已替换图片: ${path.basename(replacement.original)}`);
      
    } catch (error) {
      console.error(`❌ 替换图片失败:`, error.message);
    }
  }
  
  console.log('\n🎉 图片替换完成！');
  console.log('📱 现在可以重新测试Rich Menu图片上传');
}

// 分析图片格式问题
async function analyzeImageFormat() {
  console.log('🔍 分析Rich Menu图片格式问题...');
  
  const assetsDir = path.join(__dirname, '../assets');
  const images = [
    { name: 'main', path: path.join(assetsDir, 'richmenu-main.png') },
    { name: 'processing', path: path.join(assetsDir, 'richmenu-processing.png') }
  ];
  
  console.log('\n📊 LINE Rich Menu图片要求:');
  console.log('- 格式: PNG');
  console.log('- 颜色模式: RGB (24-bit)');
  console.log('- 大小: < 1MB');
  console.log('- 主菜单尺寸: 2500×1686');
  console.log('- 处理中菜单尺寸: 2500×843');
  
  for (const image of images) {
    if (fs.existsSync(image.path)) {
      console.log(`\n📋 ${image.name} 图片分析:`);
      
      try {
        const metadata = await sharp(image.path).metadata();
        const stats = fs.statSync(image.path);
        
        console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   尺寸: ${metadata.width}×${metadata.height}`);
        console.log(`   格式: ${metadata.format}`);
        console.log(`   颜色空间: ${metadata.space || 'unknown'}`);
        console.log(`   通道数: ${metadata.channels}`);
        console.log(`   位深度: ${metadata.depth}-bit`);
        console.log(`   是否有alpha: ${metadata.hasAlpha}`);
        
        // 检查问题
        const issues = [];
        
        if (metadata.space !== 'srgb') {
          issues.push(`颜色空间不是sRGB: ${metadata.space}`);
        }
        
        if (metadata.depth === 8 && metadata.format === 'png' && metadata.channels < 3) {
          issues.push('可能是8-bit调色板格式，需要转换为24-bit RGB');
        }
        
        if (stats.size > 1024 * 1024) {
          issues.push('文件大小超过1MB限制');
        }
        
        if (issues.length > 0) {
          console.log(`   ❌ 发现问题:`);
          issues.forEach(issue => console.log(`     - ${issue}`));
        } else {
          console.log(`   ✅ 格式符合要求`);
        }
        
      } catch (error) {
        console.error(`   ❌ 分析失败: ${error.message}`);
      }
    } else {
      console.log(`\n📋 ${image.name} 图片: ❌ 文件不存在`);
    }
  }
  
  console.log('\n💡 建议解决方案:');
  console.log('1. 运行格式修复: node scripts/fix-richmenu-image-format.js');
  console.log('2. 检查修复后的图片');
  console.log('3. 替换原图片: node scripts/fix-richmenu-image-format.js --replace');
  console.log('4. 重新测试上传');
}

if (require.main === module) {
  if (process.argv.includes('--replace')) {
    replaceWithFixedImages();
  } else if (process.argv.includes('--analyze')) {
    analyzeImageFormat();
  } else {
    fixRichMenuImageFormat();
  }
}

module.exports = { fixRichMenuImageFormat, replaceWithFixedImages, analyzeImageFormat }; 