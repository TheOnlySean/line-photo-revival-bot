const LineAdapter = require('../../adapters/line-adapter');
const MessageTemplates = require('../../utils/message-templates');

const db = require('../../config/database');
const lineAdapter = new LineAdapter();

/**
 * 手动创建订阅的测试端点
 * 用于测试支付完成后的数据库更新
 */
module.exports = async (req, res) => {
  try {
    const { userId, planType = 'trial' } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    console.log(`🧪 手动创建用户 ${userId} 的 ${planType} 订阅`);

    // 通过数据库ID查找用户
    const result = await db.query('SELECT * FROM users WHERE id = $1', [parseInt(userId)]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 设置计划信息
    const monthlyQuota = planType === 'trial' ? 8 : 100;
    const planName = planType === 'trial' ? 'お試しプラン' : 'スタンダードプラン';
    
    // 創建訂閱記錄
    const subscriptionRecord = await db.upsertSubscription(user.id, {
      stripeCustomerId: 'manual_test_customer',
      stripeSubscriptionId: `manual_test_sub_${Date.now()}`,
      planType: planType,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
      monthlyVideoQuota: monthlyQuota,
      videosUsedThisMonth: 0
    });

    console.log('✅ 手动订阅创建成功:', subscriptionRecord);

    // 發送歡迎通知
    if (user.line_user_id) {
      const welcomeMessage = MessageTemplates.createTextMessage(
        `🎉 ありがとうございます！\n\n${planName}のお申し込みが完了いたしました。\n\n📊 月間利用枠: ${monthlyQuota}本\n\n早速、写真から動画を生成してお楽しみください！`
      );
      await lineAdapter.pushMessage(user.line_user_id, welcomeMessage);
    }

    res.json({
      success: true,
      message: 'Manual subscription created successfully',
      user: {
        id: user.id,
        lineUserId: user.line_user_id,
        displayName: user.display_name
      },
      subscription: subscriptionRecord,
      planType: planType,
      monthlyQuota: monthlyQuota
    });

  } catch (error) {
    console.error('❌ 手动创建订阅失败:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create manual subscription',
      details: error.message
    });
  }
}; 