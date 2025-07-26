const { put } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

async function uploadPaymentCardImages() {
  try {
    console.log('🚀 开始上传支付卡片图片到 Vercel Blob Storage...');
    
    const blobToken = lineConfig.blobToken;
    if (!blobToken) {
      throw new Error('VERCEL_BLOB_READ_WRITE_TOKEN 环境变量未设置');
    }

    const results = {};

    // 上传 Trial 计划卡片
    console.log('📤 上传 Trial 计划卡片图片...');
    const trialImagePath = path.join(__dirname, '../assets/trial-plan-card.jpg');
    const trialBuffer = fs.readFileSync(trialImagePath);
    
    const trialBlob = await put('payment-cards/trial-plan-card.jpg', trialBuffer, {
      access: 'public',
      token: blobToken
    });
    
    results.trialImageUrl = trialBlob.url;
    console.log('✅ Trial 卡片上传成功:', trialBlob.url);

    // 上传 Standard 计划卡片
    console.log('📤 上传 Standard 计划卡片图片...');
    const standardImagePath = path.join(__dirname, '../assets/standard-plan-card.jpg');
    const standardBuffer = fs.readFileSync(standardImagePath);
    
    const standardBlob = await put('payment-cards/standard-plan-card.jpg', standardBuffer, {
      access: 'public',
      token: blobToken
    });
    
    results.standardImageUrl = standardBlob.url;
    console.log('✅ Standard 卡片上传成功:', standardBlob.url);

    // 显示结果
    console.log('\n🎉 所有图片上传完成！');
    console.log('📋 请复制以下 URL 并更新代码：');
    console.log('\n// Trial 计划卡片图片 URL:');
    console.log(`"${results.trialImageUrl}"`);
    console.log('\n// Standard 计划卡片图片 URL:');
    console.log(`"${results.standardImageUrl}"`);
    
    console.log('\n💡 请更新 utils/message-templates.js 中的 createPaymentOptionsCarousel 方法');
    
    return results;
    
  } catch (error) {
    console.error('❌ 上传失败:', error);
    throw error;
  }
}

// 如果直接运行脚本
if (require.main === module) {
  uploadPaymentCardImages()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = uploadPaymentCardImages; 