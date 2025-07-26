const { stripe, stripeConfig } = require('../../config/stripe-config');
const db = require('../../config/database');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = stripeConfig.webhookSecret;

  let event;

  try {
    // 驗證 webhook 簽名
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Stripe webhook 事件驗證成功:', event.type);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 處理不同的事件類型
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
        
      default:
        console.log(`未處理的事件類型: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ 處理 webhook 事件失敗:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// 處理結帳完成事件
async function handleCheckoutCompleted(session) {
  try {
    console.log('💳 結帳完成:', session.id);
    
    const { userId, planType, videoCount } = session.metadata;
    
    if (!userId) {
      console.error('❌ 缺少用戶ID在結帳會話中');
      return;
    }

    // 確保用戶存在
    const user = await db.ensureUserExists(userId);
    
    // 獲取 Stripe 訂閱信息
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    
    // 根據計劃類型設置配額
    const planConfig = stripeConfig.plans[planType];
    const monthlyQuota = planConfig ? planConfig.videoCount : parseInt(videoCount || '0');

    // 創建或更新訂閱記錄
    await db.upsertSubscription(user.id, {
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      planType: planType,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      monthlyVideoQuota: monthlyQuota,
      videosUsedThisMonth: 0 // 新訂閱從0開始
    });

    console.log('✅ 訂閱創建成功:', {
      userId: user.id,
      planType,
      monthlyQuota,
      subscriptionId: session.subscription
    });

    // 發送歡迎通知
    await sendSubscriptionWelcomeNotification(userId, planType, monthlyQuota);

  } catch (error) {
    console.error('❌ 處理結帳完成失敗:', error);
    throw error;
  }
}

// 處理付款成功事件（每月續費）
async function handlePaymentSucceeded(invoice) {
  try {
    console.log('💰 付款成功:', invoice.id);

    if (!invoice.subscription) {
      console.log('⚠️ 不是訂閱付款，跳過處理');
      return;
    }

    // 獲取訂閱信息
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const subscriptionRecord = await db.getSubscriptionByStripeId(subscription.id);

    if (!subscriptionRecord) {
      console.error('❌ 找不到對應的訂閱記錄:', subscription.id);
      return;
    }

    // 重置月度配額（新的計費週期開始）
    await db.resetMonthlyQuota(subscriptionRecord.user_id);

    // 更新訂閱信息
    await db.upsertSubscription(subscriptionRecord.user_id, {
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      planType: subscriptionRecord.plan_type,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      monthlyVideoQuota: subscriptionRecord.monthly_video_quota,
      videosUsedThisMonth: 0 // 重置為0
    });

    console.log('✅ 月度配額重置成功:', {
      userId: subscriptionRecord.user_id,
      planType: subscriptionRecord.plan_type,
      quota: subscriptionRecord.monthly_video_quota
    });

    // 發送配額重置通知
    await sendQuotaResetNotification(subscriptionRecord.line_user_id, subscriptionRecord.monthly_video_quota);

  } catch (error) {
    console.error('❌ 處理付款成功失敗:', error);
    throw error;
  }
}

// 處理訂閱創建事件
async function handleSubscriptionCreated(subscription) {
  try {
    console.log('📋 訂閱創建:', subscription.id);
    
    // 更新訂閱狀態
    const subscriptionRecord = await db.getSubscriptionByStripeId(subscription.id);
    
    if (subscriptionRecord) {
      await db.upsertSubscription(subscriptionRecord.user_id, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        planType: subscriptionRecord.plan_type,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        monthlyVideoQuota: subscriptionRecord.monthly_video_quota,
        videosUsedThisMonth: subscriptionRecord.videos_used_this_month || 0
      });

      console.log('✅ 訂閱狀態更新成功');
    }

  } catch (error) {
    console.error('❌ 處理訂閱創建失敗:', error);
    throw error;
  }
}

// 處理訂閱更新事件
async function handleSubscriptionUpdated(subscription) {
  try {
    console.log('🔄 訂閱更新:', subscription.id);

    const subscriptionRecord = await db.getSubscriptionByStripeId(subscription.id);
    
    if (subscriptionRecord) {
      await db.upsertSubscription(subscriptionRecord.user_id, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        planType: subscriptionRecord.plan_type,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        monthlyVideoQuota: subscriptionRecord.monthly_video_quota,
        videosUsedThisMonth: subscriptionRecord.videos_used_this_month || 0
      });

      console.log('✅ 訂閱更新處理完成');

      // 如果訂閱被暫停或過期，發送通知
      if (subscription.status === 'past_due' || subscription.status === 'canceled') {
        await sendSubscriptionIssueNotification(subscriptionRecord.line_user_id, subscription.status);
      }
    }

  } catch (error) {
    console.error('❌ 處理訂閱更新失敗:', error);
    throw error;  
  }
}

// 處理訂閱取消事件
async function handleSubscriptionCancelled(subscription) {
  try {
    console.log('❌ 訂閱取消:', subscription.id);

    const subscriptionRecord = await db.getSubscriptionByStripeId(subscription.id);
    
    if (subscriptionRecord) {
      await db.upsertSubscription(subscriptionRecord.user_id, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        planType: subscriptionRecord.plan_type,
        status: 'canceled',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        monthlyVideoQuota: 0, // 取消後配額為0
        videosUsedThisMonth: subscriptionRecord.videos_used_this_month || 0
      });

      console.log('✅ 訂閱取消處理完成');

      // 發送取消通知
      await sendSubscriptionCancelledNotification(subscriptionRecord.line_user_id);
    }

  } catch (error) {
    console.error('❌ 處理訂閱取消失敗:', error);
    throw error;
  }
}

// 發送訂閱歡迎通知
async function sendSubscriptionWelcomeNotification(lineUserId, planType, quota) {
  try {
    // TODO: 實現 LINE 通知邏輯
    console.log('📤 發送歡迎通知:', { lineUserId, planType, quota });
    
    // 這裡可以調用 LINE Bot API 發送歡迎消息
    // 例如：歡迎加入 XX 計劃！您每月可以生成 XX 個視頻。
    
  } catch (error) {
    console.error('❌ 發送歡迎通知失敗:', error);
  }
}

// 發送配額重置通知
async function sendQuotaResetNotification(lineUserId, quota) {
  try {
    console.log('📤 發送配額重置通知:', { lineUserId, quota });
    
    // TODO: 實現 LINE 通知邏輯
    // 例如：您的月度視頻配額已重置！本月可生成 XX 個視頻。
    
  } catch (error) {
    console.error('❌ 發送配額重置通知失敗:', error);
  }
}

// 發送訂閱問題通知
async function sendSubscriptionIssueNotification(lineUserId, status) {
  try {
    console.log('📤 發送訂閱問題通知:', { lineUserId, status });
    
    // TODO: 實現 LINE 通知邏輯
    // 例如：您的訂閱付款遇到問題，請檢查付款方式。
    
  } catch (error) {
    console.error('❌ 發送訂閱問題通知失敗:', error);
  }
}

// 發送訂閱取消通知
async function sendSubscriptionCancelledNotification(lineUserId) {
  try {
    console.log('📤 發送訂閱取消通知:', lineUserId);
    
    // TODO: 實現 LINE 通知邏輯
    // 例如：您的訂閱已取消。感謝您的使用！
    
  } catch (error) {
    console.error('❌ 發送訂閱取消通知失敗:', error);
  }
} 