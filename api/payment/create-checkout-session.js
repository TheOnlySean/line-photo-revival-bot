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
      
      // 啟用 Apple Pay 和 Google Pay（通過 card 類型自動支持）
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
            currency: plan.currency,
            product_data: {
              name: plan.nameJa,
              description: `月間${plan.videoCount}本の動画生成 - AI写真復活サービス`,
              images: [
                `${baseUrl}/logo-placeholder.svg` // 使用品牌Logo作為產品圖
              ],
              metadata: {
                features: plan.videoCount === 8 ? 
                  'AI写真復活機能,高品質動画出力,モバイル対応,サポート対応' :
                  'AI写真復活機能,高品質動画出力,モバイル対応,カスタムプロンプト,優先処理,優先サポート'
              }
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
        description: `写真復活 - ${plan.nameJa}`,
        metadata: {
          userId: userId || 'anonymous',
          planType: planType,
          videoCount: plan.videoCount.toString(),
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
          description: `写真復活 ${plan.nameJa} - 月間${plan.videoCount}本の動画生成`,
          metadata: {
            service: '写真復活サービス',
            plan: plan.nameJa
          },
          footer: 'ご利用いただき、ありがとうございます。'
        }
      },
      
      // 支付方法配置
      payment_method_configuration: undefined, // 使用默認配置
      
      // 品牌和自定義
      custom_text: {
        submit: {
          message: '安全な決済でお支払いを完了'
        }
      }
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