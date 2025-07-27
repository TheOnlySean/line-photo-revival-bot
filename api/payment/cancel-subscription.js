const stripeConfig = require('../../config/stripe-config');
const Database = require('../../config/database');

const stripe = require('stripe')(stripeConfig.secretKey);
const db = new Database();

/**
 * 取消用户订阅
 */
module.exports = async (req, res) => {
  console.log('🚫 收到取消订阅请求');
  
  try {
    const { userId } = req.body;
    
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

    if (!subscription.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        error: 'No Stripe subscription ID found'
      });
    }

    console.log(`🚫 取消Stripe订阅: ${subscription.stripe_subscription_id}`);
    
    // 通过Stripe API取消订阅
    const canceledSubscription = await stripe.subscriptions.cancel(
      subscription.stripe_subscription_id
    );

    console.log('✅ Stripe订阅已取消');

    // 更新数据库中的订阅状态
    await db.query(
      `UPDATE subscriptions 
       SET status = $1, 
           canceled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND status = 'active'`,
      ['canceled', userId]
    );

    console.log('✅ 数据库订阅状态已更新');

    res.json({
      success: true,
      message: 'Subscription canceled successfully',
      subscription: {
        id: canceledSubscription.id,
        status: canceledSubscription.status,
        canceled_at: canceledSubscription.canceled_at
      }
    });

  } catch (error) {
    console.error('❌ 取消订阅失败:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
      details: error.message
    });
  }
}; 