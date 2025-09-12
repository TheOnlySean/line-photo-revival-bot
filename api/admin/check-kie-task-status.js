/**
 * 检查KIE.AI任务状态API
 * 直接查询KIE.AI API来诊断特定任务的状态
 */

const axios = require('axios');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  try {
    const taskId = req.query.taskId || req.body.taskId;
    
    if (!taskId) {
      return res.status(400).json({ 
        error: 'TaskID is required',
        usage: '?taskId=your_task_id 或者 POST {taskId: "your_task_id"}'
      });
    }

    console.log(`🔍 检查KIE.AI任务状态 - TaskID: ${taskId}`);
    
    const kieAi = {
      apiKey: lineConfig.kieAi.apiKey,
      baseUrl: 'https://api.kie.ai',
      queryTaskEndpoint: '/api/v1/jobs/recordInfo'
    };

    if (!kieAi.apiKey) {
      return res.status(500).json({
        error: 'KIE.AI API Key not configured'
      });
    }

    // 直接查询KIE.AI API
    console.log('📡 直接查询KIE.AI API...');
    const response = await axios.get(
      `${kieAi.baseUrl}${kieAi.queryTaskEndpoint}?taskId=${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${kieAi.apiKey}`
        },
        timeout: 15000 // 15秒超时
      }
    );

    const apiResult = {
      httpStatus: response.status,
      apiResponse: response.data,
      timestamp: new Date().toISOString()
    };

    // 解析响应
    let diagnosis = {};
    
    if (response.data.code === 200) {
      const taskData = response.data.data;
      
      diagnosis = {
        status: '✅ API响应正常',
        taskExists: true,
        taskState: taskData.state,
        model: taskData.model,
        createdAt: new Date(taskData.createTime).toISOString(),
        updatedAt: new Date(taskData.updateTime).toISOString(),
        hasResult: !!taskData.resultJson,
        hasFailed: !!taskData.failCode
      };

      // 根据状态分析问题
      switch (taskData.state) {
        case 'success':
          diagnosis.analysis = '✅ 任务已成功完成，KIE.AI那边正常';
          diagnosis.issue = '可能是我们的轮询逻辑没有及时捕获成功状态';
          
          // 尝试解析结果
          if (taskData.resultJson) {
            try {
              const resultJson = JSON.parse(taskData.resultJson);
              diagnosis.resultUrls = resultJson.resultUrls;
              diagnosis.analysis += '，并且有生成结果';
            } catch (parseError) {
              diagnosis.parseError = parseError.message;
            }
          }
          break;
          
        case 'fail':
          diagnosis.analysis = '❌ 任务在KIE.AI那边失败了';
          diagnosis.issue = 'KIE.AI处理失败，不是我们的问题';
          diagnosis.failCode = taskData.failCode;
          diagnosis.failMsg = taskData.failMsg;
          break;
          
        case 'waiting':
        case 'queuing':
        case 'generating':
          diagnosis.analysis = '⏳ 任务仍在KIE.AI队列中处理';
          diagnosis.issue = 'KIE.AI处理较慢，我们的90秒超时太短了';
          break;
          
        default:
          diagnosis.analysis = `🤔 未知状态: ${taskData.state}`;
          diagnosis.issue = '需要进一步调查';
      }

      // 计算处理时间
      if (taskData.createTime && taskData.updateTime) {
        const processingTime = (taskData.updateTime - taskData.createTime) / 1000;
        diagnosis.actualProcessingTime = `${processingTime.toFixed(1)}秒`;
        
        if (processingTime > 90) {
          diagnosis.timeoutReason = `KIE.AI实际处理时间${processingTime.toFixed(1)}秒，超过了我们的90秒超时设置`;
        }
      }
      
    } else {
      diagnosis = {
        status: '❌ API响应异常',
        taskExists: false,
        issue: `KIE.AI API返回异常状态: ${response.data.code}`,
        message: response.data.message
      };
    }

    console.log('📊 诊断结果:', diagnosis);

    return res.json({
      success: true,
      taskId: taskId,
      apiResult: apiResult,
      diagnosis: diagnosis,
      recommendations: diagnosis.issue ? [diagnosis.issue] : ['任务状态正常'],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 检查KIE.AI任务状态失败:', error);
    
    let errorAnalysis = {};
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorAnalysis = {
        issue: 'KIE.AI API服务器连接失败',
        analysis: '网络连接问题或KIE.AI服务暂不可用'
      };
    } else if (error.response) {
      errorAnalysis = {
        issue: `KIE.AI API返回错误: ${error.response.status}`,
        analysis: 'KIE.AI服务器返回了错误响应',
        responseData: error.response.data
      };
    } else if (error.code === 'ECONNABORTED') {
      errorAnalysis = {
        issue: '查询请求超时',
        analysis: 'KIE.AI API响应超过15秒'
      };
    } else {
      errorAnalysis = {
        issue: '未知错误',
        analysis: error.message
      };
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      errorAnalysis: errorAnalysis,
      timestamp: new Date().toISOString()
    });
  }
}
