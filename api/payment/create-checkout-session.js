const { stripe, stripeConfig } = require('../../config/stripe-config');
const Database = require('../../config/database');

const db = new Database();

/**
 * 创建带有用户信息的Checkout Session - Vercel API格式
 */
module.exports = async (req, res) => {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('🛒 收到创建Checkout Session请求');
  
  try {
    const { userId, planType } = req.body;
    
    if (!userId || !planType) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or planType parameter'
      });
    }

    console.log(`👤 为用户 ${userId} 创建 ${planType} 计划的Checkout Session`);
    
    // 通过数据库ID获取用户信息
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [parseInt(userId)]);
    const user = userResult.rows[0];
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`👤 找到用户: ID=${user.id}, LINE=${user.line_user_id}, Name=${user.display_name}`);

    // 根据计划类型设置价格ID和配额
    let priceId, monthlyQuota, planName;
    
    if (planType === 'trial') {
      priceId = process.env.STRIPE_TRIAL_PRICE_ID;
      monthlyQuota = 8;
      planName = 'お試しプラン';
    } else if (planType === 'standard') {
      priceId = process.env.STRIPE_STANDARD_PRICE_ID;
      monthlyQuota = 100;
      planName = 'スタンダードプラン';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid planType. Must be "trial" or "standard"'
      });
    }

    if (!priceId) {
      return res.status(500).json({
        success: false,
        error: `Missing price ID for ${planType} plan`
      });
    }

    // 创建Checkout Session
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://line-photo-revival-bot.vercel.app';
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&plan=${planType}`,
      cancel_url: `${baseUrl}/subscription/cancel?plan=${planType}`,
      metadata: {
        userId: userId.toString(),
        lineUserId: user.line_user_id,
        planType: planType,
        monthlyQuota: monthlyQuota.toString(),
        planName: planName
      },
      subscription_data: {
        metadata: {
          userId: userId.toString(),
          lineUserId: user.line_user_id,
          planType: planType,
          monthlyQuota: monthlyQuota.toString()
        }
      }
    });

    console.log('✅ Checkout Session创建成功:', session.id);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      planType: planType,
      planName: planName,
      monthlyQuota: monthlyQuota
    });

  } catch (error) {
    console.error('❌ 创建Checkout Session失败:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
}; 