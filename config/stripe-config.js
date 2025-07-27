const Stripe = require('stripe');

/**
 * Stripe 配置
 */

const stripeConfig = {
  // 使用環境變數或默認值
  secretKey: process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY || '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',
  
  // Webhook 签名密钥
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  
  // 其他配置選項
  currency: 'jpy',
  country: 'JP'
};

// 初始化 Stripe 實例
const stripe = new Stripe(stripeConfig.secretKey, {
  apiVersion: '2023-10-16'
});

module.exports = { stripe, stripeConfig }; 