const { stripe } = require('../config/stripe-config');
const db = require('../config/database');

/**
 * 修复缺失的订阅记录
 * 查找Stripe中有支付记录但数据库中没有subscription的用户
 */
async function fixMissingSubscriptions() {
  console.log('🔍 开始检查缺失的订阅记录...\n');
  
  try {
    // 1. 获取所有活跃的Stripe订阅
    console.log('📋 获取Stripe中的所有活跃订阅...');
    const stripeSubscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 100
    });
    
    console.log(`✅ 找到 ${stripeSubscriptions.data.length} 个活跃的Stripe订阅\n`);
    
    const missingSubscriptions = [];
    const existingSubscriptions = [];
    const needsUpdate = [];
    
    // 2. 检查每个Stripe订阅是否在数据库中存在
    for (const stripeSubscription of stripeSubscriptions.data) {
      const subscriptionId = stripeSubscription.id;
      const customerId = stripeSubscription.customer;
      const priceId = stripeSubscription.items.data[0]?.price?.id;
      
      console.log(`🔍 检查订阅: ${subscriptionId}`);
      
      // 检查数据库中是否存在此订阅
      const dbSubscription = await db.getSubscriptionByStripeId(subscriptionId);
      
      if (!dbSubscription) {
        console.log(`❌ 缺失订阅记录: ${subscriptionId}`);
        
        // 尝试通过customer ID找到用户
        try {
          const sessions = await stripe.checkout.sessions.list({
            customer: customerId,
            limit: 10
          });
          
          let userId = null;
          let lineUserId = null;
          
          // 从checkout session中获取用户信息
          for (const session of sessions.data) {
            if (session.client_reference_id) {
              userId = parseInt(session.client_reference_id);
              break;
            }
            if (session.metadata?.userId) {
              userId = parseInt(session.metadata.userId);
              break;
            }
          }
          
          if (userId) {
            const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
            if (user.rows.length > 0) {
              lineUserId = user.rows[0].line_user_id;
            }
          }
          
          missingSubscriptions.push({
            stripeSubscription,
            userId,
            lineUserId,
            customerId,
            priceId
          });
        } catch (error) {
          console.error(`❌ 无法获取订阅 ${subscriptionId} 的用户信息:`, error.message);
        }
      } else {
        console.log(`✅ 订阅记录存在: ${subscriptionId}`);
        existingSubscriptions.push({
          stripeId: subscriptionId,
          dbId: dbSubscription.id,
          userId: dbSubscription.user_id
        });
        
        // 检查是否需要更新状态
        if (dbSubscription.status !== stripeSubscription.status) {
          needsUpdate.push({
            subscriptionId,
            currentStatus: dbSubscription.status,
            newStatus: stripeSubscription.status
          });
        }
      }
    }
    
    console.log('\n📊 检查结果摘要:');
    console.log('=====================================');
    console.log(`✅ 已存在的订阅: ${existingSubscriptions.length}`);
    console.log(`❌ 缺失的订阅: ${missingSubscriptions.length}`);
    console.log(`🔄 需要更新的订阅: ${needsUpdate.length}`);
    console.log('=====================================\n');
    
    // 3. 修复缺失的订阅
    if (missingSubscriptions.length > 0) {
      console.log('🛠️ 开始修复缺失的订阅记录...\n');
      
      for (const missing of missingSubscriptions) {
        const { stripeSubscription, userId, lineUserId, priceId } = missing;
        
        try {
          // 确定计划类型和配额
          let planType = 'trial';
          let monthlyQuota = 8;
          
          if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) {
            planType = 'standard';
            monthlyQuota = 100;
          } else if (priceId === process.env.STRIPE_TRIAL_PRICE_ID) {
            planType = 'trial';
            monthlyQuota = 8;
          }
          
          console.log(`🔧 修复订阅: ${stripeSubscription.id}`);
          console.log(`   用户ID: ${userId || '未知'}`);
          console.log(`   LINE用户ID: ${lineUserId || '未知'}`);
          console.log(`   计划类型: ${planType}`);
          console.log(`   月配额: ${monthlyQuota}`);
          
          if (userId) {
            // 创建订阅记录
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
            
            console.log(`✅ 订阅记录创建成功: ID=${subscriptionRecord.id}\n`);
            
            // 如果有LINE用户ID，发送欢迎通知
            if (lineUserId) {
              try {
                const LineAdapter = require('../adapters/line-adapter');
                const lineAdapter = new LineAdapter();
                
                const welcomeMessage = {
                  type: 'text',
                  text: `🎉 ご利用ありがとうございます！\n\n${planType === 'standard' ? 'スタンダードプラン' : 'お試しプラン'}が正常にアクティベートされました。\n\n📹 月間利用可能数: ${monthlyQuota}本\n💎 残り利用可能数: ${monthlyQuota}本\n\n早速写真から動画を作成してみましょう！`
                };
                
                await lineAdapter.pushMessage(lineUserId, welcomeMessage);
                console.log(`📱 欢迎通知已发送给用户: ${lineUserId}`);
              } catch (notifyError) {
                console.error(`⚠️ 发送欢迎通知失败:`, notifyError.message);
              }
            }
            
          } else {
            console.log(`⚠️ 无法找到用户信息，跳过订阅: ${stripeSubscription.id}\n`);
          }
        } catch (error) {
          console.error(`❌ 修复订阅失败: ${stripeSubscription.id}`, error.message);
        }
      }
    }
    
    // 4. 更新需要更新的订阅状态
    if (needsUpdate.length > 0) {
      console.log('\n🔄 更新订阅状态...\n');
      
      for (const update of needsUpdate) {
        try {
          const subscription = await db.getSubscriptionByStripeId(update.subscriptionId);
          if (subscription) {
            await db.upsertSubscription(subscription.user_id, {
              stripeCustomerId: subscription.stripe_customer_id,
              stripeSubscriptionId: update.subscriptionId,
              planType: subscription.plan_type,
              status: update.newStatus,
              currentPeriodStart: subscription.current_period_start,
              currentPeriodEnd: subscription.current_period_end,
              monthlyVideoQuota: subscription.monthly_video_quota,
              videosUsedThisMonth: subscription.videos_used_this_month,
              cancelAtPeriodEnd: subscription.cancel_at_period_end
            });
            
            console.log(`✅ 状态更新: ${update.subscriptionId} (${update.currentStatus} → ${update.newStatus})`);
          }
        } catch (error) {
          console.error(`❌ 更新状态失败: ${update.subscriptionId}`, error.message);
        }
      }
    }
    
    console.log('\n🎉 修复完成！');
    console.log('=====================================');
    console.log(`✅ 修复的订阅: ${missingSubscriptions.filter(m => m.userId).length}`);
    console.log(`🔄 更新的订阅: ${needsUpdate.length}`);
    console.log('=====================================');
    
  } catch (error) {
    console.error('❌ 修复过程中出错:', error);
  }
}

// 直接执行修复
if (require.main === module) {
  fixMissingSubscriptions()
    .then(() => {
      console.log('✅ 脚本完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { fixMissingSubscriptions }; 