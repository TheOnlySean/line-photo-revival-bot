/**
 * 上传QR码水印图片到Vercel Blob存储
 */

const { put } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

async function uploadWatermarkQR() {
  try {
    console.log('🔖 上传QR码水印图片到Vercel Blob Storage...');
    
    const blobToken = lineConfig.blobToken;
    if (!blobToken) {
      throw new Error('VERCEL_BLOB_READ_WRITE_TOKEN 环境变量未设置');
    }

    // 读取QR码图片
    const qrImagePath = path.join(__dirname, '../assets/qr code.png');
    
    if (!fs.existsSync(qrImagePath)) {
      console.log('❌ QR码图片不存在:', qrImagePath);
      return { success: false, error: 'QR码图片文件不存在' };
    }

    const qrBuffer = fs.readFileSync(qrImagePath);
    console.log(`📊 QR码图片大小: ${(qrBuffer.length / 1024).toFixed(2)} KB`);

    // 上传到Blob存储
    const qrBlob = await put('watermark/qr-code-watermark.png', qrBuffer, {
      access: 'public',
      token: blobToken
    });
    
    console.log('✅ QR码水印上传成功:', qrBlob.url);
    
    // 显示结果
    console.log('\n🎉 QR码水印上传完成！');
    console.log('📋 请复制以下URL并更新代码：');
    console.log(`"${qrBlob.url}"`);
    
    console.log('\n💡 请更新 services/poster-image-service.js 中的 addWatermark 方法');
    
    return {
      success: true,
      watermarkUrl: qrBlob.url
    };
    
  } catch (error) {
    console.error('❌ 上传失败:', error);
    return { success: false, error: error.message };
  }
}

// 运行脚本
if (require.main === module) {
  uploadWatermarkQR()
    .then((result) => {
      console.log('\n✅ 脚本执行完成');
      console.log('📊 结果:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = uploadWatermarkQR;
