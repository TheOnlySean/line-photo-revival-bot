const db = require('../config/database');

/**
 * 為指定用戶添加訂閱記錄
 */

async function addUserSubscription(userId, planType = 'standard') {
  try {
    console.log(`🔄 為用戶 ID ${userId} 添加 ${planType} 訂閱...`);

    // 首先檢查用戶是否存在
    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows && result.rows.length > 0 ? result.rows[0] : null;
    
    if (!user) {
      console.error(`❌ 用戶 ID ${userId} 不存在`);
      return;
    }

    console.log(`✅ 找到用戶: ${user.display_name} (LINE ID: ${user.line_user_id})`);

    // 檢查是否已有訂閱
    const existingSubscription = await db.getUserSubscription(userId);
    if (existingSubscription) {
      console.log(`⚠️  用戶已有訂閱: ${existingSubscription.plan_type} (狀態: ${existingSubscription.status})`);
      console.log('是否要更新現有訂閱？');
    }

    // 設置訂閱參數
    const subscriptionData = {
      standard: {
        plan_type: 'standard',
        monthly_quota: 100,
        price_amount: 2980,
        stripe_subscription_id: `sub_manual_${Date.now()}`, // 手動創建的訂閱ID
        stripe_customer_id: `cus_manual_${userId}`,
        status: 'active'
      },
      trial: {
        plan_type: 'trial',
        monthly_quota: 8,
        price_amount: 300,
        stripe_subscription_id: `sub_manual_${Date.now()}`,
        stripe_customer_id: `cus_manual_${userId}`,
        status: 'active'
      }
    };

    const plan = subscriptionData[planType];
    if (!plan) {
      console.error(`❌ 無效的計劃類型: ${planType}`);
      return;
    }

    // 計算訂閱週期（30天）
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    // 準備訂閱記錄
    const subscriptionRecord = {
      user_id: userId,
      plan_type: plan.plan_type,
      status: plan.status,
      monthly_video_quota: plan.monthly_quota, // 修正欄位名稱
      videos_used_this_month: 0, // 重置為0
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      stripe_subscription_id: plan.stripe_subscription_id,
      stripe_customer_id: plan.stripe_customer_id,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    // 如果已有訂閱，更新；否則插入
    if (existingSubscription) {
      console.log('🔄 更新現有訂閱...');
      
      const updateQuery = `
        UPDATE subscriptions 
        SET 
          plan_type = $1,
          status = $2,
          monthly_video_quota = $3,
          videos_used_this_month = $4,
          current_period_start = $5,
          current_period_end = $6,
          updated_at = $7
        WHERE user_id = $8
        RETURNING *
      `;
      
      const result = await db.query(updateQuery, [
        subscriptionRecord.plan_type,
        subscriptionRecord.status,
        subscriptionRecord.monthly_video_quota,
        subscriptionRecord.videos_used_this_month,
        subscriptionRecord.current_period_start,
        subscriptionRecord.current_period_end,
        subscriptionRecord.updated_at,
        userId
      ]);

      console.log('✅ 訂閱更新成功！');
      console.log('更新後的訂閱信息:', result.rows[0]);
    } else {
      console.log('➕ 創建新訂閱...');
      
      const insertQuery = `
        INSERT INTO subscriptions (
          user_id, plan_type, status, monthly_video_quota, videos_used_this_month,
          current_period_start, current_period_end,
          stripe_subscription_id, stripe_customer_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      
      const result = await db.query(insertQuery, [
        subscriptionRecord.user_id,
        subscriptionRecord.plan_type,
        subscriptionRecord.status,
        subscriptionRecord.monthly_video_quota,
        subscriptionRecord.videos_used_this_month,
        subscriptionRecord.current_period_start,
        subscriptionRecord.current_period_end,
        subscriptionRecord.stripe_subscription_id,
        subscriptionRecord.stripe_customer_id,
        subscriptionRecord.created_at,
        subscriptionRecord.updated_at
      ]);

      console.log('✅ 訂閱創建成功！');
      console.log('新訂閱信息:', result.rows[0]);
    }

    // 顯示訂閱摘要
    console.log('\n📋 訂閱摘要:');
    console.log('============================================');
    console.log(`用戶: ${user.display_name} (ID: ${userId})`);
    console.log(`計劃: ${plan.plan_type.toUpperCase()}`);
    console.log(`月配額: ${plan.monthly_quota} 個視頻`);
    console.log(`已使用: 0 個視頻`);
    console.log(`價格: ¥${plan.price_amount}/月`);
    console.log(`週期: ${now.toISOString().split('T')[0]} ~ ${periodEnd.toISOString().split('T')[0]}`);
    console.log(`狀態: ${plan.status}`);
    console.log('============================================');

  } catch (error) {
    console.error('❌ 添加訂閱失敗:', error);
    throw error;
  }
}

// 執行腳本
if (require.main === module) {
  const userId = process.argv[2];
  const planType = process.argv[3] || 'standard';

  if (!userId) {
    console.error('❌ 請提供用戶ID');
    console.error('使用方法: node scripts/add-user-subscription.js <用戶ID> [計劃類型]');
    console.error('例如: node scripts/add-user-subscription.js 7 standard');
    process.exit(1);
  }

  addUserSubscription(parseInt(userId), planType)
    .then(() => {
      console.log('🎉 訂閱設置完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { addUserSubscription }; 