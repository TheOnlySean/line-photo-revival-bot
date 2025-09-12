/**
 * 检查生产环境海报任务状态API
 * 查看生产环境数据库中的最新海报任务
 */

const db = require('../../config/database');
const axios = require('axios');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  try {
    console.log('🔍 检查生产环境海报任务状态...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      recentTasks: [],
      currentProcessingTasks: []
    };

    // 1. 查找最近10分钟的任务
    console.log('1️⃣ 查找最近10分钟的任务...');
    const recentTasks = await db.query(`
      SELECT pt.*, u.line_user_id, u.display_name,
             EXTRACT(EPOCH FROM (NOW() - pt.created_at)) as elapsed_seconds
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.created_at > NOW() - INTERVAL '10 minutes'
      ORDER BY pt.created_at DESC
    `);
    
    console.log(`📊 最近10分钟找到 ${recentTasks.rows.length} 个任务`);
    
    for (const task of recentTasks.rows) {
      const elapsedMinutes = Math.floor(task.elapsed_seconds / 60);
      const elapsedSeconds = Math.floor(task.elapsed_seconds % 60);
      
      const taskInfo = {
        id: task.id,
        lineUserId: task.line_user_id,
        status: task.status,
        step: task.step,
        elapsedTime: `${elapsedMinutes}分${elapsedSeconds}秒`,
        templateUsed: task.template_used || '未选择',
        hasOriginalUrl: !!task.original_image_url,
        hasShowaUrl: !!task.showa_image_url,
        hasFinalUrl: !!task.final_poster_url,
        kieTaskIds: {
          step1: task.kie_task_id_step1 || '无',
          step2: task.kie_task_id_step2 || '无'
        },
        errorMessage: task.error_message
      };
      
      diagnostics.recentTasks.push(taskInfo);
      
      console.log(`📋 任务${task.id}: ${task.status}, ${elapsedMinutes}分${elapsedSeconds}秒前`);
      console.log(`   步骤: ${task.step}, 模板: ${task.template_used || '未选择'}`);
      console.log(`   KIE TaskIDs: ${task.kie_task_id_step1 ? '第1步有' : '第1步无'}, ${task.kie_task_id_step2 ? '第2步有' : '第2步无'}`);
    }

    // 2. 查找当前进行中的任务
    console.log('\n2️⃣ 查找当前进行中的任务...');
    const processingTasks = await db.query(`
      SELECT pt.*, u.line_user_id,
             EXTRACT(EPOCH FROM (NOW() - pt.created_at)) as elapsed_seconds
      FROM poster_tasks pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.status = 'processing'
      ORDER BY pt.created_at DESC
      LIMIT 5
    `);
    
    console.log(`⏳ 发现 ${processingTasks.rows.length} 个进行中的任务`);
    
    for (const task of processingTasks.rows) {
      const elapsedMinutes = Math.floor(task.elapsed_seconds / 60);
      
      const taskInfo = {
        id: task.id,
        lineUserId: task.line_user_id,
        step: task.step,
        elapsedMinutes: elapsedMinutes,
        kieTaskIds: {
          step1: task.kie_task_id_step1 || '无',
          step2: task.kie_task_id_step2 || '无'
        },
        isStuck: elapsedMinutes > 5
      };
      
      diagnostics.currentProcessingTasks.push(taskInfo);
      
      console.log(`⏳ 任务${task.id}: 步骤${task.step}, 运行${elapsedMinutes}分钟`);
      console.log(`   KIE TaskID: ${task.kie_task_id_step1 || task.kie_task_id_step2 || '无'}`);
      
      if (elapsedMinutes > 5) {
        console.log('🚨 任务可能卡住');
      }
    }

    // 3. 检查生产环境模板状态
    console.log('\n3️⃣ 检查生产环境模板状态...');
    const templates = await db.query(`
      SELECT template_name, is_active, 
             template_url LIKE 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/%' as is_valid_url
      FROM poster_templates 
      ORDER BY template_name
    `);
    
    const templateStats = {
      total: templates.rows.length,
      active: templates.rows.filter(t => t.is_active).length,
      validUrls: templates.rows.filter(t => t.is_valid_url).length
    };
    
    diagnostics.templateStats = templateStats;
    
    console.log(`📊 模板统计: 总计${templateStats.total}, 活跃${templateStats.active}, 有效URL${templateStats.validUrls}`);

    // 4. 测试随机模板选择
    try {
      const randomTemplate = await db.getRandomPosterTemplate();
      diagnostics.randomTemplateTest = {
        success: !!randomTemplate,
        templateName: randomTemplate?.template_name,
        hasValidUrl: randomTemplate?.template_url?.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/')
      };
      
      if (randomTemplate) {
        console.log(`🎲 随机模板测试: ${randomTemplate.template_name} - ${diagnostics.randomTemplateTest.hasValidUrl ? '✅ 有效' : '❌ 无效'}`);
      } else {
        console.log('❌ 随机模板选择失败');
      }
    } catch (templateError) {
      diagnostics.randomTemplateTest = { success: false, error: templateError.message };
      console.log('❌ 随机模板测试错误:', templateError.message);
    }

    return res.json({
      success: true,
      message: '生产环境海报任务状态检查完成',
      diagnostics: diagnostics,
      analysis: {
        hasRecentActivity: recentTasks.rows.length > 0,
        hasProcessingTasks: processingTasks.rows.length > 0,
        hasStuckTasks: processingTasks.rows.some(t => t.elapsed_seconds > 300),
        templatesReady: templateStats.active >= 4 && templateStats.validUrls >= 4,
        systemWorking: recentTasks.rows.length > 0 || processingTasks.rows.length > 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 检查生产环境海报任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
