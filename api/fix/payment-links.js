const { stripe } = require('../../config/stripe-config');
const lineConfig = require('../../config/line-config');

/**
 * 紧急修复生产环境的Payment Links API
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚨 开始紧急修复Payment Links...');
    
    // 确保使用生产环境配置
    const currentEnv = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    console.log(`🔧 当前环境: ${currentEnv}`);
    console.log(`Basic ID: ${lineConfig.basicId}`);
    
    // 1. 获取现有的价格ID
    const trialPriceId = process.env.STRIPE_TRIAL_PRICE_ID;
    const standardPriceId = process.env.STRIPE_STANDARD_PRICE_ID;
    
    if (!trialPriceId || !standardPriceId) {
      throw new Error('缺少Stripe价格ID环境变量');
    }
    
    console.log(`🏷️ Price IDs: Trial=${trialPriceId}, Standard=${standardPriceId}`);
    
    // 2. 删除旧的Payment Links
    console.log('🗑️ 删除旧的Payment Links...');
    const existingLinks = await stripe.paymentLinks.list({
      limit: 100
    });
    
    const deactivatedLinks = [];
    for (const link of existingLinks.data) {
      if (link.active && (
        link.metadata?.plan_type === 'trial' || 
        link.metadata?.plan_type === 'standard' ||
        link.line_items.data[0]?.price?.id === trialPriceId ||
        link.line_items.data[0]?.price?.id === standardPriceId
      )) {
        console.log(`❌ 停用旧的Payment Link: ${link.id}`);
        await stripe.paymentLinks.update(link.id, {
          active: false
        });
        deactivatedLinks.push(link.id);
      }
    }
    
    // 3. 创建新的Trial Payment Link
    console.log('🔗 创建新的Trial Payment Link...');
    const trialPaymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: trialPriceId,
          quantity: 1,
        },
      ],
      payment_method_types: ['card'],
      // 强制使用生产环境basicId
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://line.me/R/ti/p/@824unncx`
        }
      },
      metadata: {
        plan_type: 'trial',
        created_by: 'emergency_api_fix',
        environment: 'production',
        fixed_at: new Date().toISOString()
      }
    });
    
    // 4. 创建新的Standard Payment Link
    console.log('🔗 创建新的Standard Payment Link...');
    const standardPaymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: standardPriceId,
          quantity: 1,
        },
      ],
      payment_method_types: ['card'],
      // 强制使用生产环境basicId
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://line.me/R/ti/p/@824unncx`
        }
      },
      metadata: {
        plan_type: 'standard',
        created_by: 'emergency_api_fix',
        environment: 'production',
        fixed_at: new Date().toISOString()
      }
    });
    
    const result = {
      success: true,
      environment: currentEnv,
      basicId: lineConfig.basicId,
      deactivatedLinks: deactivatedLinks,
      newLinks: {
        trial: {
          url: trialPaymentLink.url,
          id: trialPaymentLink.id,
          redirectUrl: 'https://line.me/R/ti/p/@824unncx'
        },
        standard: {
          url: standardPaymentLink.url,
          id: standardPaymentLink.id,
          redirectUrl: 'https://line.me/R/ti/p/@824unncx'
        }
      },
      environmentVariables: {
        STRIPE_TRIAL_URL: trialPaymentLink.url,
        STRIPE_STANDARD_URL: standardPaymentLink.url
      }
    };
    
    console.log('✅ Payment Links修复完成:', result);
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('❌ Payment Links修复失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}; 