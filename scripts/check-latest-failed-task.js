/**
 * 检查最新失败任务的参数
 * 查看传给KIE.AI的具体参数，诊断模板URL问题
 */

const db = require('../config/database');
const axios = require('axios');
const lineConfig = require('../config/line-config');

async function checkLatestFailedTask() {
  console.log('🔍 检查最新的海报任务...');
  
  try {
    // 1. 查找最新的任务（包括失败和进行中的）
    const latestTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.created_at > NOW() - INTERVAL '1 hour'
      ORDER BY pt.created_at DESC
      LIMIT 5
    `);
    
    console.log(`📊 最近1小时找到 ${latestTasks.rows.length} 个任务`);
    
    if (latestTasks.rows.length === 0) {
      console.log('❌ 没有找到最近的任务');
      return;
    }

    // 2. 检查每个任务
    for (const task of latestTasks.rows) {
      const elapsedTime = Date.now() - new Date(task.created_at).getTime();
      const elapsedMinutes = Math.floor(elapsedTime / 60000);
      const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);
      
      console.log(`\n📋 任务 ${task.id} - 用户: ${task.line_user_id}`);
      console.log(`状态: ${task.status}, 步骤: ${task.step}`);
      console.log(`时间: ${elapsedMinutes}分${elapsedSeconds}秒前创建`);
      
      // 检查KIE.AI任务ID
      const kieTaskIds = [task.kie_task_id_step1, task.kie_task_id_step2].filter(id => id);
      console.log(`KIE.AI TaskID数量: ${kieTaskIds.length}`);
      
      if (kieTaskIds.length > 0) {
        // 检查每个KIE.AI任务的详细参数
        for (let i = 0; i < kieTaskIds.length; i++) {
          const kieTaskId = kieTaskIds[i];
          const stepNum = i + 1;
          
          console.log(`\n🔍 检查第${stepNum}步的KIE.AI任务: ${kieTaskId}`);
          
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
              
              console.log(`📊 KIE.AI状态: ${kieTaskData.state}`);
              
              // 解析参数 - 这是关键！
              if (kieTaskData.param) {
                try {
                  const params = JSON.parse(kieTaskData.param);
                  console.log(`📝 第${stepNum}步参数:`);
                  console.log(`   Prompt: ${params.input.prompt.substring(0, 100)}...`);
                  console.log(`   图片数量: ${params.input.image_urls.length}`);
                  
                  // 重点检查图片URL
                  params.input.image_urls.forEach((url, index) => {
                    const isValid = url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
                    const urlType = index === 0 ? 'image1 (模板)' : `image${index + 1}`;
                    console.log(`   ${urlType}: ${isValid ? '✅ 有效' : '❌ 无效'}`);
                    console.log(`     URL: ${url.substring(0, 80)}...`);
                    
                    if (!isValid) {
                      console.log(`🚨 发现问题！第${stepNum}步使用了无效的图片URL！`);
                    }
                  });
                  
                  console.log(`   输出格式: ${params.input.output_format}`);
                  console.log(`   图片尺寸: ${params.input.image_size}`);
                  
                } catch (parseError) {
                  console.log(`❌ 解析参数失败: ${parseError.message}`);
                  console.log(`原始参数: ${kieTaskData.param.substring(0, 200)}...`);
                }
              }
              
              // 检查结果或失败信息
              if (kieTaskData.state === 'success' && kieTaskData.resultJson) {
                const resultJson = JSON.parse(kieTaskData.resultJson);
                console.log(`✅ 生成成功，结果URL: ${resultJson.resultUrls?.[0]?.substring(0, 80)}...`);
              } else if (kieTaskData.state === 'fail') {
                console.log(`❌ KIE.AI失败:`);
                console.log(`   失败代码: ${kieTaskData.failCode}`);
                console.log(`   失败原因: ${kieTaskData.failMsg}`);
              }
              
            } else {
              console.log(`❌ KIE.AI API返回错误: ${kieResponse.data.code}`);
            }
            
          } catch (kieError) {
            console.log(`❌ 查询KIE.AI任务失败: ${kieError.message}`);
          }
        }
      } else {
        console.log('ℹ️ 该任务没有KIE.AI TaskID - 可能卡在提交阶段');
      }
    }

    // 3. 验证当前模板状态
    console.log('\n🎨 验证当前模板状态...');
    const currentTemplates = await db.query(`
      SELECT template_name, template_url, is_active
      FROM poster_templates 
      WHERE is_active = true
      ORDER BY template_name
    `);
    
    console.log(`📊 当前活跃模板: ${currentTemplates.rows.length} 个`);
    currentTemplates.rows.forEach(template => {
      const isValid = template.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
      console.log(`${isValid ? '✅' : '❌'} ${template.template_name}: ${template.template_url.substring(0, 80)}...`);
    });

    // 4. 测试随机模板选择
    console.log('\n🎲 测试随机模板选择...');
    const randomTemplate = await db.getRandomPosterTemplate();
    if (randomTemplate) {
      const isValid = randomTemplate.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
      console.log(`随机选中: ${randomTemplate.template_name}`);
      console.log(`URL有效性: ${isValid ? '✅ 有效' : '❌ 无效'}`);
      console.log(`完整URL: ${randomTemplate.template_url}`);
    } else {
      console.log('❌ 随机选择失败');
    }

  } catch (error) {
    console.error('❌ 检查最新任务失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkLatestFailedTask()
    .then(() => {
      console.log('\n✅ 检查完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = checkLatestFailedTask;
