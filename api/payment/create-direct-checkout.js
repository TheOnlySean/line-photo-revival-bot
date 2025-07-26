const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId } = req.query;

    if (!plan || !stripeConfig.plans[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const planConfig = stripeConfig.plans[plan];
    console.log('🚀 創建簡化 Stripe Checkout:', { plan, userId });

    // 創建簡化的 Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card', 'konbini'],
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
      success_url: 'https://line-photo-revival-bot.vercel.app/payment/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://line-photo-revival-bot.vercel.app/payment/cancel',
      metadata: {
        userId: userId || 'anonymous',
        planType: plan,
        videoCount: planConfig.videoCount.toString()
      },
      locale: 'ja'
    });

    console.log('✅ Stripe URL:', session.url);
    
    // 直接重定向到 Stripe (checkout.stripe.com)
    return res.redirect(302, session.url);

  } catch (error) {
    console.error('❌ Stripe Checkout 失敗:', error);
    return res.status(500).json({ error: 'Checkout failed' });
  }
} 