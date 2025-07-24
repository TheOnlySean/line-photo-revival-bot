const LineBot = require('../services/line-bot');
const lineConfig = require('../config/line-config');

async function testImageUrlFix() {
  console.log('🧪 测试图片URL修复...');
  
  try {
    // 创建LineBot实例
    const lineBot = new LineBot(lineConfig);
    
    // 测试getBaseUrl方法
    console.log('\n🌐 测试基础URL构建:');
    console.log('='.repeat(50));
    
    // 显示当前环境变量
    console.log('环境变量检查:');
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || '未设置'}`);
    console.log(`  VERCEL_URL: ${process.env.VERCEL_URL || '未设置'}`);
    console.log(`  VERCEL_PROJECT_PRODUCTION_URL: ${process.env.VERCEL_PROJECT_PRODUCTION_URL || '未设置'}`);
    
    // 获取构建的基础URL
    const baseUrl = lineBot.getBaseUrl();
    console.log(`\n✅ 构建的基础URL: ${baseUrl}`);
    
    // 测试图片URL转换
    console.log('\n📸 测试图片URL转换:');
    console.log('='.repeat(50));
    
    const { trialPhotos } = require('../config/demo-trial-photos');
    
    trialPhotos.forEach((photo, index) => {
      const originalUrl = photo.image_url;
      const fullUrl = originalUrl.startsWith('/') 
        ? `${baseUrl}${originalUrl}` 
        : originalUrl;
      
      console.log(`\n试用选项 ${index + 1}: ${photo.id}`);
      console.log(`  原始路径: ${originalUrl}`);
      console.log(`  完整URL: ${fullUrl}`);
      console.log(`  可访问: ${fullUrl.startsWith('https://') ? '✅' : '❌'}`);
    });
    
    // 测试Flex Message结构
    console.log('\n🎨 测试Flex Message结构:');
    console.log('='.repeat(50));
    
    const testPhoto = trialPhotos[0];
    const fullImageUrl = testPhoto.image_url.startsWith('/') 
      ? `${baseUrl}${testPhoto.image_url}` 
      : testPhoto.image_url;
    
    const testFlexBubble = {
      type: 'bubble',
      hero: {
        type: 'image',
        url: fullImageUrl,
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
            text: '👋 女性挥手微笑',
            weight: 'bold',
            size: 'md',
            color: '#333333'
          }
        ]
      }
    };
    
    console.log('✅ 测试Flex Bubble结构创建成功');
    console.log(`   图片URL: ${testFlexBubble.hero.url}`);
    console.log(`   类型: ${testFlexBubble.type}`);
    console.log(`   尺寸比例: ${testFlexBubble.hero.aspectRatio}`);
    
    // 验证URL格式
    console.log('\n🔍 URL格式验证:');
    console.log('='.repeat(50));
    
    const urlValidation = {
      isHttps: fullImageUrl.startsWith('https://'),
      hasValidDomain: fullImageUrl.includes('.'),
      hasImagePath: fullImageUrl.includes('/demo-files/'),
      hasImageExtension: fullImageUrl.endsWith('.png')
    };
    
    console.log('URL验证结果:');
    Object.entries(urlValidation).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? '✅' : '❌'}`);
    });
    
    const allValid = Object.values(urlValidation).every(v => v);
    console.log(`\n总体验证: ${allValid ? '✅ 通过' : '❌ 失败'}`);
    
    if (allValid) {
      console.log('\n🎉 图片URL修复验证通过！');
      console.log('现在用户应该能看到免费试用的图片预览了。');
    } else {
      console.log('\n⚠️ 还存在一些问题需要调整。');
    }
    
    // 显示预期的用户体验
    console.log('\n📱 预期用户体验:');
    console.log('1. 用户添加好友 → 看到欢迎消息');
    console.log('2. 立即收到免费试用选项 → 显示3张图片预览');
    console.log('3. 点击图片 → 开始20秒生成过程');
    console.log('4. 完成后 → 收到对应的本地视频');
    
    console.log('\n💡 如果仍然看不到图片:');
    console.log('1. 检查Vercel部署状态');
    console.log('2. 确认demo-files文件夹在部署中包含');
    console.log('3. 验证静态文件路由配置');
    console.log('4. 查看LINE Bot控制台的错误信息');
    
    return { success: allValid, baseUrl, fullImageUrl };
    
  } catch (error) {
    console.error('❌ 测试图片URL修复失败:', error);
    return { success: false, error: error.message };
  }
}

// 显示修复详情
function showFixDetails() {
  console.log(`
🔧 图片URL修复详情

❌ 问题原因:
- LINE Bot API需要完整的HTTPS URL显示图片
- 相对路径如 "/demo-files/1.png" 无法被LINE访问
- 导致Flex Message发送失败 (HTTP 400)

✅ 解决方案:
1. **动态URL构建**
   - 使用 getBaseUrl() 获取Vercel部署域名
   - 将相对路径转换为完整HTTPS URL
   - 支持多种环境变量检测

2. **环境适配**
   - 生产环境: https://your-vercel-app.vercel.app
   - 开发环境: http://localhost:3000
   - 备选方案: 固定fallback URL

3. **保持视频发送不变**
   - 图片: 完整URL用于预览
   - 视频: 相对路径用于发送

🚀 技术实现:
- getBaseUrl(): 智能检测部署环境
- sendSimplifiedTrialOptions(): 动态构建图片URL
- 保持配置文件简洁，运行时转换URL
- 完整的调试日志追踪

📊 预期结果:
- 用户能看到3张图片预览
- 图片显示清晰正确
- 点击后正常开始生成流程
- 20秒后收到对应视频
`);
}

if (require.main === module) {
  if (process.argv.includes('--details')) {
    showFixDetails();
  } else {
    testImageUrlFix();
  }
}

module.exports = { testImageUrlFix, showFixDetails }; 