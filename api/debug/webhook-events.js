const { stripe } = require('../../config/stripe-config');
const lineConfig = require('../../config/line-config');

/**
 * 调试Webhook事件的API
 */
module.exports = async (req, res) => {
  try {
    console.log('🔍 开始调试Webhook事件...');
    
    // 当前环境信息
    const currentEnv = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    console.log(`🔧 当前环境: ${currentEnv}`);
    console.log(`📱 Basic ID: ${lineConfig.basicId}`);
    console.log(`📺 Channel ID: ${lineConfig.channelId}`);
    
    // 1. 获取最近的Stripe事件
    console.log('📋 获取最近的Stripe事件...');
    const events = await stripe.events.list({
      limit: 20,
      types: ['checkout.session.completed', 'customer.subscription.created']
    });
    
    console.log(`✅ 找到 ${events.data.length} 个相关事件`);
    
    const debugInfo = {
      environment: {
        VERCEL_ENV: process.env.VERCEL_ENV,
        NODE_ENV: process.env.NODE_ENV,
        currentEnv,
        basicId: lineConfig.basicId,
        channelId: lineConfig.channelId
      },
      recentEvents: []
    };
    
    // 2. 分析每个事件
    for (const event of events.data) {
      const eventInfo = {
        id: event.id,
        type: event.type,
        created: new Date(event.created * 1000).toISOString(),
        livemode: event.livemode
      };
      
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        eventInfo.session = {
          id: session.id,
          customer: session.customer,
          subscription: session.subscription,
          metadata: session.metadata,
          client_reference_id: session.client_reference_id,
          payment_status: session.payment_status
        };
        
        // 检查这个session是否有对应的subscription
        if (session.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            eventInfo.subscription_details = {
              id: subscription.id,
              status: subscription.status,
              customer: subscription.customer,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              price_id: subscription.items.data[0]?.price?.id
            };
          } catch (subError) {
            eventInfo.subscription_error = subError.message;
          }
        }
      }
      
      debugInfo.recentEvents.push(eventInfo);
    }
    
    // 3. 检查最新的checkout session
    const recentSessions = await stripe.checkout.sessions.list({
      limit: 10
    });
    
    debugInfo.recentCheckoutSessions = recentSessions.data.map(session => ({
      id: session.id,
      created: new Date(session.created * 1000).toISOString(),
      customer: session.customer,
      subscription: session.subscription,
      metadata: session.metadata,
      client_reference_id: session.client_reference_id,
      payment_status: session.payment_status
    }));
    
    // 4. 获取webhook endpoint配置
    try {
      const webhookEndpoints = await stripe.webhookEndpoints.list({
        limit: 10
      });
      
      debugInfo.webhookEndpoints = webhookEndpoints.data.map(endpoint => ({
        id: endpoint.id,
        url: endpoint.url,
        enabled_events: endpoint.enabled_events,
        status: endpoint.status,
        created: new Date(endpoint.created * 1000).toISOString()
      }));
    } catch (webhookError) {
      debugInfo.webhookError = webhookError.message;
    }
    
    console.log('🎯 调试信息收集完成');
    
    return res.status(200).json({
      success: true,
      debug: debugInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Webhook调试失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}; 