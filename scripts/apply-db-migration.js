const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  try {
    console.log('🔄 开始应用数据库迁移...');
    
    // 读取 SQL 文件
    const sqlPath = path.join(__dirname, 'add-cancel-at-period-end-field.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // 执行迁移
    await db.query(sql);
    
    console.log('✅ 数据库迁移成功完成');
    console.log('- 添加了 cancel_at_period_end 字段');
    console.log('- 设置了默认值 FALSE');
    
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
  } finally {
    process.exit(0);
  }
}

applyMigration(); 