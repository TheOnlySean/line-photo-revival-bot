const db = require('../config/database');

// 演示内容数据
const DEMO_CONTENTS = [
  {
    title: '复古美女',
    imageUrl: 'https://example.com/demo1.jpg', // 需要替换为实际的图片URL
    videoUrl: 'https://example.com/demo1.mp4', // 需要替换为实际的视频URL
    description: '优雅的复古风格女性肖像，展现经典美感',
    sortOrder: 1
  },
  {
    title: '商务男士',
    imageUrl: 'https://example.com/demo2.jpg', // 需要替换为实际的图片URL
    videoUrl: 'https://example.com/demo2.mp4', // 需要替换为实际的视频URL
    description: '专业的商务男性形象，彰显职场风范',
    sortOrder: 2
  },
  {
    title: '青春少女',
    imageUrl: 'https://example.com/demo3.jpg', // 需要替换为实际的图片URL
    videoUrl: 'https://example.com/demo3.mp4', // 需要替换为实际的视频URL
    description: '活泼可爱的青春少女，充满朝气活力',
    sortOrder: 3
  }
];

async function initDemoContent() {
  try {
    console.log('🎬 开始初始化演示内容...');

    // 清除现有演示内容
    await db.query('DELETE FROM line_demo_contents');
    console.log('🗑️ 清除现有演示内容');

    // 插入新的演示内容
    for (const demo of DEMO_CONTENTS) {
      const result = await db.insertDemoContent(
        demo.title,
        demo.imageUrl,
        demo.videoUrl,
        demo.description,
        demo.sortOrder
      );
      
      console.log(`✅ 添加演示内容: ${demo.title} (ID: ${result.id})`);
    }

    console.log('🎉 演示内容初始化完成!');
    
    // 验证插入结果
    const contents = await db.getDemoContents();
    console.log(`📊 当前演示内容数量: ${contents.length}`);
    
    contents.forEach(content => {
      console.log(`  - ${content.title}: ${content.image_url}`);
    });

  } catch (error) {
    console.error('❌ 初始化演示内容失败:', error);
  }
}

async function testDatabaseConnection() {
  try {
    console.log('🔍 测试数据库连接...');
    
    const result = await db.query('SELECT COUNT(*) as count FROM users');
    console.log(`✅ 数据库连接正常，用户总数: ${result.rows[0].count}`);
    
    const videoCount = await db.query('SELECT COUNT(*) as count FROM videos');
    console.log(`📹 视频记录总数: ${videoCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ 数据库连接测试失败:', error);
  }
}

// 主函数
async function main() {
  console.log('🚀 LINE Bot 初始化脚本');
  console.log('========================');
  
  await testDatabaseConnection();
  console.log('');
  await initDemoContent();
  
  console.log('');
  console.log('✨ 初始化完成！');
  console.log('');
  console.log('📝 下一步：');
  console.log('1. 替换演示内容中的图片和视频URL为实际地址');
  console.log('2. 配置KIE.AI API Key');
  console.log('3. 在LINE Developer Console设置Webhook URL');
  console.log('4. 启动服务器: npm start');
  
  // 关闭数据库连接
  await db.close();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  initDemoContent,
  testDatabaseConnection,
  DEMO_CONTENTS
}; 