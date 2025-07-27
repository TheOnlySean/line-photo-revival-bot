const { stripe, stripeConfig } = require('../../config/stripe-config');
const db = require('../../config/database');

module.exports = async function handler(req, res) {
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
    console.log('📋 Session metadata:', session.metadata);
    console.log('📋 Session client_reference_id:', session.client_reference_id);
    
    // 优先使用client_reference_id（从URL参数传递的用户ID）
    let userId = session.client_reference_id;
    let planType = null;
    let monthlyQuota = null;
    
    // 如果没有client_reference_id，尝试从metadata获取
    if (!userId && session.metadata) {
      userId = session.metadata.userId;
      planType = session.metadata.planType;
      monthlyQuota = session.metadata.monthlyQuota;
    }
    
    if (!userId) {
      console.error('❌ 缺少用戶ID在結帳會話中');
      return;
    }

    console.log(`👤 处理用户 ${userId} 的订阅`);

    // 通过数据库ID查找用户
    const result = await db.query('SELECT * FROM users WHERE id = $1', [parseInt(userId)]);
    const user = result.rows[0];
    
    if (!user) {
      console.error('❌ 找不到用户:', userId);
      return;
    }

    console.log(`👤 找到用户: ID=${user.id}, LINE=${user.line_user_id}, Name=${user.display_name}`);
    
    // 獲取 Stripe 訂閱信息
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    
    console.log('📊 Stripe订阅信息:', {
      id: subscription.id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end
    });

    // 从订阅的价格信息推断计划类型和配额
    if (!planType || !monthlyQuota) {
      const priceId = subscription.items.data[0]?.price?.id;
      if (priceId === process.env.STRIPE_TRIAL_PRICE_ID) {
        planType = 'trial';
        monthlyQuota = 8;
      } else if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) {
        planType = 'standard';
        monthlyQuota = 100;
      } else {
        // 默认值
        planType = 'trial';
        monthlyQuota = 8;
        console.warn('⚠️ 无法确定计划类型，使用默认值');
      }
    } else {
      monthlyQuota = parseInt(monthlyQuota);
    }

    console.log(`📋 计划信息: ${planType}, 配额: ${monthlyQuota}`);

    // 創建或更新訂閱記錄
    const subscriptionRecord = await db.upsertSubscription(user.id, {
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      planType: planType,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      monthlyVideoQuota: monthlyQuota,
      videosUsedThisMonth: 0, // 新訂閱從0開始
      cancelAtPeriodEnd: false // 新订阅默认不取消
    });

    console.log('✅ 訂閱創建成功:', {
      userId: user.id,
      lineUserId: user.line_user_id,
      planType,
      monthlyQuota: monthlyQuota,
      subscriptionId: session.subscription,
      subscriptionRecord: subscriptionRecord
    });

    // 發送歡迎通知
    if (user.line_user_id) {
      await sendSubscriptionWelcomeNotification(user.line_user_id, planType, monthlyQuota);
    } else {
      console.warn('⚠️ 没有LINE用户ID，无法发送欢迎通知');
    }

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
      videosUsedThisMonth: 0, // 重置為0
      cancelAtPeriodEnd: false // 续费后重置取消状态
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
        videosUsedThisMonth: subscriptionRecord.videos_used_this_month || 0,
        cancelAtPeriodEnd: false // 新创建订阅默认不取消
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
    console.log('🔄 訂閱更新:', subscription.id, {
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end
    });

    const subscriptionRecord = await db.getSubscriptionByStripeId(subscription.id);

    if (subscriptionRecord) {
      // 依据价格 ID 推断新的计划类型与配额
      let planType = subscriptionRecord.plan_type;
      let monthlyQuota = subscriptionRecord.monthly_video_quota;

      try {
        const priceId = subscription.items.data[0]?.price?.id;
        if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) {
          planType = 'standard';
          monthlyQuota = 100;
        } else if (priceId === process.env.STRIPE_TRIAL_PRICE_ID) {
          planType = 'trial';
          monthlyQuota = 8;
        }
      } catch (e) {
        console.warn('⚠️ 无法解析订阅价格ID:', e);
      }

      // 检查是否设置了 cancel_at_period_end
      const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
      
      await db.upsertSubscription(subscriptionRecord.user_id, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        planType,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        monthlyVideoQuota: monthlyQuota,
        videosUsedThisMonth: subscriptionRecord.videos_used_this_month || 0,
        cancelAtPeriodEnd
      });

      console.log('✅ 訂閱更新處理完成', {
        planType,
        status: subscription.status,
        cancelAtPeriodEnd
      });

      // 处理不同的更新情况
      if (cancelAtPeriodEnd && !subscriptionRecord.cancel_at_period_end) {
        // 用户刚刚取消订阅（设置了 cancel_at_period_end）
        const periodEnd = new Date(subscription.current_period_end * 1000);
        await sendSubscriptionCancellationScheduledNotification(subscriptionRecord.line_user_id, periodEnd);
      } else if (planType !== subscriptionRecord.plan_type) {
        // 计划类型发生变化（升级或降级）
        await sendSubscriptionWelcomeNotification(subscriptionRecord.line_user_id, planType, monthlyQuota);
      }

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
    console.log('🚫 訂閱取消 (不续费):', subscription.id);

    const subscriptionRecord = await db.getSubscriptionByStripeId(subscription.id);
    
    if (subscriptionRecord) {
      // 取消订阅 = 不续费，但当前周期仍然有效
      // 用户可以继续使用到 current_period_end
      await db.upsertSubscription(subscriptionRecord.user_id, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        planType: subscriptionRecord.plan_type,
        status: 'canceled', // 标记为已取消，但服务继续到期结束
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        monthlyVideoQuota: subscriptionRecord.monthly_video_quota, // 保持当前配额到期结束
        videosUsedThisMonth: subscriptionRecord.videos_used_this_month || 0,
        cancelAtPeriodEnd: false // 已完全取消，不再是预定状态
      });

      const periodEnd = new Date(subscription.current_period_end * 1000);
      console.log(`✅ 訂閱取消處理完成 - 服务继续到: ${periodEnd.toLocaleDateString()}`);

      // 發送取消通知
      await sendSubscriptionCancelledNotification(subscriptionRecord.line_user_id, periodEnd);
    }

  } catch (error) {
    console.error('❌ 處理訂閱取消失敗:', error);
    throw error;
  }
}

// 發送訂閱歡迎通知
async function sendSubscriptionWelcomeNotification(lineUserId, planType, quota) {
  try {
    console.log('📤 發送歡迎通知:', { lineUserId, planType, quota });
    
    const LineAdapter = require('../../adapters/line-adapter');
    const MessageTemplates = require('../../utils/message-templates');
    const lineAdapter = new LineAdapter();
    
    const planName = planType === 'trial' ? 'お試しプラン' : 'スタンダードプラン';
    const welcomeMessage = MessageTemplates.createTextMessage(
      `🎉 ありがとうございます！\n\n${planName}のお申し込みが完了いたしました。\n\n📊 月間利用枠: ${quota}本\n\n早速、写真から動画を生成してお楽しみください！`
    );
    
    await lineAdapter.pushMessage(lineUserId, welcomeMessage);
    console.log('✅ 歡迎通知發送成功');
    
  } catch (error) {
    console.error('❌ 發送歡迎通知失敗:', error);
  }
}

// 發送配額重置通知
async function sendQuotaResetNotification(lineUserId, quota) {
  try {
    console.log('📤 發送配額重置通知:', { lineUserId, quota });
    
    const LineAdapter = require('../../adapters/line-adapter');
    const MessageTemplates = require('../../utils/message-templates');
    const lineAdapter = new LineAdapter();
    
    const resetMessage = MessageTemplates.createTextMessage(
      `🔄 月間利用枠がリセットされました！\n\n📊 今月の利用枠: ${quota}本\n\n新しい月が始まりました。引き続き動画生成をお楽しみください！`
    );
    
    await lineAdapter.pushMessage(lineUserId, resetMessage);
    console.log('✅ 配額重置通知発送成功');
    
  } catch (error) {
    console.error('❌ 發送配額重置通知失敗:', error);
  }
}

// 發送訂閱問題通知
async function sendSubscriptionIssueNotification(lineUserId, status) {
  try {
    console.log('📤 發送訂閱問題通知:', { lineUserId, status });
    
    const LineAdapter = require('../../adapters/line-adapter');
    const MessageTemplates = require('../../utils/message-templates');
    const lineAdapter = new LineAdapter();
    
    let message = '';
    if (status === 'past_due') {
      message = '⚠️ お支払いに関するお知らせ\n\nサブスクリプションのお支払いが確認できておりません。\n\nサービスを継続してご利用いただくため、お支払い方法をご確認ください。';
    } else if (status === 'canceled') {
      message = '❌ サブスクリプション停止のお知らせ\n\nお支払いの問題により、サブスクリプションが停止されました。\n\nサービスを再開するには、新しいプランにお申し込みください。';
    }
    
    const issueMessage = MessageTemplates.createTextMessage(message);
    await lineAdapter.pushMessage(lineUserId, issueMessage);
    console.log('✅ 訂閱問題通知發送成功');
    
  } catch (error) {
    console.error('❌ 發送訂閱問題通知失敗:', error);
  }
}

// 發送訂閱取消通知
async function sendSubscriptionCancelledNotification(lineUserId, periodEnd) {
  try {
    console.log('📤 發送訂閱取消通知:', { lineUserId, periodEnd });
    
    const LineAdapter = require('../../adapters/line-adapter');
    const MessageTemplates = require('../../utils/message-templates');
    const lineAdapter = new LineAdapter();
    
    const cancelMessage = MessageTemplates.createTextMessage(
      `❌ サブスクリプション解約完了\n\nサブスクリプションを解約いたしました。\n\nサービスは ${periodEnd.toLocaleDateString()} まで継続いたします。\n\nご利用いただき、ありがとうございました。\n\nまたのご利用をお待ちしております。`
    );
    
    await lineAdapter.pushMessage(lineUserId, cancelMessage);
    console.log('✅ 訂閱取消通知發送成功');
    
  } catch (error) {
    console.error('❌ 發送訂閱取消通知失敗:', error);
  }
}

// 發送訂閱取消預定通知（cancel_at_period_end = true）
async function sendSubscriptionCancellationScheduledNotification(lineUserId, periodEnd) {
  try {
    console.log('📤 發送訂閱取消預定通知:', { lineUserId, periodEnd });
    
    const LineAdapter = require('../../adapters/line-adapter');
    const MessageTemplates = require('../../utils/message-templates');
    const lineAdapter = new LineAdapter();
    
    const cancelMessage = MessageTemplates.createTextMessage(
      `🚫 サブスクリプション解約予定\n\nサブスクリプションの解約をお受けいたしました。\n\nサービスは ${periodEnd.toLocaleDateString('ja-JP')} まで継続いたします。\n\n解約を取り消したい場合は、期日前にお知らせください。\n\nご利用いただき、ありがとうございます。`
    );
    
    await lineAdapter.pushMessage(lineUserId, cancelMessage);
    console.log('✅ 訂閱取消預定通知發送成功');
    
  } catch (error) {
    console.error('❌ 發送訂閱取消預定通知失敗:', error);
  }
} 