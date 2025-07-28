const { stripe } = require('../../config/stripe-config');
const db = require('../../config/database');
const lineConfig = require('../../config/line-config');

/**
 * 重定向到Stripe客户门户
 * 允许用户管理订阅（取消、更新付款方式等）
 */
module.exports = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).send('Missing userId parameter');
    }

    // 获取用户的活跃订阅
    const subscription = await db.getUserSubscription(userId);
    
    if (!subscription || !subscription.stripe_customer_id) {
      return res.status(404).send('No active subscription found');
    }

    // 创建客户门户会话
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `https://line.me/R/ti/p/${lineConfig.basicId}`, // 返回LINE官方账号
    });

    // 直接重定向到Stripe客户门户
    res.redirect(portalSession.url);

  } catch (error) {
    console.error('❌ 重定向到客户门户失败:', error);
    res.status(500).send('Internal server error');
  }
}; 