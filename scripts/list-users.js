const db = require('../config/database');

/**
 * 列出數據庫中的所有用戶
 */

async function listUsers() {
  try {
    console.log('👥 獲取數據庫中的所有用戶...');

    // 獲取所有用戶
    const result = await db.query('SELECT * FROM users ORDER BY id');
    const users = result.rows || [];
    
    if (users.length === 0) {
      console.log('📭 數據庫中沒有用戶');
      return;
    }

    console.log(`\n📋 找到 ${users.length} 個用戶:`);
    console.log('============================================');
    
    for (const user of users) {
      console.log(`ID: ${user.id}`);
      console.log(`  姓名: ${user.display_name}`);
      console.log(`  LINE ID: ${user.line_user_id}`);
      console.log(`  狀態: ${user.current_state || 'none'}`);
      console.log(`  創建時間: ${user.created_at}`);
      
      // 檢查是否有訂閱
      try {
        const subscription = await db.getUserSubscription(user.id);
        if (subscription) {
          console.log(`  訂閱: ${subscription.plan_type} (${subscription.status})`);
          console.log(`  配額: ${subscription.videos_used_this_month}/${subscription.monthly_quota}`);
        } else {
          console.log(`  訂閱: 無`);
        }
      } catch (error) {
        console.log(`  訂閱: 檢查失敗`);
      }
      
      console.log('');
    }
    console.log('============================================');

  } catch (error) {
    console.error('❌ 獲取用戶列表失敗:', error);
    throw error;
  }
}

// 執行腳本
if (require.main === module) {
  listUsers()
    .then(() => {
      console.log('🎉 用戶列表獲取完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { listUsers }; 