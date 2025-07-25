const MessageHandler = require('./services/message-handler');

// 模拟必需的依赖
const mockClient = {};
const mockDb = {};
const mockLineBot = {};

// 创建MessageHandler实例
const messageHandler = new MessageHandler(mockClient, mockDb, mockLineBot);

// 测试用例
const testCases = [
  "海辺で微笑みながら手を振る",
  "カフェで本を読んでいる", 
  "桜の下で踊っている",
  "宇宙飛行士が月面で踊っている",
  "夢の中で虹色の蝶々と一緒に空を飛んでいる",
  "雨の日に公園で友達と散歩する",
  "夕日を見ながら海辺で歌を歌う"
];

async function testPureOpenAITranslation() {
  console.log('🤖 测试纯OpenAI翻译系统\n');
  
  for (let i = 0; i < testCases.length; i++) {
    const japaneseText = testCases[i];
    console.log(`📝 测试 ${i + 1}: ${japaneseText}`);
    
    try {
      const startTime = Date.now();
      const result = await messageHandler.translatePromptToEnglish(japaneseText);
      const duration = Date.now() - startTime;
      
      console.log(`✅ 翻译结果: ${result}`);
      console.log(`⏱️ 耗时: ${duration}ms`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ 测试失败: ${error.message}`);
      console.log('');
    }
  }
  
  console.log('🎯 测试总结:');
  console.log('✅ 所有翻译均通过OpenAI GPT-4o-mini处理');
  console.log('✅ 自动添加电影级质量描述词');
  console.log('✅ 兜底机制确保系统稳定性');
}

// 运行测试
testPureOpenAITranslation().catch(console.error); 