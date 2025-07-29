const { stripe } = require('../config/stripe-config');
const lineConfig = require('../config/line-config');

/**
 * 紧急修复生产环境的Payment Links
 * 重新创建Payment Links，确保使用正确的生产环境basicId
 */
async function fixProductionPaymentLinks() {
  console.log('🚨 紧急修复生产环境Payment Links...\n');
  
  try {
    // 确保使用生产环境配置
    console.log('🔧 当前环境配置:');
    console.log(`VERCEL_ENV: ${process.env.VERCEL_ENV}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`Basic ID: ${lineConfig.basicId}`);
    console.log(`Channel ID: ${lineConfig.channelId}\n`);
    
    // 1. 获取现有的价格ID
    const trialPriceId = process.env.STRIPE_TRIAL_PRICE_ID;
    const standardPriceId = process.env.STRIPE_STANDARD_PRICE_ID;
    
    if (!trialPriceId || !standardPriceId) {
      throw new Error('缺少Stripe价格ID环境变量');
    }
    
    console.log(`🏷️ Trial Price ID: ${trialPriceId}`);
    console.log(`🏷️ Standard Price ID: ${standardPriceId}\n`);
    
    // 2. 删除旧的Payment Links（如果存在）
    console.log('🗑️ 检查并删除旧的Payment Links...');
    const existingLinks = await stripe.paymentLinks.list({
      limit: 100
    });
    
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
      }
    }
    
    // 3. 创建新的Trial Payment Link
    console.log('\n🔗 创建新的Trial Payment Link...');
    const trialPaymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: trialPriceId,
          quantity: 1,
        },
      ],
      payment_method_types: ['card'],
      // 关键：使用正确的生产环境basicId
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://line.me/R/ti/p/@824unncx`  // 强制使用生产环境ID
        }
      },
      metadata: {
        plan_type: 'trial',
        created_by: 'emergency_fix',
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
      // 关键：使用正确的生产环境basicId
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://line.me/R/ti/p/@824unncx`  // 强制使用生产环境ID
        }
      },
      metadata: {
        plan_type: 'standard',
        created_by: 'emergency_fix',
        environment: 'production',
        fixed_at: new Date().toISOString()
      }
    });
    
    // 5. 输出结果
    console.log('\n✅ 新的Payment Links创建成功！');
    console.log('==========================================');
    console.log('🎯 Trial Plan:');
    console.log(`   URL: ${trialPaymentLink.url}`);
    console.log(`   ID: ${trialPaymentLink.id}`);
    console.log(`   跳转: https://line.me/R/ti/p/@824unncx`);
    console.log('');
    console.log('🎯 Standard Plan:');
    console.log(`   URL: ${standardPaymentLink.url}`);
    console.log(`   ID: ${standardPaymentLink.id}`);
    console.log(`   跳转: https://line.me/R/ti/p/@824unncx`);
    console.log('==========================================\n');
    
    // 6. 输出需要更新的环境变量
    console.log('🔧 请立即更新Vercel环境变量:');
    console.log('==========================================');
    console.log(`STRIPE_TRIAL_URL=${trialPaymentLink.url}`);
    console.log(`STRIPE_STANDARD_URL=${standardPaymentLink.url}`);
    console.log('==========================================\n');
    
    console.log('📱 测试Payment Links:');
    console.log(`Trial: ${trialPaymentLink.url}`);
    console.log(`Standard: ${standardPaymentLink.url}`);
    
    return {
      trial: {
        url: trialPaymentLink.url,
        id: trialPaymentLink.id
      },
      standard: {
        url: standardPaymentLink.url,
        id: standardPaymentLink.id
      }
    };
    
  } catch (error) {
    console.error('❌ 修复Payment Links失败:', error);
    throw error;
  }
}

// 直接执行修复
if (require.main === module) {
  // 强制设置为生产环境
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  
  fixProductionPaymentLinks()
    .then((result) => {
      console.log('\n🎉 紧急修复完成！');
      console.log('新的Payment Links现在会正确跳转到生产环境LINE账号 @824unncx');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 紧急修复失败:', error);
      process.exit(1);
    });
}

module.exports = { fixProductionPaymentLinks }; 