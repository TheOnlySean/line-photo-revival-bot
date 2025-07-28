const { stripe } = require('../../config/stripe-config');
const db = require('../../config/database');
const lineConfig = require('../../config/line-config');

/**
 * 创建Stripe客户门户会话
 * 允许用户管理订阅（取消、更新付款方式等）
 */
module.exports = async (req, res) => {
  console.log('🏪 收到创建客户门户会话请求');
  
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    console.log(`🔍 查询用户 ${userId} 的订阅信息...`);
    
    // 获取用户的活跃订阅
    const subscription = await db.getUserSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    if (!subscription.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error: 'No Stripe customer ID found'
      });
    }

    console.log(`🏪 为客户 ${subscription.stripe_customer_id} 创建门户会话`);
    
    // 创建客户门户会话
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `https://line.me/R/ti/p/${lineConfig.basicId}`, // 返回LINE官方账号
    });

    console.log('✅ 客户门户会话创建成功:', portalSession.url);

    // 返回门户URL
    res.json({
      success: true,
      portal_url: portalSession.url,
      customer_id: subscription.stripe_customer_id
    });

  } catch (error) {
    console.error('❌ 创建客户门户会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}; 