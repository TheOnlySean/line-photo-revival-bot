const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  try {
    console.log('🧪 Stripe API 測試開始');
    
    // 測試基本配置
    const configTest = {
      hasSecretKey: !!stripeConfig.secretKey,
      hasPublishableKey: !!stripeConfig.publishableKey,
      secretKeyLength: stripeConfig.secretKey ? stripeConfig.secretKey.length : 0,
      publishableKeyLength: stripeConfig.publishableKey ? stripeConfig.publishableKey.length : 0,
      plansAvailable: Object.keys(stripeConfig.plans),
    };
    
    console.log('📋 配置檢查:', configTest);

    // 測試 Stripe API 連接
    let stripeConnectionTest = null;
    try {
      // 嘗試獲取賬戶信息
      const account = await stripe.accounts.retrieve();
      stripeConnectionTest = {
        success: true,
        accountId: account.id,
        country: account.country,
        currency: account.default_currency,
        name: account.business_profile?.name || 'N/A'
      };
      console.log('✅ Stripe 連接成功:', stripeConnectionTest);
    } catch (stripeError) {
      stripeConnectionTest = {
        success: false,
        error: stripeError.message,
        code: stripeError.code,
        type: stripeError.type
      };
      console.error('❌ Stripe 連接失敗:', stripeConnectionTest);
    }

    // 測試創建一個簡單的 Checkout Session
    let checkoutTest = null;
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'jpy',
              product_data: {
                name: 'Test Product',
              },
              unit_amount: 100,
            },
            quantity: 1,
          },
        ],
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        metadata: {
          test: 'true'
        }
      });

      checkoutTest = {
        success: true,
        sessionId: session.id,
        url: session.url ? 'Available' : 'Not Available',
        mode: session.mode,
        currency: session.currency
      };
      console.log('✅ Checkout 測試成功:', checkoutTest);
    } catch (checkoutError) {
      checkoutTest = {
        success: false,
        error: checkoutError.message,
        code: checkoutError.code,
        type: checkoutError.type
      };
      console.error('❌ Checkout 測試失敗:', checkoutError);
    }

    // 返回完整的診斷報告
    res.status(200).json({
      timestamp: new Date().toISOString(),
      config: configTest,
      stripeConnection: stripeConnectionTest,
      checkoutTest: checkoutTest,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        hasVercelUrl: !!process.env.VERCEL_URL
      }
    });

  } catch (error) {
    console.error('❌ 診斷測試失敗:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
} 