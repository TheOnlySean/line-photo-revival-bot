/**
 * 測試 Stripe API 連接
 * 用於驗證 API 密鑰是否有效
 */

const readline = require('readline');

// 創建讀取介面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testStripeConnection() {
  try {
    console.log('🔑 請輸入您的 Stripe Secret Key (sk_live_... 或 sk_test_...)：');
    
    rl.question('Stripe Key: ', async (stripeKey) => {
      try {
        // 檢查密鑰格式
        if (!stripeKey.startsWith('sk_live_') && !stripeKey.startsWith('sk_test_')) {
          console.error('❌ 無效的密鑰格式！請確保使用 sk_live_ 或 sk_test_ 開頭的密鑰');
          rl.close();
          return;
        }

        console.log(`\n🚀 測試 Stripe 連接... (${stripeKey.startsWith('sk_test_') ? '測試模式' : '生產模式'})`);
        
        const stripe = require('stripe')(stripeKey);
        
        // 測試 API 連接
        const account = await stripe.accounts.retrieve();
        console.log('✅ Stripe 連接成功！');
        console.log(`賬戶 ID: ${account.id}`);
        console.log(`國家: ${account.country}`);
        console.log(`貨幣: ${account.default_currency}`);
        
        // 詢問是否創建 Payment Links
        rl.question('\n是否要創建 Payment Links？(y/n): ', async (answer) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            console.log('\n🔗 開始創建 Payment Links...');
            
            // 設置環境變數並執行創建腳本
            process.env.STRIPE_KEY = stripeKey;
            
            try {
              const { createStripeProducts } = require('./create-stripe-payment-links.js');
              await createStripeProducts();
              console.log('\n🎉 Payment Links 創建完成！');
            } catch (error) {
              console.error('❌ 創建失敗:', error.message);
            }
          } else {
            console.log('👋 測試完成，未創建 Payment Links');
          }
          
          rl.close();
        });
        
      } catch (error) {
        console.error('❌ Stripe 連接失敗:', error.message);
        
        if (error.type === 'StripeAuthenticationError') {
          console.error('請檢查您的 API 密鑰是否正確');
        }
        
        rl.close();
      }
    });
    
  } catch (error) {
    console.error('❌ 測試腳本執行失敗:', error);
    rl.close();
  }
}

// 執行測試
if (require.main === module) {
  testStripeConnection();
}

module.exports = { testStripeConnection }; 