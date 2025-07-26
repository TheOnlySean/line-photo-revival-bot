// 檢查API密鑰類型 - 支援兩種環境變數名稱
const stripeKey = process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeKey);

/**
 * 重新創建 Payment Links，確保沒有訪問限制
 */

async function fixPaymentLinks() {
  try {
    console.log('🔧 重新創建無限制的 Payment Links...');

    // 產品和價格 ID（從之前的輸出中獲取）
    const products = [
      {
        name: 'Trial Plan',
        productId: 'prod_SkfDCaLeS34QgG',
        priceId: 'price_1Rp9sqAQgzM2CFPd7KThc9oK',
        amount: 300
      },
      {
        name: 'Standard Plan', 
        productId: 'prod_SkfD5ppNLcIRha',
        priceId: 'price_1Rp9srAQgzM2CFPdtYGi6GcR',
        amount: 2980
      }
    ];

    const newPaymentLinks = [];

    for (const product of products) {
      console.log(`\n🔗 創建 ${product.name} Payment Link...`);
      
      try {
        const paymentLink = await stripe.paymentLinks.create({
          line_items: [
            {
              price: product.priceId,
              quantity: 1,
            },
          ],
          payment_method_types: ['card'], // 只使用基本的信用卡支付
          // 簡化設置，避免複雜配置
          allow_promotion_codes: false,
          // 元數據
          metadata: {
            plan_type: product.name.toLowerCase().replace(' plan', ''),
            created_by: 'fix_script',
            amount: product.amount.toString()
          }
        });

        console.log(`✅ ${product.name} Payment Link 創建成功:`);
        console.log(`   URL: ${paymentLink.url}`);
        console.log(`   ID: ${paymentLink.id}`);
        console.log(`   Active: ${paymentLink.active}`);

        newPaymentLinks.push({
          name: product.name,
          url: paymentLink.url,
          id: paymentLink.id,
          productId: product.productId,
          priceId: product.priceId
        });

      } catch (error) {
        console.error(`❌ 創建 ${product.name} Payment Link 失敗:`, error.message);
      }
    }

    // 輸出結果
    console.log('\n📋 新的 Payment Links:');
    console.log('============================================');
    
    for (const link of newPaymentLinks) {
      console.log(`${link.name}:`);
      console.log(`  URL: ${link.url}`);
      console.log(`  ID: ${link.id}`);
      console.log('');
    }

    console.log('🔧 請更新 Vercel 環境變數:');
    console.log('============================================');
    
    const trialLink = newPaymentLinks.find(l => l.name === 'Trial Plan');
    const standardLink = newPaymentLinks.find(l => l.name === 'Standard Plan');
    
    if (trialLink) {
      console.log(`STRIPE_TRIAL_URL=${trialLink.url}`);
    }
    if (standardLink) {
      console.log(`STRIPE_STANDARD_URL=${standardLink.url}`);
    }
    console.log('============================================');

    // 測試新的 Payment Links
    console.log('\n🧪 測試新的 Payment Links:');
    for (const link of newPaymentLinks) {
      try {
        const response = await fetch(link.url, { 
          method: 'HEAD',
          redirect: 'manual'
        });
        
        console.log(`${link.name}: HTTP ${response.status} - ${response.status === 200 ? '✅ 正常' : '❌ 異常'}`);
      } catch (error) {
        console.log(`${link.name}: ❌ 測試失敗 - ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ 修復失敗:', error.message);
  }
}

// 執行修復
if (require.main === module) {
  if (!stripeKey) {
    console.error('❌ 請設置 STRIPE_KEY 環境變數');
    process.exit(1);
  }

  fixPaymentLinks()
    .then(() => {
      console.log('\n🎉 Payment Links 修復完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { fixPaymentLinks }; 