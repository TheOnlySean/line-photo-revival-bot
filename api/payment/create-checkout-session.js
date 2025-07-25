const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { planType, userId } = req.body;

    // 驗證計劃類型
    if (!planType || !stripeConfig.plans[planType]) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const plan = stripeConfig.plans[planType];
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://line-photo-revival-bot.vercel.app';

    // 創建 Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: [
        'card',
        'konbini',          // 日本便利店支付
        'customer_balance'   // 客戶餘額（支持銀行轉帳）
      ],
      
      // 對日本用戶啟用更多支付方式
      payment_method_options: {
        konbini: {
          expires_after_days: 3 // 便利店支付3天內有效
        }
      },
      
      line_items: [
        {
          price_data: {
            currency: plan.currency,
            product_data: {
              name: plan.nameJa,
              description: `月間${plan.videoCount}本の動画生成が可能`,
              images: [
                `${baseUrl}/assets/richmenu-main.png` // 使用現有的圖片作為產品圖
              ]
            },
            recurring: {
              interval: plan.interval
            },
            unit_amount: plan.price // Stripe 使用最小貨幣單位，日元是整數
          },
          quantity: 1
        }
      ],
      
      // 成功和取消 URL
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/cancel`,
      
      // 客戶信息
      customer_creation: 'always',
      
      // 元數據，用於 webhook 處理
      metadata: {
        userId: userId || 'anonymous',
        planType: planType,
        videoCount: plan.videoCount.toString()
      },
      
      // 自動稅費計算（如果設置）
      automatic_tax: {
        enabled: false // 可以根據需要啟用
      },
      
      // 設置訂閱選項
      subscription_data: {
        metadata: {
          userId: userId || 'anonymous',
          planType: planType,
          videoCount: plan.videoCount.toString()
        }
      },
      
      // 本地化設置
      locale: 'ja', // 日語界面
      
      // 允許促銷代碼
      allow_promotion_codes: true
    });

    // 記錄支付會話創建
    console.log('💳 Stripe Checkout Session 創建成功:', {
      sessionId: session.id,
      userId: userId,
      planType: planType,
      amount: plan.price
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('❌ 創建 Stripe Checkout Session 失敗:', error);
    
    return res.status(500).json({ 
      error: 'Failed to create checkout session',
      message: error.message 
    });
  }
} 