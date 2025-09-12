/**
 * Rich Menu图片文件验证脚本
 * 检查图片文件是否正确替换
 */

const fs = require('fs');
const path = require('path');

function checkRichMenuImage() {
  console.log('🔍 检查Rich Menu图片文件...\n');
  
  const imagePath = path.join(__dirname, '..', 'assets', 'richmenu-main-resized.jpg');
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(imagePath)) {
      console.log('❌ 图片文件不存在:', imagePath);
      return false;
    }
    
    // 检查文件大小
    const stats = fs.statSync(imagePath);
    const fileSizeInBytes = stats.size;
    const fileSizeInKB = fileSizeInBytes / 1024;
    
    console.log('📄 文件信息:');
    console.log(`   路径: ${imagePath}`);
    console.log(`   大小: ${fileSizeInBytes} 字节 (${fileSizeInKB.toFixed(2)} KB)`);
    console.log(`   修改时间: ${stats.mtime}`);
    
    // 检查文件大小是否合理（应该至少几十KB）
    if (fileSizeInBytes < 1000) {
      console.log('\n⚠️  警告: 文件大小过小，可能不是有效的图片文件');
      console.log('   正常的Rich Menu图片应该至少几十KB');
      return false;
    }
    
    // 检查文件大小是否过大（LINE限制1MB）
    if (fileSizeInBytes > 1024 * 1024) {
      console.log('\n⚠️  警告: 文件大小超过1MB，可能超出LINE限制');
      return false;
    }
    
    console.log('\n✅ 图片文件检查通过！');
    console.log('📝 下一步: 运行Rich Menu更新脚本');
    console.log('   生产环境: 调用 /api/setup/production-richmenu API');
    console.log('   开发环境: node scripts/reset-richmenu.js');
    
    return true;
    
  } catch (error) {
    console.log('❌ 检查图片文件时出错:', error.message);
    return false;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const isValid = checkRichMenuImage();
  
  if (!isValid) {
    console.log('\n🔧 修复建议:');
    console.log('1. 确保您的新Rich Menu图片已保存到正确位置');
    console.log('2. 图片规格: 2500x1686像素, JPEG/PNG格式');
    console.log('3. 文件大小: 10KB - 1MB之间');
    console.log('\n📍 正确路径: assets/richmenu-main-resized.jpg');
  }
  
  process.exit(isValid ? 0 : 1);
}

module.exports = checkRichMenuImage;
