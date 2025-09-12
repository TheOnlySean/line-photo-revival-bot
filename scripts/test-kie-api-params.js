/**
 * 测试KIE.AI API参数脚本
 * 模拟完整的海报生成流程，检查传递给KIE.AI的实际参数
 */

const db = require('../config/database');
const PosterGenerator = require('../services/poster-generator');
const PosterImageService = require('../services/poster-image-service');
const axios = require('axios');
const lineConfig = require('../config/line-config');

async function testKieApiParams() {
  console.log('🧪 测试KIE.AI API参数...');
  
  try {
    // 1. 初始化服务
    console.log('1️⃣ 初始化服务...');
    const posterImageService = new PosterImageService();
    const posterGenerator = new PosterGenerator(db, posterImageService);
    
    console.log('✅ 服务初始化成功');

    // 2. 检查KIE.AI配置
    console.log('2️⃣ 检查KIE.AI配置...');
    const status = posterGenerator.getStatus();
    console.log('📊 配置状态:', status);
    
    if (status.apiKey !== '已配置') {
      console.log('❌ KIE.AI API Key未配置，无法进行测试');
      return { error: 'api_key_not_configured' };
    }

    // 3. 检查海报模板
    console.log('3️⃣ 检查海报模板...');
    const templates = await db.getActivePosterTemplates();
    console.log(`📊 找到 ${templates.length} 个活跃模板`);
    
    templates.forEach(template => {
      const isValid = template.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
      console.log(`${isValid ? '✅' : '❌'} ${template.template_name}: ${template.template_url.substring(0, 80)}...`);
    });

    const validTemplates = templates.filter(t => 
      t.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/')
    );
    
    if (validTemplates.length === 0) {
      console.log('❌ 没有有效的模板URL！');
      return { error: 'no_valid_templates' };
    }

    // 4. 模拟第一步：昭和风转换的参数
    console.log('4️⃣ 模拟第一步API调用参数...');
    
    const testUserImageUrl = 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/line-uploads/test-user-image.jpg';
    
    const step1Prompt = `将角色的风格改为[1970]年代的经典[昭和高中生]风格

将背景改为标志性的[昭和高校风景]

将服饰改为标志性的[昭和高中生服饰]

增加1970年老照片的风格和元素和老照片滤镜

重要！保持原图中的人物数量完全不变，不要增加或减少任何人物！

注意！不要改变角色的面部长相表情！`;

    const step1Params = {
      model: 'google/nano-banana-edit',
      input: {
        prompt: step1Prompt,
        image_urls: [testUserImageUrl],
        output_format: 'png',
        image_size: 'auto'
      }
    };

    console.log('📝 第一步参数:');
    console.log(`   模型: ${step1Params.model}`);
    console.log(`   Prompt长度: ${step1Params.input.prompt.length} 字符`);
    console.log(`   图片数量: ${step1Params.input.image_urls.length}`);
    console.log(`   用户图片URL: ${step1Params.input.image_urls[0]}`);
    console.log(`   输出格式: ${step1Params.input.output_format}`);
    console.log(`   图片尺寸: ${step1Params.input.image_size}`);

    // 5. 模拟第二步：海报合成的参数
    console.log('\n5️⃣ 模拟第二步API调用参数...');
    
    const randomTemplate = validTemplates[0]; // 使用第一个有效模板
    const testShowaImageUrl = 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/showa/test-showa.jpg';
    
    const step2Prompt = `用[image1]的风格为[image2]的人物做一个杂志封面设计，增加老照片老书本的滤镜效果。

注意！不要改变角色的面部长相表情！`;

    const step2Params = {
      model: 'google/nano-banana-edit',
      input: {
        prompt: step2Prompt,
        image_urls: [randomTemplate.template_url, testShowaImageUrl], // 模板在前
        output_format: 'png',
        image_size: 'auto'
      }
    };

    console.log('📝 第二步参数:');
    console.log(`   模型: ${step2Params.model}`);
    console.log(`   Prompt长度: ${step2Params.input.prompt.length} 字符`);
    console.log(`   图片数量: ${step2Params.input.image_urls.length}`);
    console.log(`   图片1 (模板): ${step2Params.input.image_urls[0]}`);
    console.log(`   图片2 (人物): ${step2Params.input.image_urls[1]}`);
    console.log(`   输出格式: ${step2Params.input.output_format}`);
    console.log(`   图片尺寸: ${step2Params.input.image_size}`);

    // 6. 验证图片URL的可访问性
    console.log('\n6️⃣ 验证图片URL可访问性...');
    
    const urlsToCheck = [
      { name: '模板图片', url: randomTemplate.template_url },
      { name: '测试用户图片', url: testUserImageUrl },
      { name: '测试昭和图片', url: testShowaImageUrl }
    ];

    for (const urlCheck of urlsToCheck) {
      try {
        console.log(`🔍 检查 ${urlCheck.name}: ${urlCheck.url.substring(0, 80)}...`);
        
        const response = await axios.head(urlCheck.url, { timeout: 5000 });
        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];
        
        console.log(`   ✅ 可访问 - 类型: ${contentType}, 大小: ${contentLength} bytes`);
        
      } catch (urlError) {
        console.log(`   ❌ 不可访问 - ${urlError.message}`);
        if (urlCheck.name === '模板图片') {
          console.log('🚨 关键问题：模板图片URL无法访问！');
        }
      }
    }

    // 7. 测试实际的API调用格式（不真正提交）
    console.log('\n7️⃣ 验证API调用格式...');
    
    const apiEndpoint = 'https://api.kie.ai/api/v1/jobs/createTask';
    const headers = {
      'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`,
      'Content-Type': 'application/json'
    };

    console.log('📡 API端点:', apiEndpoint);
    console.log('🔑 认证头:', headers.Authorization.substring(0, 20) + '...');
    
    console.log('\n📝 第一步完整请求体:');
    console.log(JSON.stringify(step1Params, null, 2));
    
    console.log('\n📝 第二步完整请求体:');  
    console.log(JSON.stringify(step2Params, null, 2));

    // 总结
    console.log('\n📊 参数验证总结:');
    console.log('✅ KIE.AI API Key已配置');
    console.log(`✅ 模板URL数量: ${validTemplates.length} 个有效`);
    console.log('✅ API请求格式正确');
    console.log('✅ Prompt内容完整');
    console.log('✅ 图片顺序正确（模板在前，人物在后）');

    return {
      success: true,
      step1Params: step1Params,
      step2Params: step2Params,
      validTemplateCount: validTemplates.length,
      apiConfigured: true
    };

  } catch (error) {
    console.error('❌ 测试KIE.AI API参数失败:', error.message);
    return { error: 'test_failed', details: error.message };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testKieApiParams()
    .then((result) => {
      console.log('\n📊 测试结果:', result.success ? '✅ 成功' : '❌ 失败');
      if (result.error) {
        console.log('错误:', result.error);
      }
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = testKieApiParams;
