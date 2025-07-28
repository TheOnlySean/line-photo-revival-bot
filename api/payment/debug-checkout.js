const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId } = req.query;

    console.log('🧪 Debug Checkout 開始:', { plan, userId });

    if (!plan || !stripeConfig.plans[plan]) {
      return res.status(400).json({ 
        error: 'Invalid plan', 
        availablePlans: Object.keys(stripeConfig.plans),
        receivedPlan: plan 
      });
    }

    const planConfig = stripeConfig.plans[plan];
    console.log('📋 計劃配置:', planConfig);

    // 測試創建 subscription checkout session
    let sessionData = null;
    let sessionError = null;

    try {
      console.log('🔄 嘗試創建 Checkout Session...');
      
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'], // 暫時移除konbini
        line_items: [
          {
            price_data: {
              currency: planConfig.currency,
              product_data: {
                name: planConfig.nameJa,
                description: `月間${planConfig.videoCount}本の動画生成`
              },
              recurring: {
                interval: planConfig.interval
              },
              unit_amount: planConfig.price
            },
            quantity: 1
          }
        ],
              success_url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://line-photo-revival-bot.vercel.app'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://line-photo-revival-bot.vercel.app'}/payment/cancel`,
        metadata: {
          userId: userId || 'anonymous',
          planType: plan,
          videoCount: planConfig.videoCount.toString()
        },
        locale: 'ja'
      });

      sessionData = {
        success: true,
        sessionId: session.id,
        url: session.url,
        mode: session.mode,
        status: session.status,
        currency: session.currency,
        totalAmount: planConfig.price,
        interval: planConfig.interval,
        metadata: session.metadata
      };

      console.log('✅ Checkout Session 創建成功:', sessionData);

    } catch (error) {
      sessionError = {
        success: false,
        message: error.message,
        type: error.type,
        code: error.code,
        param: error.param,
        statusCode: error.statusCode,
        requestId: error.requestId,
        raw: error.raw || {}
      };

      console.error('❌ Checkout Session 創建失敗:', sessionError);
    }

    // 返回詳細診斷結果
    res.status(200).json({
      timestamp: new Date().toISOString(),
      request: {
        plan,
        userId,
        planConfig
      },
      sessionData,
      sessionError,
      stripeConfig: {
        plans: Object.keys(stripeConfig.plans),
        hasSecretKey: !!stripeConfig.secretKey,
        secretKeyPrefix: stripeConfig.secretKey?.substring(0, 8) + '...'
      }
    });

  } catch (error) {
    console.error('❌ Debug 過程失敗:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
} 