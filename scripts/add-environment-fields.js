/**
 * 数据库环境字段迁移脚本
 * 为主要数据表添加 environment 字段以支持开发/生产环境区分
 */

const db = require('../config/database');

async function addEnvironmentFields() {
  
  console.log('🚀 开始添加环境标识字段...');
  
  try {
    // 为 users 表添加环境字段
    console.log('📊 为 users 表添加 environment 字段...');
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'development'
    `);
    
    // 为 videos 表添加环境字段
    console.log('🎬 为 videos 表添加 environment 字段...');
    await db.query(`
      ALTER TABLE videos 
      ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'development'
    `);
    
    // 为 subscriptions 表添加环境字段
    console.log('💳 为 subscriptions 表添加 environment 字段...');
    await db.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'development'
    `);
    
    // 创建索引提高查询效率
    console.log('📈 创建环境字段索引...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_environment 
      ON users(environment)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_videos_environment 
      ON videos(environment)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_environment 
      ON subscriptions(environment)
    `);
    
    // 验证字段添加成功
    console.log('✅ 验证环境字段添加情况...');
    
    const usersColumns = await db.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'environment'
    `);
    
    const videosColumns = await db.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'videos' AND column_name = 'environment'
    `);
    
    const subscriptionsColumns = await db.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' AND column_name = 'environment'
    `);
    
    console.log('📋 环境字段添加结果:');
    console.log('- users.environment:', usersColumns.rows.length > 0 ? '✅ 已添加' : '❌ 失败');
    console.log('- videos.environment:', videosColumns.rows.length > 0 ? '✅ 已添加' : '❌ 失败');
    console.log('- subscriptions.environment:', subscriptionsColumns.rows.length > 0 ? '✅ 已添加' : '❌ 失败');
    
    // 统计现有数据
    const userCount = await db.query('SELECT COUNT(*) FROM users');
    const videoCount = await db.query('SELECT COUNT(*) FROM videos');
    const subscriptionCount = await db.query('SELECT COUNT(*) FROM subscriptions');
    
    console.log('\n📊 现有数据统计:');
    console.log(`- Users: ${userCount.rows[0].count} 条记录`);
    console.log(`- Videos: ${videoCount.rows[0].count} 条记录`);
    console.log(`- Subscriptions: ${subscriptionCount.rows[0].count} 条记录`);
    
    console.log('\n🎉 环境字段迁移完成！');
    console.log('📝 所有现有记录默认标记为 "development" 环境');
    console.log('🚀 新的生产环境数据将自动标记为 "production"');
    
  } catch (error) {
    console.error('❌ 环境字段迁移失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  addEnvironmentFields()
    .then(() => {
      console.log('✅ 迁移脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = addEnvironmentFields; 