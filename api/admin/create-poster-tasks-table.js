/**
 * 生产环境创建海报任务表API
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== 'create-poster-tasks-table-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🗄️ 创建生产环境海报任务表...');
    
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

    // 验证表结构
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'poster_tasks'
      )
    `);

    return res.json({
      success: true,
      message: '海报任务表创建成功',
      tableExists: tableCheck.rows[0].exists,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 创建海报任务表失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
