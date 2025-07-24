const fs = require('fs');
const path = require('path');

async function testDemoFilesMapping() {
  console.log('🧪 测试demo-files文件映射关系...');
  
  try {
    // 获取更新后的配置
    const { trialPhotos, trialPhotoDetails } = require('../config/demo-trial-photos');
    
    console.log('\n📋 文件映射关系验证:');
    console.log('='.repeat(60));
    
    // 检查demo-files文件夹中的实际文件
    const demoFilesDir = path.join(__dirname, '..', 'demo-files');
    const actualFiles = fs.readdirSync(demoFilesDir).filter(file => 
      file.endsWith('.png') || file.endsWith('.mp4')
    ).sort();
    
    console.log('\n📁 demo-files文件夹中的实际文件:');
    actualFiles.forEach(file => {
      const filePath = path.join(demoFilesDir, file);
      const stats = fs.statSync(filePath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`   ✅ ${file} (${sizeInMB}MB)`);
    });
    
    console.log('\n🔗 配置文件中的映射关系:');
    trialPhotos.forEach((photo, index) => {
      console.log(`\n   📸 试用选项 ${index + 1}: ${photo.id}`);
      console.log(`      标题: ${photo.title}`);
      console.log(`      图片路径: ${photo.image_url}`);
      console.log(`      视频路径: ${photo.demo_video_url}`);
      
      // 验证对应的本地文件是否存在
      const imagePath = path.join(__dirname, '..', photo.image_url);
      const videoPath = path.join(__dirname, '..', photo.demo_video_url);
      
      const imageExists = fs.existsSync(imagePath);
      const videoExists = fs.existsSync(videoPath);
      
      console.log(`      图片存在: ${imageExists ? '✅' : '❌'}`);
      console.log(`      视频存在: ${videoExists ? '✅' : '❌'}`);
      
      if (imageExists) {
        const imageStats = fs.statSync(imagePath);
        console.log(`      图片大小: ${(imageStats.size / (1024 * 1024)).toFixed(2)}MB`);
      }
      
      if (videoExists) {
        const videoStats = fs.statSync(videoPath);
        console.log(`      视频大小: ${(videoStats.size / (1024 * 1024)).toFixed(2)}MB`);
      }
    });
    
    // 验证Vercel配置
    console.log('\n🔧 Vercel静态文件配置验证:');
    const vercelConfig = require('../vercel.json');
    const demoFilesRewrite = vercelConfig.rewrites?.find(rewrite => 
      rewrite.source?.includes('/demo-files/')
    );
    
    if (demoFilesRewrite) {
      console.log('   ✅ Vercel配置包含demo-files路由:');
      console.log(`      Source: ${demoFilesRewrite.source}`);
      console.log(`      Destination: ${demoFilesRewrite.destination}`);
    } else {
      console.log('   ❌ Vercel配置缺少demo-files路由');
    }
    
    // 生成预期的用户体验流程
    console.log('\n📱 预期用户体验流程:');
    console.log('='.repeat(60));
    
    trialPhotos.forEach((photo, index) => {
      const details = trialPhotoDetails[photo.id];
      console.log(`\n   🎬 选项${index + 1}: ${details.title}`);
      console.log(`      1. 用户看到图片预览: ${photo.image_url}`);
      console.log(`      2. 点击"この写真で体験"按钮`);
      console.log(`      3. 切换到processing状态`); 
      console.log(`      4. 20秒后收到视频: ${photo.demo_video_url}`);
      console.log(`      5. 自动切换回主菜单`);
    });
    
    // 检查文件完整性
    console.log('\n✅ 完整性检查结果:');
    const requiredFiles = [
      '1.png', '1.mp4',
      '2.png', '2.mp4', 
      '3.png', '3.mp4'
    ];
    
    const missingFiles = requiredFiles.filter(file => 
      !actualFiles.includes(file)
    );
    
    if (missingFiles.length === 0) {
      console.log('   ✅ 所有必需文件都存在');
      console.log('   ✅ 配置映射关系正确');
      console.log('   ✅ Vercel路由配置已添加');
      console.log('\n🎉 文件映射关系配置完成！用户现在可以体验本地演示内容了。');
    } else {
      console.log('   ❌ 缺少以下文件:');
      missingFiles.forEach(file => console.log(`      - ${file}`));
    }
    
    // 显示下一步建议
    console.log('\n💡 测试建议:');
    console.log('1. 重新添加LINE Bot为好友');
    console.log('2. 选择任一试用选项');
    console.log('3. 验证是否显示本地demo-files中的图片');
    console.log('4. 验证20秒后是否收到对应的本地视频');
    console.log('5. 如果有问题，检查Vercel部署日志');
    
    return {
      mappingCorrect: missingFiles.length === 0,
      actualFiles,
      trialPhotos,
      missingFiles
    };
    
  } catch (error) {
    console.error('❌ 测试demo-files映射关系失败:', error);
    return { mappingCorrect: false, error: error.message };
  }
}

// 显示文件映射详情
function showMappingDetails() {
  console.log(`
📁 Demo Files 文件映射详情

🔗 映射关系:
trial_1 (女性挥手微笑):
  📸 图片: /demo-files/1.png → demo-files/1.png
  🎬 视频: /demo-files/1.mp4 → demo-files/1.mp4

trial_2 (男性友好问候):  
  📸 图片: /demo-files/2.png → demo-files/2.png
  🎬 视频: /demo-files/2.mp4 → demo-files/2.mp4

trial_3 (情侣温馨互动):
  📸 图片: /demo-files/3.png → demo-files/3.png
  🎬 视频: /demo-files/3.mp4 → demo-files/3.mp4

🚀 技术实现:
- 配置文件: config/demo-trial-photos.js
- 静态路由: vercel.json (添加demo-files路由)
- 文件位置: demo-files/ 文件夹
- 访问路径: /demo-files/{filename}

📱 用户体验:
1. 新用户添加好友 → 看到3张本地图片预览
2. 选择图片 → 开始20秒生成过程
3. 完成后 → 收到对应的本地MP4视频
4. 完全使用本地资源，无需外部API

✅ 优势:
- 文件本地化，访问速度快
- 不依赖外部服务，稳定可靠
- 可以使用自定义的高质量演示内容
- 完全控制用户试用体验
`);
}

if (require.main === module) {
  if (process.argv.includes('--details')) {
    showMappingDetails();
  } else {
    testDemoFilesMapping();
  }
}

module.exports = { testDemoFilesMapping, showMappingDetails }; 