const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  // 只允許 GET 請求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId } = req.query;

    // 驗證計劃類型
    if (!plan || !stripeConfig.plans[plan]) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const planConfig = stripeConfig.plans[plan];
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://line-photo-revival-bot.vercel.app';
    
    console.log('🚀 創建直接跳轉Stripe Checkout:', { plan, userId, baseUrl });

    // 創建 Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: [
        'card',
        'konbini',          // 日本便利店支付
        'customer_balance'   // 客戶餘額（支持銀行轉帳）
      ],
      
      // 啟用 Apple Pay 和 Google Pay
      payment_method_collection: 'always',
      
      // 對日本用戶啟用更多支付方式
      payment_method_options: {
        konbini: {
          expires_after_days: 3 // 便利店支付3天內有效
        },
        card: {
          request_three_d_secure: 'automatic' // 自動3D安全驗證
        }
      },
      
      line_items: [
        {
          price_data: {
            currency: planConfig.currency,
            product_data: {
              name: planConfig.nameJa,
              description: `月間${planConfig.videoCount}本の動画生成 - AI写真復活サービス`,
              images: [
                `${baseUrl}/logo-placeholder.svg`
              ]
            },
            recurring: {
              interval: planConfig.interval
            },
            unit_amount: planConfig.price
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
        planType: plan,
        videoCount: planConfig.videoCount.toString()
      },
      
      // 設置訂閱選項
      subscription_data: {
        description: `写真復活 - ${planConfig.nameJa}`,
        metadata: {
          userId: userId || 'anonymous',
          planType: plan,
          videoCount: planConfig.videoCount.toString(),
          service: '写真復活 AI動画生成サービス'
        }
      },
      
      // 本地化設置
      locale: 'ja', // 日語界面
      
      // 允許促銷代碼
      allow_promotion_codes: true,
      
      // 客戶信息收集
      customer_update: {
        address: 'auto',
        name: 'auto'
      },
      
      // 發票設置
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `写真復活 ${planConfig.nameJa} - 月間${planConfig.videoCount}本の動画生成`,
          metadata: {
            service: '写真復活サービス',
            plan: planConfig.nameJa
          },
          footer: 'ご利用いただき、ありがとうございます。'
        }
      },
      
      // 品牌和自定義
      custom_text: {
        submit: {
          message: '安全な決済でお支払いを完了'
        }
      }
    });

    // 記錄創建的會話
    console.log('✅ Stripe Checkout Session 創建成功，直接重定向:', {
      sessionId: session.id,
      stripeUrl: session.url,
      userId: userId,
      planType: plan,
      amount: planConfig.price
    });

    // 驗證 Stripe URL 是否為官方域名
    if (session.url && session.url.includes('checkout.stripe.com')) {
      console.log('🎯 正確跳轉到 Stripe 官方域名:', session.url);
    } else {
      console.warn('⚠️ Stripe URL 可能不正確:', session.url);
    }

    // 直接重定向到 Stripe 頁面（checkout.stripe.com 或 buy.stripe.com 域名）
    return res.redirect(302, session.url);

  } catch (error) {
    console.error('❌ 創建直接跳轉 Stripe Checkout 失敗:', error);
    
    // 構建基礎 URL（錯誤處理也需要）
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://line-photo-revival-bot.vercel.app';
    
    // 重定向到錯誤頁面而不是返回 JSON
    return res.redirect(302, `${baseUrl}/payment/cancel?error=checkout_creation_failed`);
  }
} 