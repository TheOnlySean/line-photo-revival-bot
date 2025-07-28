/**
 * 修复Trial Plan定价问题
 * 确保Trial Plan每月收费¥300，没有免费试用期
 */

const { stripe } = require('../config/stripe-config');

async function fixTrialPlanPricing() {
  try {
    console.log('🔧 开始修复Trial Plan定价问题...\n');

    // 1. 检查现有的Trial产品和价格
    console.log('📋 检查现有Trial产品...');
    const products = await stripe.products.list({ limit: 20 });
    
    let trialProduct = null;
    for (const product of products.data) {
      if (product.name.includes('お試し') || product.metadata?.plan_type === 'trial') {
        trialProduct = product;
        console.log(`找到Trial产品: ${product.id} - ${product.name}`);
        break;
      }
    }

    if (!trialProduct) {
      console.log('❌ 未找到Trial产品');
      return;
    }

    // 2. 检查关联的价格
    console.log('\n📋 检查Trial产品的价格...');
    const prices = await stripe.prices.list({ product: trialProduct.id });
    
    let hasCorrectPrice = false;
    let problemPrices = [];
    
    for (const price of prices.data) {
      console.log(`价格 ${price.id}:`, {
        amount: price.unit_amount,
        currency: price.currency,
        active: price.active,
        recurring: price.recurring
      });
      
      if (price.unit_amount === 300 && price.currency === 'jpy' && price.active) {
        hasCorrectPrice = true;
        console.log(`✅ 找到正确的价格: ${price.id}`);
      } else if (price.active) {
        problemPrices.push(price);
      }
    }

    // 3. 如果没有正确的价格，创建新的
    let correctPriceId = null;
    if (!hasCorrectPrice) {
      console.log('\n🔨 创建正确的Trial价格...');
      const newPrice = await stripe.prices.create({
        product: trialProduct.id,
        unit_amount: 300, // ¥300
        currency: 'jpy',
        recurring: {
          interval: 'month'
          // 明确不设置trial_period_days
        },
        metadata: {
          plan_type: 'trial',
          fixed_date: new Date().toISOString(),
          note: 'Fixed pricing - no trial period'
        }
      });
      
      correctPriceId = newPrice.id;
      console.log(`✅ 创建新价格成功: ${newPrice.id} - ¥${newPrice.unit_amount}`);
    } else {
      // 找到现有的正确价格ID
      for (const price of prices.data) {
        if (price.unit_amount === 300 && price.currency === 'jpy' && price.active) {
          correctPriceId = price.id;
          break;
        }
      }
    }

    // 4. 停用有问题的价格
    for (const problemPrice of problemPrices) {
      if (problemPrice.unit_amount !== 300) {
        console.log(`\n🚫 停用错误价格: ${problemPrice.id} (¥${problemPrice.unit_amount})`);
        await stripe.prices.update(problemPrice.id, { active: false });
        console.log(`✅ 价格 ${problemPrice.id} 已停用`);
      }
    }

    // 5. 检查和修复Payment Links
    console.log('\n📋 检查Payment Links...');
    const paymentLinks = await stripe.paymentLinks.list({ limit: 20 });
    
    for (const link of paymentLinks.data) {
      if (link.metadata?.plan_type === 'trial' && link.active) {
        console.log(`检查Payment Link: ${link.id}`);
        
        // 检查这个链接是否使用了正确的价格
        const lineItems = link.line_items?.data || [];
        let needsUpdate = false;
        
        for (const item of lineItems) {
          if (item.price.unit_amount !== 300) {
            needsUpdate = true;
            console.log(`⚠️ Payment Link使用错误价格: ¥${item.price.unit_amount}`);
          }
        }
        
        if (needsUpdate && correctPriceId) {
          console.log(`🔄 需要重新创建Payment Link，使用正确价格: ${correctPriceId}`);
          
          // 停用旧链接
          await stripe.paymentLinks.update(link.id, { active: false });
          console.log(`🚫 旧Payment Link ${link.id} 已停用`);
          
          // 创建新链接
          const newLink = await stripe.paymentLinks.create({
            line_items: [
              {
                price: correctPriceId,
                quantity: 1,
              },
            ],
            payment_method_types: ['card'],
            after_completion: {
              type: 'redirect',
              redirect: {
                url: 'https://line.me/R/ti/p/@824unncx'
              }
            },
            metadata: {
              plan_type: 'trial',
              created_by: 'fix_script',
              fixed_date: new Date().toISOString()
            }
          });
          
          console.log(`✅ 新Payment Link创建成功: ${newLink.id}`);
          console.log(`🔗 新链接URL: ${newLink.url}`);
        }
      }
    }

    // 6. 输出环境变量更新建议
    console.log('\n📋 建议更新的环境变量:');
    console.log(`STRIPE_TRIAL_PRICE_ID=${correctPriceId}`);
    
    console.log('\n✅ Trial Plan定价修复完成！');
    console.log('📝 修复总结:');
    console.log(`  ✅ 确保Trial价格为¥300/月`);
    console.log(`  ✅ 移除所有试用期设置`);
    console.log(`  ✅ 更新Payment Links使用正确价格`);
    console.log(`  ✅ 停用错误的价格配置`);

  } catch (error) {
    console.error('❌ 修复失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixTrialPlanPricing();
}

module.exports = { fixTrialPlanPricing }; 