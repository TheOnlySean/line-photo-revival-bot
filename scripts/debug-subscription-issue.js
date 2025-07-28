/**
 * 调试订阅问题：检查为什么Trial Plan显示下次支付¥0
 */

const { stripe } = require('../config/stripe-config');

async function debugSubscriptionIssue() {
  try {
    console.log('🔍 调试订阅问题...\n');

    // 1. 检查当前的价格配置
    console.log('📋 检查价格配置:');
    
    if (process.env.STRIPE_TRIAL_PRICE_ID) {
      const trialPrice = await stripe.prices.retrieve(process.env.STRIPE_TRIAL_PRICE_ID);
      console.log('✅ Trial Price:', {
        id: trialPrice.id,
        amount: trialPrice.unit_amount,
        currency: trialPrice.currency,
        recurring: trialPrice.recurring,
        metadata: trialPrice.metadata
      });
    } else {
      console.log('❌ STRIPE_TRIAL_PRICE_ID 环境变量未设置');
    }

    // 2. 列出最近的订阅
    console.log('\n📋 检查最近的订阅:');
    const subscriptions = await stripe.subscriptions.list({
      limit: 5,
      status: 'active'
    });

    for (const sub of subscriptions.data) {
      console.log(`📄 订阅: ${sub.id}`);
      console.log(`  状态: ${sub.status}`);
      console.log(`  客户: ${sub.customer}`);
      console.log(`  当前周期: ${new Date(sub.current_period_start * 1000).toLocaleDateString()} - ${new Date(sub.current_period_end * 1000).toLocaleDateString()}`);
      
      if (sub.items.data.length > 0) {
        const item = sub.items.data[0];
        console.log(`  价格ID: ${item.price.id}`);
        console.log(`  金额: ¥${item.price.unit_amount}`);
        console.log(`  试用结束: ${sub.trial_end ? new Date(sub.trial_end * 1000).toLocaleDateString() : '无试用期'}`);
      }
      
      console.log('');
    }

    // 3. 检查Payment Links
    console.log('📋 检查Payment Links:');
    const paymentLinks = await stripe.paymentLinks.list({ limit: 10 });
    
    for (const link of paymentLinks.data) {
      if (link.metadata?.plan_type === 'trial') {
        console.log(`🔗 Trial Payment Link: ${link.id}`);
        console.log(`  URL: ${link.url}`);
        console.log(`  状态: ${link.active ? '激活' : '停用'}`);
        
        if (link.line_items?.data?.length > 0) {
          const lineItem = link.line_items.data[0];
          console.log(`  价格ID: ${lineItem.price.id}`);
          console.log(`  金额: ¥${lineItem.price.unit_amount}`);
        }
      }
    }

    // 4. 检查是否有问题的产品配置
    console.log('\n📋 检查产品配置:');
    const products = await stripe.products.list({ limit: 10 });
    
    for (const product of products.data) {
      if (product.name.includes('お試し') || product.metadata?.plan_type === 'trial') {
        console.log(`📦 Trial Product: ${product.id}`);
        console.log(`  名称: ${product.name}`);
        console.log(`  描述: ${product.description}`);
        console.log(`  元数据: ${JSON.stringify(product.metadata)}`);
        
        // 检查关联的价格
        const prices = await stripe.prices.list({ product: product.id });
        for (const price of prices.data) {
          console.log(`  💰 关联价格: ${price.id} - ¥${price.unit_amount}`);
          if (price.recurring?.trial_period_days) {
            console.log(`  ⚠️ 警告：设置了 ${price.recurring.trial_period_days} 天试用期！`);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ 调试失败:', error);
  }
}

debugSubscriptionIssue(); 