/**
 * 调试订阅问题：检查为什么Trial Plan显示下次支付¥0
 */

const { stripe } = require('../../config/stripe-config');

export default async function handler(req, res) {
  // 简单的管理员验证
  const { adminKey } = req.query;
  if (adminKey !== 'debug-subscription-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 开始调试订阅问题...');
    const results = {};

    // 1. 检查环境变量
    results.environment = {
      NODE_ENV: process.env.NODE_ENV,
      STRIPE_TRIAL_PRICE_ID: process.env.STRIPE_TRIAL_PRICE_ID,
      STRIPE_STANDARD_PRICE_ID: process.env.STRIPE_STANDARD_PRICE_ID
    };

    // 2. 检查价格配置
    if (process.env.STRIPE_TRIAL_PRICE_ID) {
      try {
        const trialPrice = await stripe.prices.retrieve(process.env.STRIPE_TRIAL_PRICE_ID);
        results.trialPrice = {
          id: trialPrice.id,
          amount: trialPrice.unit_amount,
          currency: trialPrice.currency,
          recurring: trialPrice.recurring,
          metadata: trialPrice.metadata
        };
      } catch (error) {
        results.trialPriceError = error.message;
      }
    }

    // 3. 检查最近的订阅
    const subscriptions = await stripe.subscriptions.list({
      limit: 5,
      status: 'active'
    });

    results.activeSubscriptions = subscriptions.data.map(sub => ({
      id: sub.id,
      status: sub.status,
      customer: sub.customer,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      items: sub.items.data.map(item => ({
        price_id: item.price.id,
        amount: item.price.unit_amount,
        currency: item.price.currency
      }))
    }));

    // 4. 检查Payment Links
    const paymentLinks = await stripe.paymentLinks.list({ limit: 10 });
    results.trialPaymentLinks = paymentLinks.data
      .filter(link => link.metadata?.plan_type === 'trial')
      .map(link => ({
        id: link.id,
        url: link.url,
        active: link.active,
        metadata: link.metadata,
        line_items: link.line_items?.data?.map(item => ({
          price_id: item.price.id,
          amount: item.price.unit_amount
        }))
      }));

    // 5. 检查产品配置
    const products = await stripe.products.list({ limit: 10 });
    results.trialProducts = [];
    
    for (const product of products.data) {
      if (product.name.includes('お試し') || product.metadata?.plan_type === 'trial') {
        const productInfo = {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata,
          prices: []
        };
        
        // 检查关联的价格
        const prices = await stripe.prices.list({ product: product.id });
        for (const price of prices.data) {
          const priceInfo = {
            id: price.id,
            amount: price.unit_amount,
            currency: price.currency,
            recurring: price.recurring
          };
          
          if (price.recurring?.trial_period_days) {
            priceInfo.trial_period_days = price.recurring.trial_period_days;
            priceInfo.warning = `设置了 ${price.recurring.trial_period_days} 天试用期！`;
          }
          
          productInfo.prices.push(priceInfo);
        }
        
        results.trialProducts.push(productInfo);
      }
    }

    // 6. 检查用户的具体订阅（如果提供了用户ID）
    const { userId } = req.query;
    if (userId) {
      const db = require('../../config/database');
      try {
        const userSubscription = await db.getUserSubscription(userId);
        if (userSubscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(userSubscription.stripe_subscription_id);
          results.userSubscription = {
            database: userSubscription,
            stripe: {
              id: stripeSubscription.id,
              status: stripeSubscription.status,
              trial_end: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null,
              items: stripeSubscription.items.data.map(item => ({
                price_id: item.price.id,
                amount: item.price.unit_amount
              }))
            }
          };
        }
      } catch (error) {
        results.userSubscriptionError = error.message;
      }
    }

    console.log('✅ 调试完成');
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    console.error('❌ 调试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 