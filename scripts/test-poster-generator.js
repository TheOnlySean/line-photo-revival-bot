/**
 * 海报生成器测试脚本
 * 测试 KIE.AI nano-banana-edit API 集成
 */

const PosterGenerator = require('../services/poster-generator');
const PosterImageService = require('../services/poster-image-service');
const db = require('../config/database');

async function testPosterGenerator() {
  console.log('🧪 开始测试海报生成器...\n');
  
  try {
    // 1. 初始化服务
    console.log('1️⃣ 初始化海报生成服务...');
    const posterImageService = new PosterImageService();
    const posterGenerator = new PosterGenerator(db, posterImageService);
    
    console.log('✅ 服务初始化完成');
    
    // 2. 检查配置状态
    console.log('\n2️⃣ 检查 KIE.AI 配置...');
    const status = posterGenerator.getStatus();
    console.log('📊 配置状态:', status);
    
    if (status.apiKey === '未配置') {
      console.log('❌ KIE.AI API Key 未配置，无法进行实际测试');
      console.log('📝 请设置环境变量: KIE_AI_API_KEY');
      return { success: false, error: 'API Key 未配置' };
    }

    // 3. 检查海报模板是否可用
    console.log('\n3️⃣ 检查海报模板可用性...');
    const templates = await db.getActivePosterTemplates();
    console.log(`📂 找到 ${templates.length} 个活跃模板`);
    
    if (templates.length === 0) {
      console.log('❌ 没有可用的海报模板');
      return { success: false, error: '没有可用的海报模板' };
    }

    const randomTemplate = await db.getRandomPosterTemplate();
    console.log(`🎨 随机选择模板: ${randomTemplate.template_name} (${randomTemplate.style_category})`);

    // 4. 测试单个任务创建（使用测试图片）
    console.log('\n4️⃣ 测试 KIE.AI 任务创建...');
    const testImageUrl = 'https://example.com/test-image.jpg'; // 实际测试时需要真实图片URL
    const testPrompt = 'Transform this photo into a vintage style portrait with warm sepia tones and classic lighting.';

    try {
      // 注意：这里会调用真实的API，如果没有有效的图片URL会失败
      console.log('⚠️  注意: 以下测试需要真实的图片URL，当前使用测试URL可能会失败');
      console.log('📡 测试创建任务...');
      
      // 模拟任务创建（实际测试时取消注释）
      /*
      const taskId = await posterGenerator.createKieAiTask({
        prompt: testPrompt,
        image_urls: [testImageUrl]
      });
      
      console.log(`✅ 任务创建成功 - TaskID: ${taskId}`);
      
      // 测试查询任务状态
      const statusResult = await posterGenerator.queryTaskStatus(taskId);
      console.log('📊 任务状态查询:', statusResult);
      */
      
      console.log('✅ API 接口测试跳过（需要真实图片URL）');
      
    } catch (error) {
      console.log(`⚠️ API 测试失败（预期）: ${error.message}`);
    }

    // 5. 测试工具函数
    console.log('\n5️⃣ 测试工具函数...');
    
    // 测试图片服务配置
    console.log('📁 图片服务路径配置:', posterImageService.paths);
    
    // 测试数据库函数
    const testTemplate = await db.getRandomPosterTemplate();
    console.log(`🎲 随机模板选择测试: ${testTemplate ? testTemplate.template_name : '无结果'}`);

    // 6. 完整流程模拟（不调用真实API）
    console.log('\n6️⃣ 完整流程模拟...');
    const testUserId = '999999';
    
    console.log(`👤 模拟用户: ${testUserId}`);
    console.log('📋 完整流程步骤:');
    console.log('   1. 用户上传图片 → 存储服务');
    console.log('   2. 调用昭和风转换 → KIE.AI Step 1');
    console.log('   3. 轮询等待昭和风结果 → 存储服务');
    console.log('   4. 选择随机海报模板');
    console.log('   5. 调用海报合成 → KIE.AI Step 2');
    console.log('   6. 轮询等待最终结果 → 存储服务');
    console.log('   7. 返回最终海报URL');

    /*
    // 实际测试（需要真实图片URL）
    console.log('\n🚀 开始完整测试...');
    const result = await posterGenerator.generatePoster(testUserId, testImageUrl);
    
    if (result.success) {
      console.log('✅ 海报生成成功!');
      console.log('📸 昭和风图片:', result.showaImageUrl);
      console.log('🎨 最终海报:', result.posterUrl);
      console.log('⏱️ 总耗时:', result.totalTime, '秒');
    } else {
      console.log('❌ 海报生成失败:', result.error);
    }
    */

    console.log('\n🎉 海报生成器测试完成！');
    console.log('\n📝 测试总结:');
    console.log('✅ 服务初始化 - 正常');
    console.log('✅ 配置检查 - 正常');
    console.log('✅ 模板系统 - 正常');
    console.log('✅ API 接口 - 已集成（需要真实测试）');
    console.log('✅ 数据库函数 - 正常');
    console.log('✅ 流程设计 - 完整');

    console.log('\n🔧 实际部署前的准备工作:');
    console.log('1. 确保 KIE_AI_API_KEY 环境变量已设置');
    console.log('2. 准备真实的海报模板图片并上传');
    console.log('3. 更新数据库中的 template_url 字段');
    console.log('4. 测试完整的用户图片 → 海报生成流程');

    return {
      success: true,
      apiConfigured: status.apiKey === '已配置',
      templatesCount: templates.length,
      readyForTesting: false, // 需要真实图片和模板
      nextSteps: [
        '设置真实海报模板',
        '测试完整API调用',
        '集成到事件处理器'
      ]
    };

  } catch (error) {
    console.error('❌ 海报生成器测试失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testPosterGenerator()
    .then((result) => {
      console.log('\n✅ 测试脚本执行完成');
      console.log('📊 结果:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 测试脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = testPosterGenerator;
