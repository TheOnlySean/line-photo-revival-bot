/**
 * 创建海报任务跟踪表
 * 用于在serverless环境中跟踪海报生成状态
 */

const db = require('../config/database');

async function createPosterTasksTable() {
  console.log('🗄️ 创建海报任务跟踪表...');
  
  try {
    // 创建海报任务表
    await db.query(`
      CREATE TABLE IF NOT EXISTS poster_tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        line_user_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'processing',
        step INTEGER DEFAULT 1,
        original_image_url TEXT,
        showa_image_url TEXT,
        final_poster_url TEXT,
        template_used VARCHAR(100),
        kie_task_id_step1 VARCHAR(255),
        kie_task_id_step2 VARCHAR(255),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_poster_tasks_user 
      ON poster_tasks(line_user_id)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_poster_tasks_status 
      ON poster_tasks(status)
    `);

    console.log('✅ 海报任务表创建成功');

    // 验证表结构
    const tableInfo = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'poster_tasks' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 poster_tasks 表结构:');
    tableInfo.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });

    return { success: true };

  } catch (error) {
    console.error('❌ 创建海报任务表失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  createPosterTasksTable()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = createPosterTasksTable;
