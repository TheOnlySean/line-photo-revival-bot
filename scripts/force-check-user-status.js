/**
 * 强制检查用户状态脚本
 * 检查用户的真实状态和最新任务
 */

const db = require('../config/database');

async function forceCheckUserStatus() {
  console.log('🔍 强制检查用户状态...');
  
  const lineUserId = 'U23ea34c52091796e999d10f150460c78';
  
  try {
    // 1. 检查用户基本状态
    console.log('1️⃣ 检查用户基本状态...');
    const user = await db.query(`
      SELECT id, line_user_id, display_name, current_state, updated_at
      FROM users 
      WHERE line_user_id = $1
    `, [lineUserId]);
    
    if (user.rows.length > 0) {
      const userInfo = user.rows[0];
      console.log(`👤 用户: ${userInfo.line_user_id} (${userInfo.display_name})`);
      console.log(`📊 状态: ${userInfo.current_state}`);
      console.log(`🕐 更新时间: ${userInfo.updated_at}`);
    } else {
      console.log('❌ 用户不存在');
      return;
    }

    // 2. 检查最新的poster_tasks记录（最近1小时）
    console.log('\n2️⃣ 检查最新的海报任务记录...');
    const posterTasks = await db.query(`
      SELECT * FROM poster_tasks 
      WHERE line_user_id = $1 
      AND created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 5
    `, [lineUserId]);
    
    console.log(`📊 最近1小时找到 ${posterTasks.rows.length} 个海报任务`);
    
    if (posterTasks.rows.length > 0) {
      posterTasks.rows.forEach((task, index) => {
        const elapsed = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 60000);
        console.log(`${index + 1}. 任务${task.id}: ${task.status}, ${elapsed}分钟前, 步骤${task.step}`);
        if (task.kie_task_id_step1) console.log(`   KIE TaskID1: ${task.kie_task_id_step1}`);
        if (task.kie_task_id_step2) console.log(`   KIE TaskID2: ${task.kie_task_id_step2}`);
        if (task.error_message) console.log(`   错误: ${task.error_message}`);
      });
    } else {
      console.log('❌ 没有找到最近的海报任务记录');
      console.log('🚨 这说明任务创建可能失败了！');
    }

    // 3. 检查配额状态
    console.log('\n3️⃣ 检查配额状态...');
    const quota = await db.query(`
      SELECT s.monthly_poster_quota, s.posters_used_this_month, s.plan_type
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      WHERE u.line_user_id = $1 AND s.status = 'active'
    `, [lineUserId]);
    
    if (quota.rows.length > 0) {
      const q = quota.rows[0];
      const remaining = q.monthly_poster_quota === -1 ? '无限' : (q.monthly_poster_quota - q.posters_used_this_month);
      console.log(`💰 配额: ${q.plan_type}, 剩余: ${remaining}/${q.monthly_poster_quota === -1 ? '无限' : q.monthly_poster_quota}`);
    }

    // 4. 检查是否有运行超过5分钟的processing任务（可能是新的僵尸任务）
    console.log('\n4️⃣ 检查是否有新的卡住任务...');
    const longRunningTasks = await db.query(`
      SELECT id, status, step, created_at,
             kie_task_id_step1, kie_task_id_step2
      FROM poster_tasks 
      WHERE line_user_id = $1 
      AND status = 'processing'
      AND created_at < NOW() - INTERVAL '5 minutes'
    `, [lineUserId]);
    
    if (longRunningTasks.rows.length > 0) {
      console.log(`🚨 发现 ${longRunningTasks.rows.length} 个可能卡住的任务：`);
      longRunningTasks.rows.forEach(task => {
        const elapsed = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 60000);
        console.log(`   任务${task.id}: 运行${elapsed}分钟, 步骤${task.step}, KIE TaskID: ${task.kie_task_id_step1 || task.kie_task_id_step2 || '无'}`);
      });
    } else {
      console.log('✅ 没有发现卡住的任务');
    }

    return {
      userExists: user.rows.length > 0,
      userState: user.rows[0]?.current_state,
      recentTasksCount: posterTasks.rows.length,
      longRunningTasksCount: longRunningTasks.rows.length
    };

  } catch (error) {
    console.error('❌ 强制检查失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  forceCheckUserStatus()
    .then((result) => {
      console.log('\n📊 检查结果:', result);
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = forceCheckUserStatus;
