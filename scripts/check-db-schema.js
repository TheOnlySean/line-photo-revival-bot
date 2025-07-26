const db = require('../config/database');

/**
 * 檢查數據庫表結構
 */

async function checkDatabaseSchema() {
  try {
    console.log('🔍 檢查數據庫表結構...');

    // 檢查 users 表結構
    console.log('\n👥 Users 表結構:');
    const usersSchema = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    for (const column of usersSchema.rows) {
      console.log(`  ${column.column_name}: ${column.data_type} ${column.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    }

    // 檢查 subscriptions 表結構
    console.log('\n💳 Subscriptions 表結構:');
    const subscriptionsSchema = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      ORDER BY ordinal_position
    `);
    
    if (subscriptionsSchema.rows.length === 0) {
      console.log('  ❌ subscriptions 表不存在');
    } else {
      for (const column of subscriptionsSchema.rows) {
        console.log(`  ${column.column_name}: ${column.data_type} ${column.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      }
    }

    // 檢查所有表
    console.log('\n📋 所有表:');
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    for (const table of tables.rows) {
      console.log(`  - ${table.table_name}`);
    }

  } catch (error) {
    console.error('❌ 檢查數據庫結構失敗:', error);
    throw error;
  }
}

// 執行腳本
if (require.main === module) {
  checkDatabaseSchema()
    .then(() => {
      console.log('\n🎉 數據庫結構檢查完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { checkDatabaseSchema }; 