const stripe = require('stripe');

// Stripe 配置
const stripeConfig = {
  // 注意：您提供的 key 格式可能需要確認
  // 通常應該是 pk_live_... (publishable) 和 sk_live_... (secret)
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_live_51PZl6eAQgzM2CFPdeBTiAs5Otp66zpLYXVlatk2U9gOjsufjcZnDnNV8Q0cH6xmI3PKgz8R5ofzEN9KKcLZalkqm00QB0iLWNq',
  secretKey: process.env.STRIPE_SECRET_KEY || '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',
  
  // 訂閱方案配置
  plans: {
    trial: {
      name: 'Trial Plan',
      nameJa: 'トライアルプラン',
      price: 300, // 日元
      originalPrice: 600,
      currency: 'jpy',
      videoCount: 8,
      interval: 'month',
      // 在Stripe Dashboard中創建的價格ID，暫時使用佔位符
      priceId: process.env.STRIPE_TRIAL_PRICE_ID || 'price_trial_placeholder'
    },
    standard: {
      name: 'Standard Plan', 
      nameJa: 'スタンダードプラン',
      price: 2980, // 日元
      currency: 'jpy',
      videoCount: 100,
      interval: 'month',
      // 在Stripe Dashboard中創建的價格ID，暫時使用佔位符
      priceId: process.env.STRIPE_STANDARD_PRICE_ID || 'price_standard_placeholder'
    }
  },

  // Webhook 端點秘密
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  
  // 成功和取消URL
  successUrl: process.env.PAYMENT_SUCCESS_URL || 'https://line-photo-revival-bot.vercel.app/payment/success',
  cancelUrl: process.env.PAYMENT_CANCEL_URL || 'https://line-photo-revival-bot.vercel.app/payment/cancel'
};

// 初始化 Stripe 實例
const stripeInstance = stripe(stripeConfig.secretKey);

module.exports = {
  stripeConfig,
  stripe: stripeInstance
}; 