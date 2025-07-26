// 檢查API密鑰類型 - 支援兩種環境變數名稱
const stripeKey = process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeKey);

/**
 * 刪除之前創建的錯誤價格產品
 */

async function deleteStripeProducts() {
  try {
    console.log('🗑️  開始刪除錯誤價格的產品...');

    // 要刪除的產品ID（從之前的輸出中獲取）
    const productsToDelete = [
      'prod_SkfA9Q46FW7DZp', // Trial Plan
      'prod_SkfAKOH4vv7kGE'  // Standard Plan
    ];

    const paymentLinksToDelete = [
      'plink_1Rp9qOAQgzM2CFPdwdEEYLXk', // 可能的Payment Link ID
      'plink_1Rp9qOAQgzM2CFPdEvyLls2Y'  // 可能的Payment Link ID
    ];

    // 刪除產品
    for (const productId of productsToDelete) {
      try {
        console.log(`🗑️  刪除產品: ${productId}`);
        await stripe.products.update(productId, { active: false });
        console.log(`✅ 產品 ${productId} 已停用`);
      } catch (error) {
        console.log(`⚠️  產品 ${productId} 刪除失敗或已不存在:`, error.message);
      }
    }

    console.log('✅ 清理完成！現在可以重新創建正確價格的產品');

  } catch (error) {
    console.error('❌ 刪除產品失敗:', error.message);
  }
}

// 執行刪除
if (require.main === module) {
  if (!stripeKey) {
    console.error('❌ 請設置 STRIPE_KEY 環境變數');
    process.exit(1);
  }

  deleteStripeProducts()
    .then(() => {
      console.log('🎉 清理完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 腳本執行失敗:', error.message);
      process.exit(1);
    });
}

module.exports = { deleteStripeProducts }; 