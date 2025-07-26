// 檢查API密鑰類型 - 支援兩種環境變數名稱
const stripeKey = process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY;
const isTestMode = stripeKey?.startsWith('sk_test_');
const isLiveMode = stripeKey?.startsWith('sk_live_');

if (!isTestMode && !isLiveMode) {
  console.error('❌ 無效的Stripe API密鑰格式');
  console.error('請確保使用正確格式的密鑰:');
  console.error('  測試模式: sk_test_...');
  console.error('  生產模式: sk_live_...');
  console.error('環境變數名稱: STRIPE_KEY 或 STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = require('stripe')(stripeKey);

/**
 * 創建Stripe產品和價格，然後生成Payment Links
 * 支援日本本地支付方式和Apple Pay
 */

async function createStripeProducts() {
  try {
    console.log(`🚀 開始創建Stripe產品和Payment Links... (${isTestMode ? '測試模式' : '生產模式'})`);

    // 根據模式調整支付方式
    const paymentMethods = ['card']; // 基本的信用卡支付
    
    if (isLiveMode) {
      // 生產模式可以嘗試添加更多支付方式，但需要謹慎
      // paymentMethods.push('apple_pay', 'google_pay'); // 暫時註釋掉，避免錯誤
      console.log('💡 提示：目前只啟用信用卡支付，如需更多支付方式請在Stripe Dashboard中啟用');
    }

    // 1. 創建Trial產品
    console.log('📦 創建Trial產品...');
    const trialProduct = await stripe.products.create({
      name: 'お試しプラン - 動画生成サービス',
      description: '月8本の動画生成が可能なお試しプラン',
      images: [`${process.env.VERCEL_URL || 'https://your-domain.vercel.app'}/assets/trial-plan-card.jpg`],
      metadata: {
        plan_type: 'trial',
        video_quota: '8'
      }
    });

    // 2. 創建Trial價格（訂閱制）
    console.log('💰 創建Trial價格...');
    const trialPrice = await stripe.prices.create({
      product: trialProduct.id,
      unit_amount: 300, // ¥300 (JPY不需要轉換為cents)
      currency: 'jpy',
      recurring: {
        interval: 'month'
      },
      metadata: {
        original_price: '600', // 原價¥600
        discount_info: '限定価格 (通常¥600 → ¥300)'
      }
    });

    // 3. 創建Standard產品
    console.log('📦 創建Standard產品...');
    const standardProduct = await stripe.products.create({
      name: 'スタンダードプラン - 動画生成サービス',
      description: '月100本の動画生成が可能なスタンダードプラン',
      images: [`${process.env.VERCEL_URL || 'https://your-domain.vercel.app'}/assets/standard-plan-card.jpg`],
      metadata: {
        plan_type: 'standard',
        video_quota: '100'
      }
    });

    // 4. 創建Standard價格（訂閱制）
    console.log('💰 創建Standard價格...');
    const standardPrice = await stripe.prices.create({
      product: standardProduct.id,
      unit_amount: 2980, // ¥2,980 (JPY不需要轉換為cents)
      currency: 'jpy',
      recurring: {
        interval: 'month'
      },
      metadata: {
        popular_plan: 'true'
      }
    });

    // 5. 創建Trial Payment Link
    console.log('🔗 創建Trial Payment Link...');
    const trialPaymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: trialPrice.id,
          quantity: 1,
        },
      ],
      payment_method_types: paymentMethods,
      // 支払い後のリダイレクト
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL || 'https://your-domain.com'}/subscription/success?plan=trial`
        }
      },
      metadata: {
        plan_type: 'trial',
        created_by: 'auto_script',
        mode: isTestMode ? 'test' : 'live'
      }
    });

    // 6. 創建Standard Payment Link
    console.log('🔗 創建Standard Payment Link...');
    const standardPaymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: standardPrice.id,
          quantity: 1,
        },
      ],
      payment_method_types: paymentMethods,
      // 支払い後のリダイレクト
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL || 'https://your-domain.com'}/subscription/success?plan=standard`
        }
      },
      metadata: {
        plan_type: 'standard',
        created_by: 'auto_script',
        mode: isTestMode ? 'test' : 'live'
      }
    });

    // 7. 輸出結果
    const results = {
      trial: {
        product_id: trialProduct.id,
        price_id: trialPrice.id,
        payment_link_id: trialPaymentLink.id,
        payment_link_url: trialPaymentLink.url
      },
      standard: {
        product_id: standardProduct.id,
        price_id: standardPrice.id,
        payment_link_id: standardPaymentLink.id,
        payment_link_url: standardPaymentLink.url
      }
    };

    console.log(`\n✅ Stripe Products 和 Payment Links 創建完成！(${isTestMode ? '測試模式' : '生產模式'})\n`);
    
    console.log('📋 結果摘要:');
    console.log('============================================');
    console.log(`お試しプラン:`);
    console.log(`  Product ID: ${results.trial.product_id}`);
    console.log(`  Price ID: ${results.trial.price_id}`);
    console.log(`  Payment Link: ${results.trial.payment_link_url}`);
    console.log('');
    console.log(`スタンダードプラン:`);
    console.log(`  Product ID: ${results.standard.product_id}`);
    console.log(`  Price ID: ${results.standard.price_id}`);
    console.log(`  Payment Link: ${results.standard.payment_link_url}`);
    console.log('============================================\n');

    console.log('🔧 請將以下環境變數添加到Vercel:');
    console.log('============================================');
    console.log(`STRIPE_TRIAL_PRODUCT_ID=${results.trial.product_id}`);
    console.log(`STRIPE_TRIAL_PRICE_ID=${results.trial.price_id}`);
    console.log(`STRIPE_TRIAL_URL=${results.trial.payment_link_url}`);
    console.log('');
    console.log(`STRIPE_STANDARD_PRODUCT_ID=${results.standard.product_id}`);
    console.log(`STRIPE_STANDARD_PRICE_ID=${results.standard.price_id}`);
    console.log(`STRIPE_STANDARD_URL=${results.standard.payment_link_url}`);
    console.log('============================================\n');

    if (isTestMode) {
      console.log('⚠️  測試模式提醒:');
      console.log('   這些是測試用的Payment Links，僅用於開發測試');
      console.log('   生產環境請使用 sk_live_ 開頭的API密鑰重新生成');
      console.log('');
    }

    return results;

  } catch (error) {
    console.error('❌ 創建Stripe產品失敗:', error);
    
    if (error.type === 'StripeCardError') {
      console.error('卡片錯誤:', error.message);
    } else if (error.type === 'StripeInvalidRequestError') {
      console.error('無效請求:', error.message);
      console.error('💡 提示：請檢查產品名稱是否重複，或支付方式是否已啟用');
    } else if (error.type === 'StripeAPIError') {
      console.error('Stripe API錯誤:', error.message);
    } else if (error.type === 'StripeConnectionError') {
      console.error('網路連接錯誤:', error.message);
    } else if (error.type === 'StripeAuthenticationError') {
      console.error('認證錯誤 - 請檢查API密鑰:', error.message);
      console.error('');
      console.error('🔑 獲取正確的API密鑰:');
      console.error('1. 登入 https://dashboard.stripe.com/');
      console.error('2. 點擊右上角的開發者 (Developers)');
      console.error('3. 選擇 API密鑰 (API Keys)');
      console.error('4. 複製 "秘密密鑰" (Secret Key)');
      console.error('   - 測試用: sk_test_...');
      console.error('   - 生產用: sk_live_...');
    } else {
      console.error('未知錯誤:', error.message);
    }
    
    throw error;
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  // 檢查環境變數
  if (!stripeKey) {
    console.error('❌ 請設置 STRIPE_KEY 或 STRIPE_SECRET_KEY 環境變數');
    console.error('');
    console.error('使用方法:');
    console.error('STRIPE_KEY=sk_test_... node scripts/create-stripe-payment-links.js');
    console.error('或');
    console.error('STRIPE_KEY=sk_live_... node scripts/create-stripe-payment-links.js');
    process.exit(1);
  }

  // 執行創建
  createStripeProducts()
    .then(() => {
      console.log('🎉 所有Payment Links創建完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { createStripeProducts }; 