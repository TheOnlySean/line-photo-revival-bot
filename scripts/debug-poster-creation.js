/**
 * 调试海报创建流程
 * 模拟海报任务创建过程，找出问题所在
 */

const db = require('../config/database');
const PosterGenerator = require('../services/poster-generator');
const PosterImageService = require('../services/poster-image-service');

async function debugPosterCreation() {
  console.log('🧪 调试海报创建流程...');
  
  try {
    // 1. 测试数据库创建任务功能
    console.log('1️⃣ 测试创建海报任务记录...');
    
    const testUserId = 7; // 您的用户ID
    const testLineUserId = 'U23ea34c52091796e999d10f150460c78';
    const testImageUrl = 'https://example.com/test-image.jpg';
    
    let posterTask;
    try {
      posterTask = await db.createPosterTask(testUserId, testLineUserId, testImageUrl);
      console.log('✅ 数据库任务创建成功:', posterTask.id);
    } catch (createError) {
      console.error('❌ 数据库任务创建失败:', createError.message);
      return { error: 'database_task_creation_failed', details: createError.message };
    }

    // 2. 测试服务初始化
    console.log('2️⃣ 测试海报生成服务初始化...');
    
    let posterImageService, posterGenerator;
    try {
      posterImageService = new PosterImageService();
      posterGenerator = new PosterGenerator(db, posterImageService);
      console.log('✅ 服务初始化成功');
      
      const status = posterGenerator.getStatus();
      console.log('📊 服务状态:', status);
    } catch (serviceError) {
      console.error('❌ 服务初始化失败:', serviceError.message);
      return { error: 'service_init_failed', details: serviceError.message };
    }

    // 3. 测试模板选择
    console.log('3️⃣ 测试模板选择...');
    
    try {
      const template = await db.getRandomPosterTemplate();
      if (template) {
        console.log(`✅ 随机模板选择成功: ${template.template_name}`);
        console.log(`   URL: ${template.template_url.substring(0, 80)}...`);
        
        const isValid = template.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
        console.log(`   有效性: ${isValid ? '✅ 有效' : '❌ 无效'}`);
        
        if (!isValid) {
          console.log('🚨 发现问题: 模板URL无效！');
        }
      } else {
        console.log('❌ 没有找到模板');
        return { error: 'no_templates_found' };
      }
    } catch (templateError) {
      console.error('❌ 模板选择失败:', templateError.message);
      return { error: 'template_selection_failed', details: templateError.message };
    }

    // 4. 测试KIE.AI API连接（不实际创建任务）
    console.log('4️⃣ 测试KIE.AI API配置...');
    
    const kieConfig = {
      hasApiKey: !!process.env.KIE_AI_API_KEY,
      apiKeyPreview: process.env.KIE_AI_API_KEY ? process.env.KIE_AI_API_KEY.substring(0, 8) + '...' : 'Not set',
      baseUrl: 'https://api.kie.ai'
    };
    
    console.log('📊 KIE.AI配置:', kieConfig);
    
    if (!kieConfig.hasApiKey) {
      console.log('❌ KIE.AI API Key未配置！');
      return { error: 'kie_api_key_missing' };
    }

    // 5. 清理测试任务
    console.log('5️⃣ 清理测试任务...');
    try {
      await db.query('DELETE FROM poster_tasks WHERE id = $1', [posterTask.id]);
      console.log('✅ 测试任务已清理');
    } catch (cleanError) {
      console.warn('⚠️ 清理测试任务失败:', cleanError.message);
    }

    console.log('\n🎉 调试完成！基础组件全部正常');
    console.log('\n💡 建议：');
    console.log('1. 所有基础功能正常，可以重新尝试生成');
    console.log('2. 如果还有问题，可能是Vercel部署延迟');
    console.log('3. 建议等待2-3分钟后重新测试');

    return { success: true, allComponentsWorking: true };

  } catch (error) {
    console.error('❌ 调试流程失败:', error.message);
    return { error: 'debug_failed', details: error.message };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  debugPosterCreation()
    .then((result) => {
      console.log('\n📊 调试结果:', result);
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = debugPosterCreation;
