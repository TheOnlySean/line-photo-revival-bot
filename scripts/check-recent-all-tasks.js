/**
 * 检查最近所有海报任务（包括完成和失败的）
 * 查看用户最近的海报生成活动
 */

const db = require('../config/database');
const axios = require('axios');
const lineConfig = require('../config/line-config');

async function checkRecentAllTasks() {
  console.log('🔍 检查最近所有海报任务...');
  
  try {
    // 1. 查找最近30分钟的所有任务
    const recentTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY pt.created_at DESC
    `);
    
    console.log(`📊 最近30分钟找到 ${recentTasks.rows.length} 个任务`);
    
    if (recentTasks.rows.length === 0) {
      console.log('❌ 没有找到最近的任务');
      
      // 检查是否有任务创建失败
      console.log('\n🔍 检查用户状态...');
      const userState = await db.query(`
        SELECT line_user_id, current_state, updated_at
        FROM users 
        WHERE line_user_id = 'U23ea34c52091796e999d10f150460c78'
      `);
      
      if (userState.rows.length > 0) {
        const user = userState.rows[0];
        console.log(`用户状态: ${user.current_state}`);
        console.log(`最后更新: ${user.updated_at}`);
      }
      
      return;
    }

    // 2. 详细检查每个任务
    for (const task of recentTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);
      
      console.log(`\n📋 任务 ${task.id} - ${elapsedMinutes}分${elapsedSeconds}秒前`);
      console.log(`👤 用户: ${task.line_user_id}`);
      console.log(`📊 状态: ${task.status}, 步骤: ${task.step}`);
      console.log(`🖼️ 原图: ${task.original_image_url ? '有' : '无'}`);
      console.log(`🎨 昭和图: ${task.showa_image_url ? '有' : '无'}`);
      console.log(`📸 最终图: ${task.final_poster_url ? '有' : '无'}`);
      console.log(`🏷️ 使用模板: ${task.template_used || '未选择'}`);
      
      if (task.error_message) {
        console.log(`❌ 错误信息: ${task.error_message}`);
      }
      
      // 检查KIE.AI任务状态
      const kieTaskIds = [task.kie_task_id_step1, task.kie_task_id_step2].filter(id => id);
      console.log(`🔗 KIE.AI TaskID: ${kieTaskIds.length} 个`);
      
      if (kieTaskIds.length > 0) {
        for (let i = 0; i < kieTaskIds.length; i++) {
          const kieTaskId = kieTaskIds[i];
          const stepNum = i + 1;
          
          console.log(`\n🔍 KIE.AI第${stepNum}步任务: ${kieTaskId}`);
          
          try {
            const kieResponse = await axios.get(
              `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${kieTaskId}`,
              {
                headers: {
                  'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`
                },
                timeout: 10000
              }
            );
            
            if (kieResponse.data.code === 200) {
              const kieTaskData = kieResponse.data.data;
              
              console.log(`   状态: ${kieTaskData.state}`);
              console.log(`   创建: ${new Date(kieTaskData.createTime).toLocaleString()}`);
              console.log(`   更新: ${new Date(kieTaskData.updateTime).toLocaleString()}`);
              
              if (kieTaskData.completeTime) {
                console.log(`   完成: ${new Date(kieTaskData.completeTime).toLocaleString()}`);
              }
              
              const kieElapsed = (kieTaskData.updateTime - kieTaskData.createTime) / 1000;
              console.log(`   KIE.AI处理时间: ${kieElapsed.toFixed(1)}秒`);
              
              switch (kieTaskData.state) {
                case 'success':
                  console.log('✅ KIE.AI任务成功！');
                  if (kieTaskData.resultJson) {
                    const resultJson = JSON.parse(kieTaskData.resultJson);
                    console.log(`   结果URL: ${resultJson.resultUrls?.[0]?.substring(0, 80)}...`);
                    console.log('🚨 问题: KIE.AI成功了，但我们的轮询没有处理成功状态！');
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
              
              // 检查传递的参数
              if (kieTaskData.param) {
                try {
                  const params = JSON.parse(kieTaskData.param);
                  console.log(`\n📝 第${stepNum}步参数检查:`);
                  console.log(`   图片数量: ${params.input.image_urls.length}`);
                  
                  params.input.image_urls.forEach((url, index) => {
                    const isValid = url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
                    console.log(`   图片${index + 1}: ${isValid ? '✅ 有效' : '❌ 无效'} - ${url.substring(0, 80)}...`);
                  });
                  
                } catch (parseError) {
                  console.log(`❌ 参数解析失败: ${parseError.message}`);
                }
              }
              
            } else {
              console.log(`❌ KIE.AI API返回错误: ${kieResponse.data.code}`);
            }
            
          } catch (kieError) {
            console.log(`❌ 查询KIE.AI任务失败: ${kieError.message}`);
            if (kieError.response) {
              console.log(`   HTTP状态: ${kieError.response.status}`);
            }
          }
        }
      } else {
        console.log('❌ 关键问题: 任务没有KIE.AI TaskID！');
        console.log('   这说明调用KIE.AI API时出错，或者TaskID没有正确保存');
      }
    }

  } catch (error) {
    console.error('❌ 检查任务失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkRecentAllTasks()
    .then(() => {
      console.log('\n✅ 检查完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = checkRecentAllTasks;
