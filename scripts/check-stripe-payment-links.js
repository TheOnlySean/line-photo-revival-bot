// 檢查API密鑰類型 - 支援兩種環境變數名稱
const stripeKey = process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeKey);

/**
 * 檢查 Stripe Payment Links 的狀態和設置
 */

async function checkPaymentLinks() {
  try {
    console.log('🔍 檢查 Stripe Payment Links 狀態...');

    // Payment Link IDs（從之前的輸出中獲取）
    const paymentLinks = [
      {
        name: 'Trial Plan',
        url: 'https://buy.stripe.com/6oU5kC0BB1dk0iH5Ubcs802',
        productId: 'prod_SkfDCaLeS34QgG',
        priceId: 'price_1Rp9sqAQgzM2CFPd7KThc9oK'
      },
      {
        name: 'Standard Plan', 
        url: 'https://buy.stripe.com/28E14mbgfe065D1dmDcs803',
        productId: 'prod_SkfD5ppNLcIRha',
        priceId: 'price_1Rp9srAQgzM2CFPdtYGi6GcR'
      }
    ];

    // 檢查所有 Payment Links
    const allPaymentLinks = await stripe.paymentLinks.list({ limit: 10 });
    console.log(`\n📋 找到 ${allPaymentLinks.data.length} 個 Payment Links:`);

    for (const link of allPaymentLinks.data) {
      console.log(`\n🔗 Payment Link: ${link.id}`);
      console.log(`   URL: ${link.url}`);
      console.log(`   Active: ${link.active}`);
      console.log(`   Allow Promotion Codes: ${link.allow_promotion_codes}`);
      console.log(`   Payment Method Types: ${link.payment_method_types.join(', ')}`);
      
      // 檢查 line items
      if (link.line_items && link.line_items.data) {
        for (const item of link.line_items.data) {
          console.log(`   Product: ${item.price.product}`);
          console.log(`   Price: ¥${item.price.unit_amount} ${item.price.currency.toUpperCase()}`);
          console.log(`   Recurring: ${item.price.recurring ? item.price.recurring.interval : 'one-time'}`);
        }
      }

      // 檢查是否有域名限制
      if (link.restrictions) {
        console.log(`   Restrictions: ${JSON.stringify(link.restrictions)}`);
      }

      // 檢查自定義設置
      if (link.custom_text) {
        console.log(`   Custom Text: ${JSON.stringify(link.custom_text)}`);
      }
    }

    // 檢查產品狀態
    console.log('\n📦 檢查產品狀態:');
    for (const linkInfo of paymentLinks) {
      try {
        const product = await stripe.products.retrieve(linkInfo.productId);
        console.log(`\n${linkInfo.name}:`);
        console.log(`   Product ID: ${product.id}`);
        console.log(`   Active: ${product.active}`);
        console.log(`   Name: ${product.name}`);
        
        // 檢查價格
        const price = await stripe.prices.retrieve(linkInfo.priceId);
        console.log(`   Price: ¥${price.unit_amount} ${price.currency.toUpperCase()}`);
        console.log(`   Active: ${price.active}`);
        console.log(`   Recurring: ${price.recurring ? price.recurring.interval : 'one-time'}`);
      } catch (error) {
        console.log(`❌ 檢查 ${linkInfo.name} 失敗:`, error.message);
      }
    }

    // 測試 Payment Links 可訪問性
    console.log('\n🧪 測試 Payment Links 可訪問性:');
    for (const linkInfo of paymentLinks) {
      console.log(`\n測試 ${linkInfo.name}: ${linkInfo.url}`);
      
      try {
        const response = await fetch(linkInfo.url, { 
          method: 'HEAD',
          redirect: 'manual' // 不跟隨重定向
        });
        
        console.log(`   HTTP Status: ${response.status}`);
        console.log(`   Status Text: ${response.statusText}`);
        
        if (response.status === 200) {
          console.log('   ✅ 可訪問');
        } else if (response.status >= 300 && response.status < 400) {
          console.log(`   🔄 重定向到: ${response.headers.get('location')}`);
        } else {
          console.log('   ❌ 無法訪問');
        }
      } catch (error) {
        console.log(`   ❌ 測試失敗: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ 檢查失敗:', error.message);
  }
}

// 執行檢查
if (require.main === module) {
  if (!stripeKey) {
    console.error('❌ 請設置 STRIPE_KEY 環境變數');
    process.exit(1);
  }

  checkPaymentLinks()
    .then(() => {
      console.log('\n🎉 檢查完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { checkPaymentLinks }; 