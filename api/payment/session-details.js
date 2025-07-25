const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // 從 Stripe 獲取會話詳情
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 獲取訂閱詳情
    let subscription = null;
    if (session.subscription) {
      subscription = await stripe.subscriptions.retrieve(session.subscription);
    }

    // 根據元數據確定計劃信息
    const { planType, videoCount } = session.metadata;
    const plan = stripeConfig.plans[planType];

    // 格式化返回數據
    const sessionDetails = {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      planName: plan ? plan.nameJa : 'Unknown Plan',
      planType: planType,
      videoCount: parseInt(videoCount) || 0,
      amount: session.amount_total || 0,
      currency: session.currency,
      customerEmail: session.customer_details?.email,
      nextBilling: subscription 
        ? new Date(subscription.current_period_end * 1000).toLocaleDateString('ja-JP')
        : 'Unknown',
      subscriptionId: session.subscription,
      subscriptionStatus: subscription?.status || 'unknown'
    };

    console.log('📋 支付會話詳情查詢:', {
      sessionId: session_id,
      planType: planType,
      amount: sessionDetails.amount
    });

    return res.status(200).json(sessionDetails);

  } catch (error) {
    console.error('❌ 獲取支付會話詳情失敗:', error);
    
    return res.status(500).json({ 
      error: 'Failed to retrieve session details',
      message: error.message 
    });
  }
} 