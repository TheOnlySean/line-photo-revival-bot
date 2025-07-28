/**
 * API端点：修复Trial Plan定价问题
 * 确保Trial Plan每月收费¥300，没有免费试用期
 */

const { stripe } = require('../../config/stripe-config');

export default async function handler(req, res) {
  // 管理员验证
  const { adminKey } = req.query;
  if (adminKey !== 'fix-trial-pricing-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 开始修复Trial Plan定价问题...');
    const results = {};

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
      return res.status(404).json({
        success: false,
        error: '未找到Trial产品'
      });
    }

    results.trialProduct = {
      id: trialProduct.id,
      name: trialProduct.name
    };

    // 2. 检查关联的价格
    console.log('📋 检查Trial产品的价格...');
    const prices = await stripe.prices.list({ product: trialProduct.id });
    
    let hasCorrectPrice = false;
    let problemPrices = [];
    let correctPriceId = null;
    
    results.existingPrices = [];
    
    for (const price of prices.data) {
      const priceInfo = {
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        active: price.active,
        recurring: price.recurring
      };
      
      results.existingPrices.push(priceInfo);
      
      if (price.unit_amount === 300 && price.currency === 'jpy' && price.active) {
        hasCorrectPrice = true;
        correctPriceId = price.id;
        console.log(`✅ 找到正确的价格: ${price.id}`);
      } else if (price.active) {
        problemPrices.push(price);
      }
    }

    // 3. 如果没有正确的价格，创建新的
    if (!hasCorrectPrice) {
      console.log('🔨 创建正确的Trial价格...');
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
      results.newPriceCreated = {
        id: newPrice.id,
        amount: newPrice.unit_amount,
        currency: newPrice.currency
      };
      console.log(`✅ 创建新价格成功: ${newPrice.id} - ¥${newPrice.unit_amount}`);
    }

    // 4. 停用有问题的价格
    results.deactivatedPrices = [];
    for (const problemPrice of problemPrices) {
      if (problemPrice.unit_amount !== 300) {
        console.log(`🚫 停用错误价格: ${problemPrice.id} (¥${problemPrice.unit_amount})`);
        await stripe.prices.update(problemPrice.id, { active: false });
        results.deactivatedPrices.push({
          id: problemPrice.id,
          amount: problemPrice.unit_amount
        });
        console.log(`✅ 价格 ${problemPrice.id} 已停用`);
      }
    }

    // 5. 检查和修复Payment Links
    console.log('📋 检查Payment Links...');
    const paymentLinks = await stripe.paymentLinks.list({ limit: 20 });
    
    results.paymentLinks = {
      checked: [],
      updated: []
    };
    
    for (const link of paymentLinks.data) {
      if (link.metadata?.plan_type === 'trial' && link.active) {
        const linkInfo = {
          id: link.id,
          url: link.url,
          active: link.active
        };
        
        // 检查这个链接是否使用了正确的价格
        const lineItems = link.line_items?.data || [];
        let needsUpdate = false;
        
        for (const item of lineItems) {
          linkInfo.currentPrice = {
            id: item.price.id,
            amount: item.price.unit_amount
          };
          
          if (item.price.unit_amount !== 300) {
            needsUpdate = true;
            console.log(`⚠️ Payment Link使用错误价格: ¥${item.price.unit_amount}`);
          }
        }
        
        results.paymentLinks.checked.push(linkInfo);
        
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
          
          results.paymentLinks.updated.push({
            oldId: link.id,
            newId: newLink.id,
            newUrl: newLink.url
          });
          
          console.log(`✅ 新Payment Link创建成功: ${newLink.id}`);
        }
      }
    }

    // 6. 返回修复结果
    results.correctPriceId = correctPriceId;
    results.environmentVariable = `STRIPE_TRIAL_PRICE_ID=${correctPriceId}`;
    
    console.log('✅ Trial Plan定价修复完成！');
    
    res.json({
      success: true,
      message: 'Trial Plan定价修复完成',
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    console.error('❌ 修复失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 