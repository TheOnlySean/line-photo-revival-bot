const db = require('../config/database');
const VideoGenerator = require('../services/video-generator');

async function testCheckStatus() {
  console.log('🧪 測試 CHECK_STATUS 功能...');
  
  try {
    // 模擬消息回調
    const messageCallback = async (eventType, data) => {
      console.log(`📢 收到事件: ${eventType}`, data);
    };
    
    const videoGenerator = new VideoGenerator(db, messageCallback);
    
    // 測試檢查待處理任務
    console.log('🔍 檢查待處理任務...');
    const testUserId = 'U123456789'; // 替換為實際的用戶ID
    
    await videoGenerator.checkPendingTasks(testUserId);
    
    console.log('✅ 測試完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  testCheckStatus();
}

module.exports = testCheckStatus; 