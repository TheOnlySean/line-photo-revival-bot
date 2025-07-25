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
  console.log('💳 結帳完成:', session.id);
  
  const { userId, planType, videoCount } = session.metadata;
  
  if (!userId || userId === 'anonymous') {
    console.log('⚠️ 匿名用戶完成支付，跳過用戶更新');
    return;
  }

  try {
    // 更新用戶訂閱信息
    await updateUserSubscription(userId, {
      stripeCustomerId: session.customer,
      stripeSessionId: session.id,
      planType: planType,
      videoCount: parseInt(videoCount),
      subscriptionStatus: 'active',
      subscriptionId: session.subscription,
      paymentStatus: 'paid'
    });

    console.log('✅ 用戶訂閱信息更新成功:', userId);
    
    // 發送 LINE 通知（如果可能）
    await sendPaymentSuccessNotification(userId, planType);
    
  } catch (error) {
    console.error('❌ 更新用戶訂閱失敗:', error);
  }
}

// 處理支付成功事件（定期訂閱續費）
async function handlePaymentSucceeded(invoice) {
  console.log('💰 支付成功:', invoice.id);
  
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const { userId, planType, videoCount } = subscription.metadata;
  
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    // 重新設置用戶的月度視頻配額
    await resetUserVideoQuota(userId, parseInt(videoCount));
    
    // 更新支付狀態
    await updateUserSubscription(userId, {
      paymentStatus: 'paid',
      lastPaymentDate: new Date().toISOString(),
      nextBillingDate: new Date(invoice.lines.data[0].period.end * 1000).toISOString()
    });

    console.log('✅ 用戶配額重置成功:', userId);
    
  } catch (error) {
    console.error('❌ 處理定期支付失敗:', error);
  }
}

// 處理訂閱創建事件
async function handleSubscriptionCreated(subscription) {
  console.log('📅 訂閱創建:', subscription.id);
  
  const { userId, planType, videoCount } = subscription.metadata;
  
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    await updateUserSubscription(userId, {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('❌ 處理訂閱創建失敗:', error);
  }
}

// 處理訂閱更新事件
async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 訂閱更新:', subscription.id);
  
  const { userId } = subscription.metadata;
  
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    await updateUserSubscription(userId, {
      subscriptionStatus: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('❌ 處理訂閱更新失敗:', error);
  }
}

// 處理訂閱取消事件
async function handleSubscriptionCancelled(subscription) {
  console.log('❌ 訂閱取消:', subscription.id);
  
  const { userId } = subscription.metadata;
  
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    await updateUserSubscription(userId, {
      subscriptionStatus: 'cancelled',
      cancelledAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 處理訂閱取消失敗:', error);
  }
}

// 更新用戶訂閱信息
async function updateUserSubscription(userId, subscriptionData) {
  // 這裡需要根據您的數據庫結構實現
  // 暫時使用現有的 updateUserCredits，後續需要擴展用戶表結構
  
  if (subscriptionData.videoCount) {
    // 根據訂閱方案設置用戶積分/配額
    const credits = subscriptionData.videoCount;
    await db.updateUserCredits(userId, credits, true); // true 表示設置絕對值而不是增減
  }
  
  // TODO: 擴展用戶表以存儲完整的訂閱信息
  console.log('💾 更新用戶訂閱信息:', { userId, ...subscriptionData });
}

// 重置用戶視頻配額
async function resetUserVideoQuota(userId, videoCount) {
  await db.updateUserCredits(userId, videoCount, true);
}

// 發送支付成功通知到 LINE
async function sendPaymentSuccessNotification(userId, planType) {
  try {
    // 這裡需要獲取 LINE Bot 實例並發送消息
    // 暫時只記錄日誌
    console.log('📱 應發送 LINE 通知:', { userId, planType });
    
    // TODO: 實現 LINE 通知邏輯
    // const MessageHandler = require('../../services/message-handler');
    // const messageHandler = new MessageHandler();
    // await messageHandler.sendPaymentSuccessMessage(userId, planType);
    
  } catch (error) {
    console.error('❌ 發送 LINE 通知失敗:', error);
  }
}

// 配置原始請求體
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
} 