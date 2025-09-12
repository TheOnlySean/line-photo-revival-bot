/**
 * 检查用户当前海报任务的本地脚本
 */

const db = require('../config/database');
const axios = require('axios');
const lineConfig = require('../config/line-config');

async function checkUserCurrentTask() {
  console.log('🔍 检查当前进行中的海报任务...');
  
  try {
    // 1. 查找最近的进行中任务
    const activeTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.status = 'processing'
      AND pt.created_at > NOW() - INTERVAL '10 minutes'
      ORDER BY pt.created_at DESC
    `);
    
    console.log(`📊 找到 ${activeTasks.rows.length} 个最近的进行中任务`);
    
    if (activeTasks.rows.length === 0) {
      console.log('✅ 当前没有进行中的海报任务');
      
      // 查看最近完成或失败的任务
      const recentTasks = await db.query(`
        SELECT pt.*, u.line_user_id
        FROM poster_tasks pt
        JOIN users u ON pt.user_id = u.id
        WHERE pt.created_at > NOW() - INTERVAL '10 minutes'
        ORDER BY pt.created_at DESC
        LIMIT 3
      `);
      
      console.log(`📋 最近10分钟的任务:`);
      recentTasks.rows.forEach((task, index) => {
        const elapsed = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 60000);
        console.log(`${index + 1}. 用户: ${task.line_user_id}, 状态: ${task.status}, ${elapsed}分钟前`);
        if (task.error_message) {
          console.log(`   错误: ${task.error_message}`);
        }
      });
      
      return;
    }

    // 2. 检查每个进行中的任务
    for (const task of activeTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);
      
      console.log(`\n📋 任务详情 - ID: ${task.id}`);
      console.log(`👤 用户: ${task.line_user_id} (${task.display_name})`);
      console.log(`⏱️ 运行时间: ${elapsedMinutes}分${elapsedSeconds}秒`);
      console.log(`📊 步骤: ${task.step}`);
      console.log(`🖼️ 原图URL: ${task.original_image_url ? '有' : '无'}`);
      
      // 检查KIE.AI任务状态
      const kieAi = {
        apiKey: lineConfig.kieAi.apiKey,
        baseUrl: 'https://api.kie.ai',
        queryTaskEndpoint: '/api/v1/jobs/recordInfo'
      };
      
      const currentKieTaskId = task.step === 1 ? task.kie_task_id_step1 : task.kie_task_id_step2;
      
      if (currentKieTaskId) {
        console.log(`🔍 检查KIE.AI任务: ${currentKieTaskId}`);
        
        try {
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
            const kieElapsed = kieTaskData.updateTime ? 
              (kieTaskData.updateTime - kieTaskData.createTime) / 1000 : 
              (Date.now() - kieTaskData.createTime) / 1000;
            
            console.log(`📊 KIE.AI状态: ${kieTaskData.state}`);
            console.log(`⏱️ KIE.AI处理时间: ${kieElapsed.toFixed(1)}秒`);
            
            switch (kieTaskData.state) {
              case 'success':
                console.log('✅ KIE.AI任务已完成！我们的轮询逻辑可能有问题');
                if (kieTaskData.resultJson) {
                  const resultJson = JSON.parse(kieTaskData.resultJson);
                  console.log('🖼️ 结果URL:', resultJson.resultUrls?.[0]);
                }
                break;
              case 'fail':
                console.log('❌ KIE.AI任务失败:');
                console.log(`   失败代码: ${kieTaskData.failCode}`);
                console.log(`   失败原因: ${kieTaskData.failMsg}`);
                break;
              case 'waiting':
              case 'queuing':
              case 'generating':
                console.log(`⏳ KIE.AI仍在处理: ${kieTaskData.state}`);
                break;
            }
            
          } else {
            console.log(`❌ KIE.AI API返回错误: ${kieResponse.data.code}`);
          }
          
        } catch (kieError) {
          console.log(`❌ 查询KIE.AI失败: ${kieError.message}`);
        }
      } else {
        console.log('ℹ️ 还没有KIE.AI TaskID');
      }
      
      // 判断是否需要清理
      if (elapsedTime > 300000) { // 超过5分钟
        console.log('🚨 任务可能卡住，建议清理');
      }
    }

  } catch (error) {
    console.error('❌ 检查当前任务失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkUserCurrentTask()
    .then(() => {
      console.log('\n✅ 检查完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = checkUserCurrentTask;
