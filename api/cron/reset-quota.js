const db = require('../../config/database');

/**
 * 配額重置 Cron Job
 * 每天檢查所有活躍訂閱，對到期的用戶重置配額並延展週期
 */
export default async function handler(req, res) {
  console.log('🔄 開始執行配額重置任務...');
  
  try {
    // 獲取所有需要處理的過期訂閱（當前週期已結束）
    const expiredSubscriptions = await db.query(`
      SELECT 
        id, user_id, plan_type, videos_used_this_month, status,
        current_period_start, current_period_end, cancel_at_period_end,
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

    console.log(`📊 找到 ${expiredSubscriptions.length} 個需要處理的過期訂閱`);

    let resetCount = 0;
    let cancelledCount = 0;
    
    for (const subscription of expiredSubscriptions) {
      try {
        // 檢查是否為取消的訂閱（cancel_at_period_end = true）
        if (subscription.cancel_at_period_end) {
          // 用戶已取消訂閱，將狀態改為 canceled，不重置配額
          await db.query(`
            UPDATE subscriptions 
            SET 
              status = 'canceled',
              videos_used_this_month = 0,  -- 清零配額，不再可用
              updated_at = NOW()
            WHERE id = $1
          `, [subscription.id]);

          console.log(`🚫 用戶 ${subscription.user_id} 訂閱已取消 (${subscription.plan_type} plan)`);
          console.log(`   週期結束: ${subscription.current_period_end}`);
          console.log(`   狀態: active → canceled`);
          console.log(`   配額: ${subscription.videos_used_this_month} → 0 (已停用)`);
          
          cancelledCount++;
        } else {
          // 正常用戶，重置配額並延展週期
          const newPeriodStart = subscription.current_period_end;
          const newPeriodEnd = new Date(subscription.current_period_end);
          newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

          await db.query(`
            UPDATE subscriptions 
            SET 
              videos_used_this_month = 0,
              current_period_start = $1,
              current_period_end = $2,
              updated_at = NOW()
            WHERE id = $3
          `, [newPeriodStart, newPeriodEnd, subscription.id]);

          // 设置用户通知标记，在下次交互时提醒配额已重置
          await db.query(`
            UPDATE users 
            SET current_prompt = 'QUOTA_RESET_NOTIFICATION'
            WHERE id = $1
          `, [subscription.user_id]);

          console.log(`✅ 用戶 ${subscription.user_id} 配額已重置 (${subscription.plan_type} plan)`);
          console.log(`   舊週期: ${subscription.current_period_start} ~ ${subscription.current_period_end}`);
          console.log(`   新週期: ${newPeriodStart} ~ ${newPeriodEnd.toISOString()}`);
          console.log(`   配額: ${subscription.videos_used_this_month} → 0 (月限額: ${subscription.monthly_quota})`);
          console.log(`   📢 已設置配額重置通知標記`);
          
          resetCount++;
        }
      } catch (error) {
        console.error(`❌ 處理用戶 ${subscription.user_id} 訂閱失敗:`, error);
      }
    }

    // 統計信息
    const stats = {
      timestamp: new Date().toISOString(),
      totalChecked: expiredSubscriptions.length,
      resetCount: resetCount,
      cancelledCount: cancelledCount,
      details: expiredSubscriptions.map(sub => ({
        userId: sub.user_id,
        planType: sub.plan_type,
        action: sub.cancel_at_period_end ? 'canceled' : 'reset',
        oldUsage: sub.videos_used_this_month,
        monthlyQuota: sub.monthly_quota,
        oldPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end
      }))
    };

    console.log('📈 配額處理統計:', stats);

    // 返回執行結果
    res.status(200).json({
      success: true,
      message: `配額處理完成：重置 ${resetCount} 個訂閱，取消 ${cancelledCount} 個訂閱`,
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