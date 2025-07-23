const { Pool } = require('pg');

async function fixProductionDatabase() {
  // 使用生产环境数据库URL
  const productionDbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_JIjeL7Dp4YrG@ep-holy-smoke-a14e7x3f-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  
  const pool = new Pool({
    connectionString: productionDbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔧 开始修复生产环境数据库schema...');
    console.log('🔗 连接数据库:', productionDbUrl.replace(/:[^:@]*@/, ':****@'));
    
    // 首先检查当前表结构
    const checkQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY column_name;
    `;
    
    const currentSchema = await pool.query(checkQuery);
    console.log('📊 当前users表结构:', currentSchema.rows);
    
    // 检查是否已经有这些字段
    const hasCurrentState = currentSchema.rows.some(row => row.column_name === 'current_state');
    const hasStateData = currentSchema.rows.some(row => row.column_name === 'state_data');
    
    if (hasCurrentState && hasStateData) {
      console.log('✅ 字段已存在，无需修复');
      return;
    }
    
    // 添加缺失的字段
    const alterQuery = `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS current_state VARCHAR(50),
      ADD COLUMN IF NOT EXISTS state_data TEXT;
    `;
    
    await pool.query(alterQuery);
    console.log('✅ 成功添加缺失字段');
    
    // 验证修复结果
    const verifyQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('current_state', 'state_data');
    `;
    
    const result = await pool.query(verifyQuery);
    console.log('📊 修复验证结果:', result.rows);
    
    if (result.rows.length === 2) {
      console.log('🎉 生产环境数据库schema修复完成！');
    } else {
      console.log('⚠️ 修复可能不完整，请检查结果');
    }
    
  } catch (error) {
    console.error('❌ 修复生产环境数据库失败:', error);
  } finally {
    await pool.end();
  }
}

// 运行修复脚本
if (require.main === module) {
  fixProductionDatabase();
}

module.exports = fixProductionDatabase; 