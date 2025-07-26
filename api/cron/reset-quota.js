const db = require('../../config/database');

/**
 * 配額重置 Cron Job
 * 每天檢查所有活躍訂閱，對到期的用戶重置配額並延展週期
 */
export default async function handler(req, res) {
  console.log('🔄 開始執行配額重置任務...');
  
  try {
    // 獲取所有需要重置配額的訂閱（當前週期已結束）
    const expiredSubscriptions = await db.query(`
      SELECT 
        id, user_id, plan_type, videos_used_this_month,
        current_period_start, current_period_end,
        CASE 
          WHEN plan_type = 'trial' THEN 8
          WHEN plan_type = 'standard' THEN 100
          ELSE 0
        END as monthly_quota
      FROM subscriptions 
      WHERE status = 'active' 
        AND current_period_end < NOW()
      ORDER BY current_period_end ASC
    `);

    console.log(`📊 找到 ${expiredSubscriptions.length} 個需要重置配額的訂閱`);

    let resetCount = 0;
    
    for (const subscription of expiredSubscriptions) {
      try {
        // 計算新的週期（從舊的結束日開始，延展30天）
        const newPeriodStart = subscription.current_period_end;
        const newPeriodEnd = new Date(subscription.current_period_end);
        newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

        // 重置配額並更新週期
        await db.query(`
          UPDATE subscriptions 
          SET 
            videos_used_this_month = 0,
            current_period_start = $1,
            current_period_end = $2,
            last_quota_reset_at = NOW(),
            updated_at = NOW()
          WHERE id = $3
        `, [newPeriodStart, newPeriodEnd, subscription.id]);

        console.log(`✅ 用戶 ${subscription.user_id} 配額已重置 (${subscription.plan_type} plan)`);
        console.log(`   舊週期: ${subscription.current_period_start} ~ ${subscription.current_period_end}`);
        console.log(`   新週期: ${newPeriodStart} ~ ${newPeriodEnd.toISOString()}`);
        console.log(`   配額: ${subscription.videos_used_this_month} → 0 (月限額: ${subscription.monthly_quota})`);
        
        resetCount++;
      } catch (error) {
        console.error(`❌ 重置用戶 ${subscription.user_id} 配額失敗:`, error);
      }
    }

    // 統計信息
    const stats = {
      timestamp: new Date().toISOString(),
      totalChecked: expiredSubscriptions.length,
      resetCount: resetCount,
      details: expiredSubscriptions.map(sub => ({
        userId: sub.user_id,
        planType: sub.plan_type,
        oldUsage: sub.videos_used_this_month,
        monthlyQuota: sub.monthly_quota,
        oldPeriodEnd: sub.current_period_end
      }))
    };

    console.log('📈 配額重置統計:', stats);

    // 返回執行結果
    res.status(200).json({
      success: true,
      message: `配額重置完成，共處理 ${resetCount} 個訂閱`,
      stats: stats
    });

  } catch (error) {
    console.error('❌ 配額重置任務執行失敗:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 