const axios = require('axios');
const lineConfig = require('../../config/line-config');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const kieConfig = lineConfig.kieAi;
    const testImageUrl = 'https://example.com/test-image.jpg';
    const testPrompt = 'gentle waving motion with warm smile';
    
    const requestData = {
      image_url: testImageUrl,
      prompt: testPrompt,
      duration: 10,
      model: 'runway-gen3'
    };

    const headers = {
      'Authorization': `Bearer ${kieConfig.apiKey}`,
      'Content-Type': 'application/json'
    };

    // 尝试多个可能的API端点
    const possibleEndpoints = [
      '/runway/generate',          // 当前使用
      '/api/runway/generate',      // 有api前缀
      '/v1/runway/generate',       // 有版本前缀
      '/api/v1/runway/generate',   // 完整路径
      '/runway/gen',               // 简短版本
      '/api/runway/gen',           // 简短版本+api
      '/v1/runway/gen',            // 简短版本+v1
      '/api/v1/runway/gen',        // 简短版本+完整
      '/generate',                 // 最简版本
      '/api/generate',             // 最简+api
      '/v1/generate',              // 最简+v1
      '/api/v1/generate'           // 最简+完整
    ];

    const results = {};
    
    for (const endpoint of possibleEndpoints) {
      try {
        const apiUrl = `${kieConfig.baseUrl}${endpoint}`;
        console.log(`🔗 测试端点: ${apiUrl}`);
        
        const response = await axios.post(apiUrl, requestData, {
          headers,
          timeout: 10000,
          validateStatus: () => true // 接受所有状态码
        });

        results[endpoint] = {
          status: response.status,
          success: response.status < 400,
          data: response.data ? (typeof response.data === 'string' ? response.data.substring(0, 200) : response.data) : null,
          headers: response.headers['content-type']
        };

        if (response.status < 400) {
          console.log(`✅ 端点 ${endpoint} 可能正确: ${response.status}`);
        }

      } catch (error) {
        results[endpoint] = {
          status: error.response?.status || 'ERROR',
          success: false,
          error: error.message,
          axiosError: error.code || 'UNKNOWN'
        };
      }
    }

    // 总结结果
    const successfulEndpoints = Object.entries(results)
      .filter(([, result]) => result.success)
      .map(([endpoint]) => endpoint);

    const potentialEndpoints = Object.entries(results)
      .filter(([, result]) => result.status !== 404 && result.status !== 'ERROR')
      .map(([endpoint, result]) => ({ endpoint, status: result.status }));

    res.status(200).json({
      success: true,
      message: '端点测试完成',
      config: {
        baseUrl: kieConfig.baseUrl,
        hasApiKey: !!kieConfig.apiKey,
        apiKeyStart: kieConfig.apiKey.substring(0, 8) + '...'
      },
      testResults: results,
      summary: {
        totalTested: possibleEndpoints.length,
        successfulEndpoints,
        potentialEndpoints,
        recommendation: successfulEndpoints.length > 0 
          ? `使用端点: ${successfulEndpoints[0]}`
          : potentialEndpoints.length > 0
            ? `可能的端点: ${potentialEndpoints[0].endpoint} (状态: ${potentialEndpoints[0].status})`
            : '没有找到可用的端点，可能需要检查API密钥或baseUrl'
      }
    });

  } catch (error) {
    console.error('❌ 端点测试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}; 