/**
 * 海报生成实时测试API
 * 使用真实的用户图片测试完整的海报生成流程
 */

const db = require('../../config/database');
const PosterGenerator = require('../../services/poster-generator');
const PosterImageService = require('../../services/poster-image-service');

export default async function handler(req, res) {
  try {
    console.log('🧪 开始海报生成实时测试...');
    
    const testResults = [];
    
    // 1. 初始化服务
    console.log('1️⃣ 初始化服务...');
    let posterImageService, posterGenerator;
    
    try {
      posterImageService = new PosterImageService();
      posterGenerator = new PosterGenerator(db, posterImageService);
      testResults.push({ step: 1, name: 'service_init', status: 'success' });
      console.log('✅ 服务初始化成功');
    } catch (initError) {
      testResults.push({ step: 1, name: 'service_init', status: 'error', error: initError.message });
      return res.json({ success: false, error: 'Service initialization failed', results: testResults });
    }

    // 2. 检查模板
    console.log('2️⃣ 检查模板...');
    try {
      const template = await db.getRandomPosterTemplate();
      if (template && template.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/')) {
        testResults.push({ 
          step: 2, 
          name: 'template_check', 
          status: 'success',
          template: template.template_name,
          url: template.template_url
        });
        console.log(`✅ 模板正常: ${template.template_name}`);
      } else {
        testResults.push({ step: 2, name: 'template_check', status: 'error', error: 'No valid template found' });
        return res.json({ success: false, error: 'No valid templates', results: testResults });
      }
    } catch (templateError) {
      testResults.push({ step: 2, name: 'template_check', status: 'error', error: templateError.message });
      return res.json({ success: false, error: 'Template check failed', results: testResults });
    }

    // 3. 测试创建KIE.AI任务（第一步）
    console.log('3️⃣ 测试创建KIE.AI任务...');
    try {
      // 使用一个真实的测试图片URL（从assets中选择一个）
      const testImageUrl = 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/vintage_magazine_01-8OCriw0O8bSodvw89WXy2TDKDy7580.jpg';
      
      const testPrompt = "Transform this into vintage Showa style - TEST ONLY";
      
      console.log('📡 测试调用KIE.AI API...');
      console.log(`   图片URL: ${testImageUrl}`);
      console.log(`   Prompt: ${testPrompt}`);
      
      // 测试实际的API调用
      const taskId = await posterGenerator.createKieAiTask({
        prompt: testPrompt,
        image_urls: [testImageUrl]
      });
      
      testResults.push({ 
        step: 3, 
        name: 'kie_api_call', 
        status: 'success',
        taskId: taskId 
      });
      console.log(`✅ KIE.AI任务创建成功: ${taskId}`);
      
      // 4. 立即查询任务状态
      console.log('4️⃣ 查询任务状态...');
      try {
        const statusResult = await posterGenerator.queryTaskStatus(taskId);
        
        if (statusResult.success) {
          testResults.push({ 
            step: 4, 
            name: 'task_status_query', 
            status: 'success',
            taskState: statusResult.data.state 
          });
          console.log(`✅ 任务状态查询成功: ${statusResult.data.state}`);
        } else {
          testResults.push({ 
            step: 4, 
            name: 'task_status_query', 
            status: 'error', 
            error: statusResult.error 
          });
          console.log(`❌ 任务状态查询失败: ${statusResult.error}`);
        }
      } catch (queryError) {
        testResults.push({ 
          step: 4, 
          name: 'task_status_query', 
          status: 'error', 
          error: queryError.message 
        });
        console.log(`❌ 查询任务状态出错: ${queryError.message}`);
      }
      
    } catch (apiError) {
      testResults.push({ 
        step: 3, 
        name: 'kie_api_call', 
        status: 'error', 
        error: apiError.message 
      });
      console.log(`❌ KIE.AI API调用失败: ${apiError.message}`);
      
      // 这是关键问题！如果API调用失败，我们需要知道具体原因
      if (apiError.response) {
        testResults[testResults.length - 1].httpStatus = apiError.response.status;
        testResults[testResults.length - 1].responseData = apiError.response.data;
        console.log(`HTTP状态: ${apiError.response.status}`);
        console.log(`响应数据:`, apiError.response.data);
      }
    }

    // 总结测试结果
    const successCount = testResults.filter(r => r.status === 'success').length;
    const errorCount = testResults.filter(r => r.status === 'error').length;
    
    console.log(`📊 测试完成: ${successCount} 成功, ${errorCount} 失败`);

    return res.json({
      success: errorCount === 0,
      message: `海报生成实时测试完成: ${successCount} 成功, ${errorCount} 失败`,
      results: testResults,
      summary: {
        totalTests: testResults.length,
        successCount: successCount,
        errorCount: errorCount,
        criticalError: testResults.find(r => r.name === 'kie_api_call' && r.status === 'error')
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 海报生成实时测试失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
