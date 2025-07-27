// 引入 Stripe 配置
const stripeConfig = require('../config/stripe-config');

// 檢查API密鑰類型 - 支援兩種環境變數名稱
const stripeKey = process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY || stripeConfig.secretKey;
const isTestMode = stripeKey?.startsWith('sk_test_');
const isLiveMode = stripeKey?.startsWith('sk_live_') || stripeKey?.startsWith('rk_live_');

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
    console.log('🚀 開始創建Stripe產品和價格...');
    
    // 支援的支付方式（暂时只用card）
    const paymentMethods = ['card'];
    
    // 使用 Vercel Blob Storage 中的图片 URL（与 demo 图片相同的存储方式）
    const trialImageUrl = 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/payment-cards/trial-plan-card-N975LY0W25XEwRrP44qHVLcdEDvew5.jpg';
    const standardImageUrl = 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/payment-cards/standard-plan-card-ANII7ezO1Gf1k5oltKBGKCJww2WaNn.jpg';

    // 1. 創建Trial產品
    console.log('📦 創建Trial產品...');
    const trialProduct = await stripe.products.create({
      name: 'お試しプラン',
      description: '🎉 特別価格！通常¥4,000 → ¥300 (92%OFF)\n月8本の動画生成が可能なお試しプラン',
      images: [trialImageUrl],
      metadata: {
        plan_type: 'trial',
        video_quota: '8',
        original_price: '4000',
        discount_percentage: '92'
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
        original_price: '4000',
        discount_info: '特別価格 (通常¥4,000 → ¥300)',
        discount_percentage: '92'
      }
    });

    // 3. 創建Standard產品
    console.log('📦 創建Standard產品...');
    const standardProduct = await stripe.products.create({
      name: 'スタンダードプラン',
      description: '🔥 大幅割引！通常¥50,000 → ¥2,980 (94%OFF)\n月100本の動画生成が可能なスタンダードプラン',
      images: [standardImageUrl],
      metadata: {
        plan_type: 'standard',
        video_quota: '100',
        original_price: '50000',
        discount_percentage: '94'
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
        original_price: '50000',
        discount_info: '大幅割引 (通常¥50,000 → ¥2,980)',
        discount_percentage: '94',
        popular_plan: 'true'
      }
    });

    // 5. 創建Trial Payment Link
    console.log('🔗 創建Trial Payment Link...');
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://line-photo-revival-bot.vercel.app';
    
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
          url: `${baseUrl}/subscription/success?plan=trial&user_id={CHECKOUT_SESSION_ID}`
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
          url: `${baseUrl}/subscription/success?plan=standard&user_id={CHECKOUT_SESSION_ID}`
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