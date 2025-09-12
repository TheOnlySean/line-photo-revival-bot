/**
 * 检查当前进行中的海报任务API
 * 查看生产环境中正在进行的海报任务状态
 */

const db = require('../../config/database');
const axios = require('axios');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  try {
    console.log('🔍 检查当前进行中的海报任务...');
    
    // 1. 查找所有进行中的海报任务
    const activeTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.status = 'processing'
      ORDER BY pt.created_at DESC
    `);
    
    console.log(`📊 找到 ${activeTasks.rows.length} 个进行中的海报任务`);
    
    if (activeTasks.rows.length === 0) {
      return res.json({
        success: true,
        message: '当前没有进行中的海报任务',
        activeTasks: [],
        timestamp: new Date().toISOString()
      });
    }

    const taskDiagnostics = [];
    
    // 2. 检查每个任务的详细状态
    for (const task of activeTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);
      
      const taskInfo = {
        taskId: task.id,
        lineUserId: task.line_user_id,
        displayName: task.display_name,
        step: task.step,
        elapsedTime: `${elapsedMinutes}分${elapsedSeconds}秒`,
        elapsedMs: elapsedTime,
        createdAt: task.created_at,
        kieTaskIds: {
          step1: task.kie_task_id_step1,
          step2: task.kie_task_id_step2
        }
      };
      
      // 3. 检查KIE.AI任务状态（如果有TaskID）
      const kieAi = {
        apiKey: lineConfig.kieAi.apiKey,
        baseUrl: 'https://api.kie.ai',
        queryTaskEndpoint: '/api/v1/jobs/recordInfo'
      };
      
      // 检查当前步骤的KIE.AI任务
      const currentKieTaskId = task.step === 1 ? task.kie_task_id_step1 : task.kie_task_id_step2;
      
      if (currentKieTaskId && kieAi.apiKey) {
        try {
          console.log(`🔍 检查KIE.AI任务: ${currentKieTaskId}`);
          
          const kieResponse = await axios.get(
            `${kieAi.baseUrl}${kieAi.queryTaskEndpoint}?taskId=${currentKieTaskId}`,
            {
              headers: {
                'Authorization': `Bearer ${kieAi.apiKey}`
              },
              timeout: 10000
            }
          );
          
          if (kieResponse.data.code === 200) {
            const kieTaskData = kieResponse.data.data;
            
            taskInfo.kieStatus = {
              state: kieTaskData.state,
              model: kieTaskData.model,
              createTime: new Date(kieTaskData.createTime).toLocaleString(),
              updateTime: new Date(kieTaskData.updateTime).toLocaleString(),
              hasResult: !!kieTaskData.resultJson,
              failCode: kieTaskData.failCode,
              failMsg: kieTaskData.failMsg
            };
            
            // 分析KIE.AI任务状态
            switch (kieTaskData.state) {
              case 'success':
                taskInfo.analysis = '✅ KIE.AI任务已成功，但我们的轮询可能有问题';
                taskInfo.recommendation = '检查轮询逻辑';
                break;
              case 'fail':
                taskInfo.analysis = '❌ KIE.AI任务失败';
                taskInfo.recommendation = '检查失败原因并清理任务';
                break;
              case 'waiting':
              case 'queuing':
              case 'generating':
                taskInfo.analysis = `⏳ KIE.AI仍在处理 (${kieTaskData.state})`;
                taskInfo.recommendation = elapsedTime > 180000 ? '任务可能卡住，建议清理' : '继续等待';
                break;
              default:
                taskInfo.analysis = `🤔 未知状态: ${kieTaskData.state}`;
                taskInfo.recommendation = '需要进一步调查';
            }
            
            console.log(`📊 KIE.AI状态: ${kieTaskData.state} - ${taskInfo.analysis}`);
            
          } else {
            taskInfo.kieStatus = {
              error: `KIE.AI API返回错误: ${kieResponse.data.code}`,
              message: kieResponse.data.message
            };
            taskInfo.analysis = '❌ 无法查询KIE.AI任务状态';
          }
          
        } catch (kieError) {
          taskInfo.kieStatus = {
            error: 'KIE.AI查询失败',
            details: kieError.message
          };
          taskInfo.analysis = '❌ KIE.AI API连接失败';
          console.error(`❌ 查询KIE.AI任务失败: ${kieError.message}`);
        }
      } else {
        taskInfo.analysis = 'ℹ️ 没有KIE.AI TaskID，任务可能刚开始';
      }
      
      // 判断是否需要清理
      if (elapsedTime > 300000) { // 超过5分钟
        taskInfo.needsCleanup = true;
        taskInfo.analysis += ' - 建议清理';
      }
      
      taskDiagnostics.push(taskInfo);
    }

    return res.json({
      success: true,
      message: `找到 ${activeTasks.rows.length} 个进行中的海报任务`,
      activeTasks: taskDiagnostics,
      summary: {
        totalActive: activeTasks.rows.length,
        needsCleanup: taskDiagnostics.filter(t => t.needsCleanup).length,
        hasKieErrors: taskDiagnostics.filter(t => t.kieStatus?.error).length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 检查当前海报任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
