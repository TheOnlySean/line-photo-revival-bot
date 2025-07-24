const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizeRichMenuFormat() {
  console.log('🎨 优化Rich Menu图片格式和大小...');
  
  const assetsDir = path.join(__dirname, '../assets');
  
  const images = [
    { 
      name: 'main', 
      input: path.join(assetsDir, 'richmenu-main.png'),
      output: path.join(assetsDir, 'richmenu-main-optimized.png'),
      expectedSize: { width: 2500, height: 1686 }
    },
    { 
      name: 'processing', 
      input: path.join(assetsDir, 'richmenu-processing.png'),
      output: path.join(assetsDir, 'richmenu-processing-optimized.png'),
      expectedSize: { width: 2500, height: 843 }
    }
  ];

  for (const image of images) {
    try {
      console.log(`\n🔄 优化 ${image.name} 图片...`);
      
      // 检查原图片
      if (!fs.existsSync(image.input)) {
        throw new Error(`原图片不存在: ${image.input}`);
      }
      
      // 获取原图片信息
      const originalStats = fs.statSync(image.input);
      const originalMetadata = await sharp(image.input).metadata();
      
      console.log(`📊 原图片信息:`);
      console.log(`   大小: ${(originalStats.size / 1024).toFixed(2)} KB`);
      console.log(`   尺寸: ${originalMetadata.width}×${originalMetadata.height}`);
      console.log(`   通道数: ${originalMetadata.channels}`);
      
      // 验证尺寸
      if (originalMetadata.width !== image.expectedSize.width || originalMetadata.height !== image.expectedSize.height) {
        throw new Error(`图片尺寸不正确: ${originalMetadata.width}×${originalMetadata.height}, 期望: ${image.expectedSize.width}×${image.expectedSize.height}`);
      }
      
      console.log('🎯 开始优化格式和压缩...');
      
      // 尝试不同的压缩级别
      let bestResult = null;
      const maxSize = 1024 * 1024; // 1MB
      
      for (let compressionLevel = 6; compressionLevel <= 9; compressionLevel++) {
        const tempOutput = image.output.replace('.png', `_temp_${compressionLevel}.png`);
        
        try {
          console.log(`   🧪 尝试压缩级别 ${compressionLevel}...`);
          
          await sharp(image.input)
            .png({
              compressionLevel: compressionLevel,
              quality: 90,          // 高质量
              effort: 10,           // 最大压缩努力
              palette: false,       // 禁用调色板，强制RGB
              progressive: false,   // 非渐进式
              force: true          // 强制PNG格式
            })
            .toFile(tempOutput);
          
          const tempStats = fs.statSync(tempOutput);
          console.log(`     文件大小: ${(tempStats.size / 1024).toFixed(2)} KB`);
          
          if (tempStats.size <= maxSize) {
            // 找到合适的压缩级别
            bestResult = {
              level: compressionLevel,
              size: tempStats.size,
              path: tempOutput
            };
            console.log(`     ✅ 符合大小要求!`);
            break;
          } else {
            // 删除临时文件
            fs.unlinkSync(tempOutput);
            console.log(`     ❌ 仍然太大: ${(tempStats.size / 1024 / 1024).toFixed(2)} MB`);
          }
          
        } catch (error) {
          console.log(`     ❌ 压缩级别 ${compressionLevel} 失败: ${error.message}`);
          if (fs.existsSync(tempOutput)) {
            fs.unlinkSync(tempOutput);
          }
        }
      }
      
      if (bestResult) {
        // 使用最佳结果
        fs.renameSync(bestResult.path, image.output);
        
        // 验证最终文件
        const finalMetadata = await sharp(image.output).metadata();
        
        console.log(`✅ ${image.name} 图片优化成功:`);
        console.log(`   最佳压缩级别: ${bestResult.level}`);
        console.log(`   文件大小: ${(bestResult.size / 1024).toFixed(2)} KB`);
        console.log(`   尺寸: ${finalMetadata.width}×${finalMetadata.height}`);
        console.log(`   格式: ${finalMetadata.format}`);
        console.log(`   颜色空间: ${finalMetadata.space || 'unknown'}`);
        console.log(`   通道数: ${finalMetadata.channels}`);
        console.log(`   位深度: ${finalMetadata.depth}-bit`);
        
        // 使用file命令验证
        const { exec } = require('child_process');
        exec(`file "${image.output}"`, (error, stdout) => {
          if (!error) {
            console.log(`   文件类型: ${stdout.trim()}`);
          }
        });
        
      } else {
        console.error(`❌ 无法将 ${image.name} 图片压缩到1MB以下`);
        
        // 尝试最激进的压缩
        console.log('   🔥 尝试最激进压缩...');
        
        await sharp(image.input)
          .png({
            compressionLevel: 9,
            quality: 70,          // 降低质量
            effort: 10,
            palette: false,
            force: true
          })
          .toFile(image.output);
        
        const aggressiveStats = fs.statSync(image.output);
        console.log(`   最终大小: ${(aggressiveStats.size / 1024).toFixed(2)} KB`);
        
        if (aggressiveStats.size > maxSize) {
          console.warn(`   ⚠️ 仍然超过1MB: ${(aggressiveStats.size / 1024 / 1024).toFixed(2)} MB`);
        }
      }
      
    } catch (error) {
      console.error(`❌ 处理 ${image.name} 图片失败:`, error.message);
    }
  }
  
  console.log('\n🎉 Rich Menu图片优化完成！');
  console.log('');
  console.log('📋 生成的文件:');
  console.log('- richmenu-main-optimized.png');
  console.log('- richmenu-processing-optimized.png');
  console.log('');
  console.log('💡 下一步操作:');
  console.log('1. 检查优化后的图片');
  console.log('2. 替换原图片: node scripts/optimize-richmenu-format.js --replace');
  console.log('3. 测试上传: node scripts/test-atomic-richmenu.js');
}

async function replaceWithOptimizedImages() {
  console.log('🔄 替换为优化后的图片...');
  
  const assetsDir = path.join(__dirname, '../assets');
  
  const replacements = [
    {
      optimized: path.join(assetsDir, 'richmenu-main-optimized.png'),
      original: path.join(assetsDir, 'richmenu-main.png'),
      backup: path.join(assetsDir, 'richmenu-main-backup.png')
    },
    {
      optimized: path.join(assetsDir, 'richmenu-processing-optimized.png'),
      original: path.join(assetsDir, 'richmenu-processing.png'),
      backup: path.join(assetsDir, 'richmenu-processing-backup.png')
    }
  ];
  
  for (const replacement of replacements) {
    try {
      if (!fs.existsSync(replacement.optimized)) {
        console.log(`⚠️ 优化后的图片不存在: ${replacement.optimized}`);
        continue;
      }
      
      // 备份原图片
      if (fs.existsSync(replacement.original)) {
        fs.copyFileSync(replacement.original, replacement.backup);
        console.log(`💾 已备份原图片: ${path.basename(replacement.backup)}`);
      }
      
      // 替换为优化后的图片
      fs.copyFileSync(replacement.optimized, replacement.original);
      console.log(`✅ 已替换图片: ${path.basename(replacement.original)}`);
      
      // 验证替换后的文件
      const stats = fs.statSync(replacement.original);
      console.log(`   新文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
    } catch (error) {
      console.error(`❌ 替换图片失败:`, error.message);
    }
  }
  
  console.log('\n🎉 图片替换完成！');
  console.log('📱 现在可以重新测试Rich Menu图片上传');
}

if (require.main === module) {
  if (process.argv.includes('--replace')) {
    replaceWithOptimizedImages();
  } else {
    optimizeRichMenuFormat();
  }
}

module.exports = { optimizeRichMenuFormat, replaceWithOptimizedImages }; 