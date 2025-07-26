const LineAdapter = require('../adapters/line-adapter');
const richMenuIds = require('../config/richmenu-ids.json');

async function testMenuSwitching() {
  console.log('🧪 測試菜單切換功能...');
  
  try {
    const lineAdapter = new LineAdapter();
    await lineAdapter.initializeRichMenuIds();
    
    const testUserId = 'U123456789'; // 替換為實際的用戶ID
    
    console.log('📋 當前Rich Menu配置:');
    console.log(`Main Menu ID: ${richMenuIds.mainRichMenuId}`);
    console.log(`Processing Menu ID: ${richMenuIds.processingRichMenuId}`);
    
    // 測試切換到processing menu
    console.log('🔄 切換到Processing Menu...');
    await lineAdapter.switchToProcessingMenu(testUserId);
    console.log('✅ 切換到Processing Menu成功');
    
    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 測試切換回main menu
    console.log('🔄 切換回Main Menu...');
    await lineAdapter.switchToMainMenu(testUserId);
    console.log('✅ 切換回Main Menu成功');
    
    console.log('✅ 菜單切換測試完成');
    
  } catch (error) {
    console.error('❌ 菜單切換測試失敗:', error);
  }
}

if (require.main === module) {
  testMenuSwitching();
}

module.exports = testMenuSwitching; 