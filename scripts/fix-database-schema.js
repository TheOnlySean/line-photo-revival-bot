const db = require('../config/database.js');

async function fixDatabaseSchema() {
  try {
    console.log('🔧 开始修复数据库schema...');
    
    // 添加缺失的字段
    const alterQuery = `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS current_state VARCHAR(50),
      ADD COLUMN IF NOT EXISTS state_data TEXT;
    `;
    
    await db.query(alterQuery);
    console.log('✅ 成功添加 current_state 和 state_data 字段');
    
    // 验证字段是否添加成功
    const verifyQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('current_state', 'state_data');
    `;
    
    const result = await db.query(verifyQuery);
    console.log('📊 字段验证结果:', result.rows);
    
    if (result.rows.length === 2) {
      console.log('🎉 数据库schema修复完成！');
    } else {
      console.log('⚠️ 字段添加可能未完全成功，请检查数据库');
    }
    
  } catch (error) {
    console.error('❌ 修复数据库schema失败:', error);
  } finally {
    await db.close();
  }
}

// 运行修复脚本
if (require.main === module) {
  fixDatabaseSchema();
}

module.exports = fixDatabaseSchema; 