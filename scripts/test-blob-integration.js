const https = require('https');
const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');

async function testBlobIntegration() {
  console.log('🧪 测试Vercel Blob存储集成...');
  
  try {
    console.log('\n📋 配置文件验证:');
    console.log('='.repeat(60));
    
    console.log(`✅ 加载了 ${trialPhotos.length} 个试用选项`);
    
    // 验证每个URL
    for (let i = 0; i < trialPhotos.length; i++) {
      const photo = trialPhotos[i];
      const details = trialPhotoDetails[photo.id];
      
      console.log(`\n📸 ${i + 1}. ${photo.id} - ${details.title}`);
      console.log(`   图片URL: ${photo.image_url}`);
      console.log(`   视频URL: ${photo.demo_video_url}`);
      
             // 验证URL格式
       const imageValid = photo.image_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/');
       const videoValid = photo.demo_video_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/');
      
      console.log(`   图片URL格式: ${imageValid ? '✅' : '❌'}`);
      console.log(`   视频URL格式: ${videoValid ? '✅' : '❌'}`);
      
      // 测试图片URL可访问性
      try {
        const imageAccessible = await testUrlAccessibility(photo.image_url);
        console.log(`   图片可访问: ${imageAccessible ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`   图片可访问: ❌ (${error.message})`);
      }
      
      // 测试视频URL可访问性（只检查头部，不下载完整文件）
      try {
        const videoAccessible = await testUrlAccessibility(photo.demo_video_url, true);
        console.log(`   视频可访问: ${videoAccessible ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`   视频可访问: ❌ (${error.message})`);
      }
    }
    
    // 测试Flex Message结构
    console.log('\n🎨 测试Flex Message结构:');
    console.log('='.repeat(60));
    
    const testPhoto = trialPhotos[0];
    const testDetails = trialPhotoDetails[testPhoto.id];
    
    const flexMessage = {
      type: 'flex',
      altText: '🎁 無料体験 - サンプル写真を選択',
      contents: {
        type: 'carousel',
        contents: [{
          type: 'bubble',
          hero: {
            type: 'image',
            url: testPhoto.image_url,
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'cover'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: testDetails.title,
                weight: 'bold',
                size: 'md',
                color: '#333333'
              },
              {
                type: 'text',
                text: testDetails.subtitle,
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🎬 この写真で体験',
                  data: `action=free_trial&photo_id=${testPhoto.id}&type=${testPhoto.type}`,
                  displayText: `${testDetails.title}で無料体験開始`
                },
                style: 'primary',
                color: '#FF6B9D'
              }
            ]
          }
        }]
      }
    };
    
    console.log('✅ Flex Message结构创建成功');
    console.log(`   消息类型: ${flexMessage.type}`);
    console.log(`   Carousel项目数: ${flexMessage.contents.contents.length}`);
    console.log(`   图片URL长度: ${flexMessage.contents.contents[0].hero.url.length} 字符`);
    
    // 验证视频发送消息结构
    console.log('\n🎬 测试视频发送结构:');
    console.log('='.repeat(60));
    
    const videoMessage = {
      type: 'video',
      originalContentUrl: testPhoto.demo_video_url,
      previewImageUrl: testPhoto.image_url
    };
    
    console.log('✅ 视频消息结构创建成功');
    console.log(`   视频URL: ${videoMessage.originalContentUrl}`);
    console.log(`   预览图URL: ${videoMessage.previewImageUrl}`);
    console.log(`   URL域名一致: ${videoMessage.originalContentUrl.includes('gvzacs1zhqba8qzq.public.blob.vercel-storage.com') ? '✅' : '❌'}`);
    
    console.log('\n🎉 Blob存储集成测试完成！');
    
    console.log('\n📱 预期用户体验:');
    console.log('1. 用户添加好友 → 欢迎消息');
    console.log('2. 立即显示3张图片预览 → 使用Blob存储的图片');
    console.log('3. 用户选择图片 → 开始20秒生成');
    console.log('4. 完成后发送视频 → 使用Blob存储的视频');
    console.log('5. 所有文件都通过Vercel Blob CDN提供');
    
    console.log('\n💡 优势:');
    console.log('- ✅ 完全托管的文件存储');
    console.log('- ✅ 全球CDN加速访问');
    console.log('- ✅ 无需担心serverless文件系统限制');
    console.log('- ✅ LINE API可以直接访问所有URL');
    
  } catch (error) {
    console.error('❌ Blob存储集成测试失败:', error);
  }
}

// 测试URL可访问性
function testUrlAccessibility(url, headOnly = false) {
  return new Promise((resolve, reject) => {
    const method = headOnly ? 'HEAD' : 'GET';
    
    const req = https.request(url, { method }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(true);
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.resume(); // 消费响应数据
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    req.end();
  });
}

// 显示Blob存储配置信息
function showBlobConfiguration() {
  console.log(`
📦 Vercel Blob存储配置

🔗 存储域名:
  https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/

 📁 文件结构:
   demo-files/
   ├── trial/              # 固定试用演示文件（不清理）
   │   ├── 1.png (1.13MB) → trial_1 图片
   │   ├── 1.mp4 (17.60MB) → trial_1 视频  
   │   ├── 2.png (1.09MB) → trial_2 图片
   │   ├── 2.mp4 (23.60MB) → trial_2 视频
   │   ├── 3.png (1.79MB) → trial_3 图片
   │   └── 3.mp4 (17.67MB) → trial_3 视频
   └── user-uploads/       # 用户上传内容（定期清理）
       ├── photos/         # 用户上传的照片
       └── videos/         # 生成的视频

🎯 配置优势:
✅ 直接HTTPS访问，LINE API完全兼容
✅ 全球CDN分发，访问速度快
✅ 托管存储，无需管理服务器文件系统
✅ 自动生成唯一URL，避免缓存问题
✅ 公开访问权限，支持图片预览

📱 用户体验改善:
- 图片预览加载更快
- 视频播放更稳定  
- 支持全球用户访问
- 减少服务器负载

🔧 技术实现:
- 使用@vercel/blob SDK上传文件
- 配置文件直接使用Blob URL
- 无需动态URL构建
- 简化代码逻辑
`);
}

if (require.main === module) {
  if (process.argv.includes('--config')) {
    showBlobConfiguration();
  } else {
    testBlobIntegration();
  }
}

module.exports = { testBlobIntegration, showBlobConfiguration }; 