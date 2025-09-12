/**
 * 诊断fetch错误脚本
 * 模拟海报生成流程中的所有fetch操作，找出失败点
 */

const axios = require('axios');
const { put } = require('@vercel/blob');
const lineConfig = require('../config/line-config');
const db = require('../config/database');

async function diagnoseFetchError() {
  console.log('🔍 诊断fetch错误...');
  
  const testResults = [];
  
  try {
    // 1. 测试Vercel Blob存储连接
    console.log('1️⃣ 测试Vercel Blob存储...');
    try {
      const testBuffer = Buffer.from('test image data');
      const testFileName = `test-fetch-diagnosis-${Date.now()}.txt`;
      
      const blob = await put(testFileName, testBuffer, {
        access: 'public',
        token: lineConfig.blobToken
      });
      
      console.log('✅ Vercel Blob上传成功:', blob.url);
      testResults.push({ step: 1, name: 'blob_upload', status: 'success', url: blob.url });
      
      // 测试下载刚上传的文件
      const downloadResponse = await fetch(blob.url);
      if (downloadResponse.ok) {
        console.log('✅ Vercel Blob下载成功');
        testResults.push({ step: 1, name: 'blob_download', status: 'success' });
      } else {
        console.log('❌ Vercel Blob下载失败:', downloadResponse.status);
        testResults.push({ step: 1, name: 'blob_download', status: 'error', error: `HTTP ${downloadResponse.status}` });
      }
      
    } catch (blobError) {
      console.log('❌ Vercel Blob测试失败:', blobError.message);
      testResults.push({ step: 1, name: 'blob_storage', status: 'error', error: blobError.message });
    }

    // 2. 测试模板图片访问
    console.log('\n2️⃣ 测试模板图片访问...');
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
          const contentType = templateResponse.headers.get('content-type');
          const contentLength = templateResponse.headers.get('content-length');
          console.log(`✅ 模板图片可访问 - 类型: ${contentType}, 大小: ${contentLength}`);
          testResults.push({ 
            step: 2, 
            name: 'template_access', 
            status: 'success',
            template: template.template_name,
            contentType: contentType
          });
        } else {
          console.log(`❌ 模板图片不可访问: ${templateResponse.status}`);
          testResults.push({ 
            step: 2, 
            name: 'template_access', 
            status: 'error', 
            error: `HTTP ${templateResponse.status}`,
            template: template.template_name
          });
        }
      } else {
        console.log('❌ 没有找到模板');
        testResults.push({ step: 2, name: 'template_access', status: 'error', error: 'No template found' });
      }
    } catch (templateError) {
      console.log('❌ 模板图片访问测试失败:', templateError.message);
      testResults.push({ step: 2, name: 'template_access', status: 'error', error: templateError.message });
    }

    // 3. 测试KIE.AI API连接
    console.log('\n3️⃣ 测试KIE.AI API连接...');
    try {
      const kieApiKey = lineConfig.kieAi.apiKey;
      
      if (!kieApiKey) {
        console.log('❌ KIE.AI API Key未配置');
        testResults.push({ step: 3, name: 'kie_api_connection', status: 'error', error: 'API Key not configured' });
      } else {
        console.log(`🔑 API Key: ${kieApiKey.substring(0, 8)}...`);
        
        // 测试API连接（使用无效TaskID，预期404但说明连接正常）
        try {
          const response = await axios.get(
            'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=test_connection_123',
            {
              headers: {
                'Authorization': `Bearer ${kieApiKey}`
              },
              timeout: 15000
            }
          );
          
          console.log('✅ KIE.AI API响应:', response.status);
          testResults.push({ step: 3, name: 'kie_api_connection', status: 'success', httpStatus: response.status });
          
        } catch (apiError) {
          if (apiError.response && [401, 404].includes(apiError.response.status)) {
            console.log('✅ KIE.AI API连接正常（预期的404错误）');
            testResults.push({ step: 3, name: 'kie_api_connection', status: 'success', note: 'Expected 404' });
          } else {
            console.log('❌ KIE.AI API连接失败:', apiError.message);
            testResults.push({ 
              step: 3, 
              name: 'kie_api_connection', 
              status: 'error', 
              error: apiError.message,
              code: apiError.code
            });
          }
        }
      }
    } catch (kieTestError) {
      console.log('❌ KIE.AI API连接测试失败:', kieTestError.message);
      testResults.push({ step: 3, name: 'kie_api_connection', status: 'error', error: kieTestError.message });
    }

    // 4. 测试创建真实的KIE.AI任务
    console.log('\n4️⃣ 测试创建真实KIE.AI任务...');
    try {
      const template = await db.getRandomPosterTemplate();
      
      if (template) {
        console.log('🧪 尝试创建真实的KIE.AI任务...');
        
        const requestData = {
          model: 'google/nano-banana-edit',
          input: {
            prompt: 'Transform this into vintage Showa style - DIAGNOSTIC TEST',
            image_urls: [template.template_url], // 使用模板作为测试图片
            output_format: 'png',
            image_size: 'auto'
          }
        };
        
        console.log('📡 调用KIE.AI API...');
        console.log(`   URL: https://api.kie.ai/api/v1/jobs/createTask`);
        console.log(`   模板URL: ${template.template_url}`);
        
        const response = await axios.post(
          'https://api.kie.ai/api/v1/jobs/createTask',
          requestData,
          {
            headers: {
              'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        console.log('📊 KIE.AI API响应:', response.status);
        console.log('📋 响应数据:', response.data);
        
        if (response.data.code === 200 && response.data.data.taskId) {
          const taskId = response.data.data.taskId;
          console.log(`✅ KIE.AI任务创建成功: ${taskId}`);
          testResults.push({ 
            step: 4, 
            name: 'kie_task_creation', 
            status: 'success',
            taskId: taskId 
          });
          
          // 立即查询任务状态
          console.log('🔍 查询任务状态...');
          try {
            const statusResponse = await axios.get(
              `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
              {
                headers: {
                  'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`
                },
                timeout: 10000
              }
            );
            
            if (statusResponse.data.code === 200) {
              console.log(`✅ 任务状态查询成功: ${statusResponse.data.data.state}`);
              testResults.push({ 
                step: 4, 
                name: 'kie_status_query', 
                status: 'success',
                taskState: statusResponse.data.data.state 
              });
            }
          } catch (statusError) {
            console.log('❌ 任务状态查询失败:', statusError.message);
            testResults.push({ step: 4, name: 'kie_status_query', status: 'error', error: statusError.message });
          }
          
        } else {
          console.log('❌ KIE.AI任务创建失败:', response.data);
          testResults.push({ 
            step: 4, 
            name: 'kie_task_creation', 
            status: 'error', 
            response: response.data 
          });
        }
        
      } else {
        console.log('❌ 没有可用模板');
        testResults.push({ step: 4, name: 'kie_task_creation', status: 'error', error: 'No template available' });
      }
      
    } catch (createError) {
      console.log('❌ 创建KIE.AI任务失败:', createError.message);
      
      let errorDetails = {
        step: 4, 
        name: 'kie_task_creation', 
        status: 'error', 
        error: createError.message
      };
      
      if (createError.code) {
        errorDetails.code = createError.code;
        console.log(`   错误代码: ${createError.code}`);
      }
      
      if (createError.response) {
        errorDetails.httpStatus = createError.response.status;
        errorDetails.responseData = createError.response.data;
        console.log(`   HTTP状态: ${createError.response.status}`);
        console.log(`   响应数据:`, createError.response.data);
      }
      
      testResults.push(errorDetails);
      
      // 特定错误分析
      if (createError.code === 'ECONNREFUSED') {
        console.log('🚨 分析: KIE.AI服务器拒绝连接');
      } else if (createError.code === 'ENOTFOUND') {
        console.log('🚨 分析: DNS解析失败，无法找到api.kie.ai');
      } else if (createError.code === 'ECONNABORTED') {
        console.log('🚨 分析: 请求超时');
      } else if (createError.message.includes('fetch')) {
        console.log('🚨 分析: 网络请求失败，可能是网络连接问题');
      }
    }

    // 总结
    const successCount = testResults.filter(r => r.status === 'success').length;
    const errorCount = testResults.filter(r => r.status === 'error').length;
    
    console.log(`\n📊 fetch错误诊断完成:`);
    console.log(`✅ 成功: ${successCount} 项`);
    console.log(`❌ 失败: ${errorCount} 项`);
    
    testResults.forEach(result => {
      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.status}`);
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
    });

    // 如果有网络相关错误，提供解决建议
    const networkErrors = testResults.filter(r => 
      r.error && (
        r.error.includes('fetch') || 
        r.error.includes('ECONNREFUSED') || 
        r.error.includes('ENOTFOUND') ||
        r.error.includes('timeout')
      )
    );
    
    if (networkErrors.length > 0) {
      console.log('\n🔧 网络错误解决建议:');
      console.log('1. 检查Vercel函数的网络权限');
      console.log('2. 验证KIE.AI服务状态: https://api.kie.ai');
      console.log('3. 检查DNS解析是否正常');
      console.log('4. 考虑增加重试机制');
    }

    return {
      success: errorCount === 0,
      results: testResults,
      networkIssues: networkErrors.length > 0
    };

  } catch (error) {
    console.error('❌ fetch错误诊断失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  diagnoseFetchError()
    .then((result) => {
      console.log('\n📊 诊断结果:', result.success ? '✅ 无网络问题' : '❌ 发现网络问题');
      if (result.networkIssues) {
        console.log('⚠️ 检测到网络相关问题，需要进一步调查');
      }
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = diagnoseFetchError;
