/**
 * 数据库海报配额字段迁移脚本
 * 为 subscriptions 表添加海报配额相关字段，与现有视频配额字段保持一致
 */

const db = require('../config/database');

async function addPosterQuotaFields() {
  
  console.log('🎨 开始添加海报配额字段...');
  
  try {
    // 为 subscriptions 表添加海报配额字段
    console.log('📊 为 subscriptions 表添加海报配额字段...');
    
    // 添加每月海报配额字段
    await db.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS monthly_poster_quota INTEGER DEFAULT 0
    `);
    
    // 添加本月已使用海报配额字段
    await db.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS posters_used_this_month INTEGER DEFAULT 0
    `);
    
    console.log('✅ 海报配额字段添加完成');
    
    // 验证字段添加成功
    console.log('🔍 验证海报配额字段添加情况...');
    
    const posterQuotaColumn = await db.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' AND column_name = 'monthly_poster_quota'
    `);
    
    const posterUsedColumn = await db.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' AND column_name = 'posters_used_this_month'
    `);
    
    console.log('📋 海报配额字段添加结果:');
    console.log('- subscriptions.monthly_poster_quota:', posterQuotaColumn.rows.length > 0 ? '✅ 已添加' : '❌ 失败');
    console.log('- subscriptions.posters_used_this_month:', posterUsedColumn.rows.length > 0 ? '✅ 已添加' : '❌ 失败');
    
    // 为现有的active订阅初始化海报配额
    console.log('\n🔧 为现有订阅初始化海报配额...');
    
    const updateResult = await db.query(`
      UPDATE subscriptions 
      SET monthly_poster_quota = CASE 
        WHEN plan_type = 'trial' THEN 8
        WHEN plan_type = 'standard' THEN -1
        ELSE 0
      END,
      posters_used_this_month = 0
      WHERE status = 'active' 
      AND (monthly_poster_quota IS NULL OR monthly_poster_quota = 0)
    `);
    
    console.log(`✅ 已为 ${updateResult.rowCount} 个活跃订阅初始化海报配额`);
    
    // 显示配额设置规则
    console.log('\n📋 海报配额设置规则:');
    console.log('- Trial计划: 8张海报/月');
    console.log('- Standard计划: 无限海报 (用-1表示)');
    
    // 统计现有订阅数据
    const subscriptionStats = await db.query(`
      SELECT 
        plan_type,
        status,
        COUNT(*) as count,
        AVG(monthly_poster_quota) as avg_poster_quota
      FROM subscriptions 
      WHERE monthly_poster_quota IS NOT NULL
      GROUP BY plan_type, status
      ORDER BY plan_type, status
    `);
    
    if (subscriptionStats.rows.length > 0) {
      console.log('\n📊 订阅海报配额统计:');
      subscriptionStats.rows.forEach(row => {
        const quotaDisplay = row.avg_poster_quota == -1 ? '无限' : row.avg_poster_quota;
        console.log(`- ${row.plan_type} (${row.status}): ${row.count}个订阅, 配额: ${quotaDisplay}`);
      });
    }
    
    // 显示现有表结构 (仅海报相关字段)
    console.log('\n📋 当前 subscriptions 表海报相关字段:');
    const allColumns = await db.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND (column_name LIKE '%poster%' OR column_name LIKE '%video%' OR column_name = 'plan_type')
      ORDER BY ordinal_position
    `);
    
    allColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });
    
    console.log('\n🎉 海报配额字段迁移完成！');
    console.log('📝 现有活跃订阅已自动设置海报配额');
    console.log('🚀 新订阅将在创建时自动分配适当的海报配额');
    
  } catch (error) {
    console.error('❌ 海报配额字段迁移失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  addPosterQuotaFields()
    .then(() => {
      console.log('✅ 海报配额迁移脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 海报配额迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = addPosterQuotaFields;
