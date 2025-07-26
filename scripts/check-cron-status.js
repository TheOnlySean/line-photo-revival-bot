const db = require('../config/database');

async function checkCronStatus() {
  console.log('🕒 檢查 Cron Job 狀態...');
  
  try {
    // 檢查有多少待處理的視頻任務
    const pendingQuery = `
      SELECT 
        u.line_user_id,
        v.id,
        v.status,
        v.task_id,
        v.created_at,
        v.image_url IS NULL as is_text_only
      FROM videos v
      JOIN users u ON u.id = v.user_id
      WHERE v.status IN ('processing', 'pending')
      AND v.task_id IS NOT NULL
      ORDER BY v.created_at DESC
      LIMIT 10;
    `;
    
    const { rows } = await db.query(pendingQuery);
    
    console.log(`📊 發現 ${rows.length} 個待處理任務:`);
    
    rows.forEach((row, index) => {
      console.log(`${index + 1}. 用戶: ${row.line_user_id}`);
      console.log(`   狀態: ${row.status}`);
      console.log(`   任務ID: ${row.task_id}`);
      console.log(`   純文字: ${row.is_text_only ? '是' : '否'}`);
      console.log(`   創建時間: ${row.created_at}`);
      console.log('---');
    });
    
    if (rows.length === 0) {
      console.log('✅ 沒有待處理的任務');
    }
    
  } catch (error) {
    console.error('❌ 檢查失敗:', error);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  checkCronStatus();
}

module.exports = checkCronStatus; 