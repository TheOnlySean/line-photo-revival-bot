/**
 * 生产环境fetch错误诊断API
 * 在生产环境中测试所有fetch操作，找出失败原因
 */

const db = require('../../config/database');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  try {
    console.log('🔍 生产环境fetch错误诊断...');
    
    const testResults = [];
    const startTime = Date.now();

    // 1. 测试基础网络连接
    console.log('1️⃣ 测试基础网络连接...');
    try {
      const response = await fetch('https://httpbin.org/get', { 
        method: 'GET',
        timeout: 10000 
      });
      
      if (response.ok) {
        testResults.push({ step: 1, name: 'basic_network', status: 'success' });
        console.log('✅ 基础网络连接正常');
      } else {
        testResults.push({ step: 1, name: 'basic_network', status: 'error', httpStatus: response.status });
        console.log('❌ 基础网络连接异常:', response.status);
      }
    } catch (networkError) {
      testResults.push({ step: 1, name: 'basic_network', status: 'error', error: networkError.message });
      console.log('❌ 基础网络测试失败:', networkError.message);
    }

    // 2. 测试KIE.AI API域名解析和连接
    console.log('2️⃣ 测试KIE.AI API连接...');
    try {
      if (!process.env.KIE_AI_API_KEY) {
        testResults.push({ step: 2, name: 'kie_api_key', status: 'error', error: 'API Key not configured' });
        console.log('❌ KIE.AI API Key未配置');
      } else {
        console.log(`🔑 API Key: ${process.env.KIE_AI_API_KEY.substring(0, 8)}...`);
        
        // 测试API连接
        const kieResponse = await fetch(
          'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=test_production_connection',
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${process.env.KIE_AI_API_KEY}`
            },
            timeout: 15000
          }
        );
        
        if (kieResponse.status === 404 || kieResponse.status === 200) {
          testResults.push({ step: 2, name: 'kie_api_connection', status: 'success', httpStatus: kieResponse.status });
          console.log('✅ KIE.AI API连接正常');
        } else {
          testResults.push({ step: 2, name: 'kie_api_connection', status: 'error', httpStatus: kieResponse.status });
          console.log('❌ KIE.AI API连接异常:', kieResponse.status);
        }
      }
    } catch (kieError) {
      testResults.push({ 
        step: 2, 
        name: 'kie_api_connection', 
        status: 'error', 
        error: kieError.message,
        code: kieError.code 
      });
      console.log('❌ KIE.AI API连接失败:', kieError.message);
      
      if (kieError.code) {
        console.log(`   错误代码: ${kieError.code}`);
      }
    }

    // 3. 测试Vercel Blob存储
    console.log('3️⃣ 测试Vercel Blob存储...');
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        testResults.push({ step: 3, name: 'blob_token', status: 'error', error: 'Blob token not configured' });
        console.log('❌ Vercel Blob Token未配置');
      } else {
        console.log(`🔑 Blob Token: ${process.env.BLOB_READ_WRITE_TOKEN.substring(0, 12)}...`);
        
        // 尝试上传测试文件
        const { put } = require('@vercel/blob');
        const testData = Buffer.from('Production fetch test');
        const testFileName = `production-test-${Date.now()}.txt`;
        
        const blob = await put(testFileName, testData, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN
        });
        
        testResults.push({ step: 3, name: 'blob_upload', status: 'success', url: blob.url });
        console.log('✅ Vercel Blob上传成功');
        
        // 测试下载
        const downloadResponse = await fetch(blob.url);
        if (downloadResponse.ok) {
          testResults.push({ step: 3, name: 'blob_download', status: 'success' });
          console.log('✅ Vercel Blob下载成功');
        } else {
          testResults.push({ step: 3, name: 'blob_download', status: 'error', httpStatus: downloadResponse.status });
          console.log('❌ Vercel Blob下载失败:', downloadResponse.status);
        }
      }
    } catch (blobError) {
      testResults.push({ step: 3, name: 'blob_storage', status: 'error', error: blobError.message });
      console.log('❌ Vercel Blob存储测试失败:', blobError.message);
    }

    // 4. 测试海报模板访问
    console.log('4️⃣ 测试海报模板访问...');
    try {
      const template = await db.getRandomPosterTemplate();
      
      if (template) {
        console.log(`🎨 测试模板: ${template.template_name}`);
        console.log(`📍 URL: ${template.template_url}`);
        
        const templateResponse = await fetch(template.template_url, { 
          method: 'HEAD',
          timeout: 10000 
        });
        
        if (templateResponse.ok) {
          testResults.push({ step: 4, name: 'template_access', status: 'success', template: template.template_name });
          console.log('✅ 海报模板可访问');
        } else {
          testResults.push({ 
            step: 4, 
            name: 'template_access', 
            status: 'error', 
            httpStatus: templateResponse.status,
            template: template.template_name 
          });
          console.log('❌ 海报模板不可访问:', templateResponse.status);
        }
      } else {
        testResults.push({ step: 4, name: 'template_access', status: 'error', error: 'No template found' });
        console.log('❌ 没有找到模板');
      }
    } catch (templateError) {
      testResults.push({ step: 4, name: 'template_access', status: 'error', error: templateError.message });
      console.log('❌ 模板访问测试失败:', templateError.message);
    }

    // 5. 测试真实的KIE.AI任务创建
    console.log('5️⃣ 测试真实KIE.AI任务创建...');
    try {
      const template = await db.getRandomPosterTemplate();
      
      if (template && process.env.KIE_AI_API_KEY) {
        const requestData = {
          model: 'google/nano-banana-edit',
          input: {
            prompt: 'Production environment test - transform to vintage style',
            image_urls: [template.template_url],
            output_format: 'png',
            image_size: 'auto'
          }
        };
        
        console.log('📡 创建测试任务...');
        
        const response = await fetch(
          'https://api.kie.ai/api/v1/jobs/createTask',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.KIE_AI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData),
            timeout: 30000
          }
        );
        
        const responseData = await response.json();
        
        if (response.ok && responseData.code === 200) {
          testResults.push({ 
            step: 5, 
            name: 'kie_task_creation', 
            status: 'success',
            taskId: responseData.data.taskId 
          });
          console.log(`✅ KIE.AI任务创建成功: ${responseData.data.taskId}`);
        } else {
          testResults.push({ 
            step: 5, 
            name: 'kie_task_creation', 
            status: 'error',
            httpStatus: response.status,
            responseData: responseData 
          });
          console.log('❌ KIE.AI任务创建失败:', response.status, responseData);
        }
      } else {
        testResults.push({ step: 5, name: 'kie_task_creation', status: 'error', error: 'Missing template or API key' });
      }
    } catch (createError) {
      testResults.push({ 
        step: 5, 
        name: 'kie_task_creation', 
        status: 'error', 
        error: createError.message 
      });
      console.log('❌ KIE.AI任务创建失败:', createError.message);
    }

    // 总结结果
    const successCount = testResults.filter(r => r.status === 'success').length;
    const errorCount = testResults.filter(r => r.status === 'error').length;
    const totalTime = Date.now() - startTime;
    
    return res.json({
      success: errorCount === 0,
      message: `生产环境fetch诊断完成: ${successCount} 成功, ${errorCount} 失败`,
      results: testResults,
      summary: {
        totalTests: testResults.length,
        successCount: successCount,
        errorCount: errorCount,
        totalTime: `${totalTime}ms`,
        networkHealthy: errorCount === 0
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        hasKieApiKey: !!process.env.KIE_AI_API_KEY,
        hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 生产环境fetch诊断失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
