const { stripe } = require('../config/stripe-config');
const db = require('../config/database');

/**
 * 为特定用户手动创建subscription记录
 */
async function fixSpecificUserSubscription() {
  try {
    // 1. 从调试结果知道的信息
    const subscriptionId = 'sub_1Rq6mvAQgzM2CFPdqQhs62Lk';
    const userId = 7; // client_reference_id为7
    
    console.log(`🔧 为用户ID ${userId} 创建subscription记录: ${subscriptionId}`);
    
    // 2. 获取Stripe subscription详情
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    console.log('📋 Stripe subscription:', {
      id: stripeSubscription.id,
      status: stripeSubscription.status,
      customer: stripeSubscription.customer,
      price_id: stripeSubscription.items.data[0]?.price?.id
    });
    
    // 3. 获取用户信息
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    
    if (!user) {
      console.error('❌ 找不到用户:', userId);
      return;
    }
    
    console.log(`👤 用户信息: ID=${user.id}, LINE=${user.line_user_id}, Name=${user.display_name}`);
    
    // 4. 确定计划类型和配额
    const priceId = stripeSubscription.items.data[0]?.price?.id;
    let planType = 'trial';
    let monthlyQuota = 8;
    
    if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) {
      planType = 'standard';
      monthlyQuota = 100;
    } else if (priceId === process.env.STRIPE_TRIAL_PRICE_ID) {
      planType = 'trial';
      monthlyQuota = 8;
    }
    
    console.log(`📋 计划信息: ${planType}, 配额: ${monthlyQuota}`);
    
    // 5. 创建subscription记录
    const subscriptionRecord = await db.upsertSubscription(userId, {
      stripeCustomerId: stripeSubscription.customer,
      stripeSubscriptionId: stripeSubscription.id,
      planType: planType,
      status: stripeSubscription.status,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      monthlyVideoQuota: monthlyQuota,
      videosUsedThisMonth: 0,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false
    });
    
    console.log(`✅ Subscription记录创建成功: ID=${subscriptionRecord.id}`);
    
    // 6. 发送欢迎通知 (如果有LINE用户ID)
    if (user.line_user_id) {
      try {
        const LineAdapter = require('../adapters/line-adapter');
        const lineAdapter = new LineAdapter();
        
        const welcomeMessage = {
          type: 'text',
          text: `🎉 ご利用ありがとうございます！\n\n${planType === 'standard' ? 'スタンダードプラン' : 'お試しプラン'}が正常にアクティベートされました。\n\n📹 月間利用可能数: ${monthlyQuota}本\n💎 残り利用可能数: ${monthlyQuota}本\n\n早速写真から動画を作成してみましょう！`
        };
        
        // 注意：这里我们违反了禁用pushMessage的规则，但这是紧急修复
        console.log('⚠️ 准备发送欢迎通知 (紧急修复)...');
        // await lineAdapter.pushMessage(user.line_user_id, welcomeMessage);
        console.log('📱 欢迎通知准备完成 (暂时跳过发送以避免429错误)');
      } catch (notifyError) {
        console.error(`⚠️ 发送欢迎通知失败:`, notifyError.message);
      }
    }
    
    console.log('\n🎉 用户subscription修复完成！');
    return { success: true, subscriptionId: subscriptionRecord.id };
    
  } catch (error) {
    console.error('❌ 修复用户subscription失败:', error);
    throw error;
  }
}

// 直接执行修复
if (require.main === module) {
  fixSpecificUserSubscription()
    .then((result) => {
      console.log('✅ 脚本完成:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { fixSpecificUserSubscription }; 