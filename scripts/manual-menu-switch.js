const LineAdapter = require('../adapters/line-adapter');

async function manualMenuSwitch() {
  console.log('🔧 手動切換菜單...');
  
  // 這裡需要替換為你的實際用戶ID
  const userId = process.argv[2];
  
  if (!userId) {
    console.log('❌ 請提供用戶ID: node scripts/manual-menu-switch.js <USER_ID>');
    return;
  }
  
  try {
    const lineAdapter = new LineAdapter();
    await lineAdapter.initializeRichMenuIds();
    
    console.log(`👤 為用戶 ${userId} 切換菜單...`);
    
    // 切換到主菜單
    const result = await lineAdapter.switchToMainMenu(userId);
    
    if (result) {
      console.log('✅ 成功切換到主菜單');
    } else {
      console.log('❌ 切換主菜單失敗');
    }
    
  } catch (error) {
    console.error('❌ 手動切換菜單失敗:', error);
  }
}

if (require.main === module) {
  manualMenuSwitch();
}

module.exports = manualMenuSwitch; 