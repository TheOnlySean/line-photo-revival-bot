const ImageUploader = require('../services/image-uploader');
const fs = require('fs');
const path = require('path');

async function testImageProcessing() {
  console.log('🧪 开始测试图片处理功能...');
  
  const imageUploader = new ImageUploader();
  
  try {
    // 测试1: 检查图片格式验证
    console.log('\n📋 测试1: 图片格式验证');
    
    // 创建测试用的JPG格式标识符
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
    const invalidHeader = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    
    console.log('✅ JPEG格式验证:', imageUploader.isValidImageFormat(jpegHeader));
    console.log('✅ PNG格式验证:', imageUploader.isValidImageFormat(pngHeader));
    console.log('❌ 无效格式验证:', imageUploader.isValidImageFormat(invalidHeader));
    
    // 测试2: 测试空buffer处理
    console.log('\n📋 测试2: 空buffer处理');
    try {
      const result = await imageUploader.processImage(Buffer.alloc(0));
      console.log('⚠️ 空buffer处理未抛出错误 - 这可能是问题');
    } catch (error) {
      console.log('✅ 空buffer正确抛出错误:', error.message);
    }
    
    // 测试3: 测试有效的测试图片（如果存在）
    console.log('\n📋 测试3: 处理测试图片');
    const testImagePath = path.join(__dirname, '../assets/richmenu-main.png');
    
    if (fs.existsSync(testImagePath)) {
      console.log('📁 找到测试图片:', testImagePath);
      const testBuffer = fs.readFileSync(testImagePath);
      console.log('📊 测试图片大小:', testBuffer.length, 'bytes');
      console.log('🔍 格式验证:', imageUploader.isValidImageFormat(testBuffer));
      
      try {
        const processedBuffer = await imageUploader.processImage(testBuffer);
        console.log('✅ 图片处理成功，输出大小:', processedBuffer.length, 'bytes');
        
        // 检查输出是否为有效的JPEG
        console.log('🔍 输出格式验证:', imageUploader.isValidImageFormat(processedBuffer));
        
        // 获取图片信息
        const imageInfo = await imageUploader.getImageInfo(testBuffer);
        console.log('📊 原始图片信息:', imageInfo);
        
        const processedInfo = await imageUploader.getImageInfo(processedBuffer);
        console.log('📊 处理后图片信息:', processedInfo);
        
      } catch (error) {
        console.log('❌ 图片处理失败:', error.message);
      }
    } else {
      console.log('⚠️ 未找到测试图片，跳过此测试');
    }
    
    // 测试4: 测试配置
    console.log('\n📋 测试4: 配置检查');
    console.log('🔧 Blob Token 配置:', imageUploader.blobToken ? '已配置' : '未配置');
    
    console.log('\n🎉 图片处理功能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error);
  }
}

// 运行测试
if (require.main === module) {
  testImageProcessing();
}

module.exports = testImageProcessing; 