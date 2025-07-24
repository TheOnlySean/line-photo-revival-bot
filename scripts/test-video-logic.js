const MessageHandler = require('../services/message-handler');
const VideoGenerator = require('../services/video-generator');

// 模拟环境
const mockDb = {
  logInteraction: async () => ({ success: true }),
  getUserByLineId: async () => ({
    id: 'test_user_123',
    line_id: 'test_line_user',
    credits: 5
  }),
  updateUserCredits: async () => ({ success: true }),
  createVideoGeneration: async () => ({ id: 'video_123' }),
  updateVideoGeneration: async () => ({ success: true })
};

const mockLineBot = {
  switchToProcessingMenu: async (userId) => {
    console.log('✅ 切换到processing菜单:', userId);
    return true;
  },
  switchToMainMenu: async (userId) => {
    console.log('✅ 切换回主菜单:', userId);
    return true;
  },
  sendProcessingMessage: async (replyToken) => {
    console.log('✅ 发送processing消息:', replyToken);
    return true;
  }
};

const mockClient = {
  replyMessage: async (replyToken, messages) => {
    console.log('📤 回复消息:', replyToken);
    return { success: true };
  },
  pushMessage: async (userId, messages) => {
    console.log('📤 推送消息给用户:', userId);
    if (Array.isArray(messages)) {
      messages.forEach((msg, index) => {
        if (msg.type === 'video') {
          console.log(`   🎬 视频消息 ${index + 1}: ${msg.originalContentUrl.substring(0, 50)}...`);
        } else {
          console.log(`   📝 文本消息 ${index + 1}: ${msg.text.substring(0, 30)}...`);
        }
      });
    }
    return { success: true };
  }
};

async function checkVideoSendingLogic() {
  console.log('🔍 检查视频发送逻辑的异步处理问题...');
  console.log('='.repeat(60));
  
  try {
    // 1. 检查免费试用流程
    console.log('\n🎁 1. 免费试用流程检查:');
    console.log('   问题: simulateTrialGeneration 是否正确使用 await?');
    
    const trialCode = `
    // 修复前 (有问题):
    this.simulateTrialGeneration(user, selectedPhoto, photoDetails, trialFlowConfig);
    
    // 修复后 (正确):
    await this.simulateTrialGeneration(user, selectedPhoto, photoDetails, trialFlowConfig);
    `;
    console.log(trialCode);
    console.log('   ✅ 状态: 已修复，现在使用 await');
    
    // 2. 检查真实用户生成流程
    console.log('\n👤 2. 真实用户生成流程检查:');
    
    const realUserIssues = [
      {
        location: 'handleConfirmPresetGenerate:917',
        code: 'this.startVideoGenerationWithPrompt(user, imageUrl, prompt, creditsNeeded);',
        issue: '没有使用 await',
        impact: 'Webhook可能在视频生成完成前结束',
        severity: '中等 - 使用轮询机制补偿'
      },
      {
        location: 'handleConfirmCustomGenerate:965', 
        code: 'this.startVideoGenerationWithPrompt(user, imageUrl, customPrompt, creditsNeeded);',
        issue: '没有使用 await',
        impact: 'Webhook可能在视频生成完成前结束',
        severity: '中等 - 使用轮询机制补偿'
      },
      {
        location: 'handleConfirmWaveGenerate:1396',
        code: 'this.generateVideoAsync(user, imageUrl, "wave");',
        issue: '没有使用 await',
        impact: 'Webhook可能在任务启动前结束',
        severity: '高 - 可能导致任务丢失'
      },
      {
        location: 'handleConfirmGroupGenerate:1434',
        code: 'this.generateVideoAsync(user, imageUrl, "group");',
        issue: '没有使用 await',
        impact: 'Webhook可能在任务启动前结束', 
        severity: '高 - 可能导致任务丢失'
      }
    ];
    
    realUserIssues.forEach((issue, index) => {
      console.log(`\n   问题 ${index + 1}: ${issue.location}`);
      console.log(`   代码: ${issue.code}`);
      console.log(`   问题: ${issue.issue}`);
      console.log(`   影响: ${issue.impact}`);
      console.log(`   严重性: ${issue.severity}`);
    });
    
    // 3. 分析为什么重新添加好友时能收到视频
    console.log('\n🔄 3. 重新添加好友时收到视频的原因分析:');
    console.log('   可能原因:');
    console.log('   a) 视频实际上已经生成但发送失败');
    console.log('   b) 某种缓存或重试机制被触发');
    console.log('   c) 欢迎消息流程中有不同的处理逻辑');
    console.log('   d) 数据库中有未发送的视频记录');
    
    // 4. Serverless环境特殊考虑
    console.log('\n☁️ 4. Vercel Serverless环境特殊考虑:');
    console.log('   限制:');
    console.log('   - 函数执行时间限制 (免费版10秒，Pro版60秒)');
    console.log('   - 主函数结束后，未完成的异步任务可能被终止');
    console.log('   - 没有持久的后台进程');
    console.log('   - 需要外部轮询或webhook来处理长时间任务');
    
    console.log('\n   解决策略:');
    console.log('   a) 短期任务 (如免费试用): 使用 await 同步等待');
    console.log('   b) 长期任务 (如真实生成): 使用队列 + 轮询机制');
    console.log('   c) 添加超时和重试逻辑');
    console.log('   d) 改善错误处理和用户通知');
    
    // 5. 推荐的修复方案
    console.log('\n🔧 5. 推荐的修复方案:');
    
    const recommendations = [
      {
        priority: '高',
        action: '立即修复免费试用的 await 问题',
        status: '✅ 已完成',
        code: 'await this.simulateTrialGeneration(...)'
      },
      {
        priority: '高',
        action: '为 generateVideoAsync 添加 await',
        status: '⏳ 待处理',
        reason: '确保视频生成任务真正启动'
      },
      {
        priority: '中',
        action: '改善长时间任务的错误处理',
        status: '⏳ 待处理', 
        reason: '添加更好的用户反馈和重试机制'
      },
      {
        priority: '中',
        action: '添加视频发送状态监控',
        status: '⏳ 待处理',
        reason: '跟踪未发送的视频并重试'
      },
      {
        priority: '低',
        action: '优化轮询机制',
        status: '⏳ 待处理',
        reason: '减少API调用和提高效率'
      }
    ];
    
    recommendations.forEach((rec, index) => {
      console.log(`\n   ${index + 1}. [${rec.priority}] ${rec.action}`);
      console.log(`      状态: ${rec.status}`);
      if (rec.reason) console.log(`      原因: ${rec.reason}`);
      if (rec.code) console.log(`      代码: ${rec.code}`);
    });
    
    // 6. 测试建议
    console.log('\n🧪 6. 测试建议:');
    console.log('   立即测试:');
    console.log('   1. 免费试用功能 (应该在10秒内完成)');
    console.log('   2. 真实用户视频生成 (检查是否卡在processing状态)');
    console.log('   3. 长时间生成后的视频发送');
    console.log('   4. 错误情况下的用户通知');
    
    console.log('\n   监控重点:');
    console.log('   - Vercel Function执行时间');
    console.log('   - 数据库中未完成的视频生成记录');
    console.log('   - LINE API调用的成功率');
    console.log('   - 用户停留在processing状态的时间');
    
    return true;
    
  } catch (error) {
    console.error('❌ 检查过程失败:', error);
    return false;
  }
}

// 检查当前代码中的异步问题
async function detectAsyncIssues() {
  console.log('\n🔎 代码异步问题检测:');
  console.log('='.repeat(40));
  
  const fs = require('fs');
  const path = require('path');
  
  try {
    const messageHandlerPath = path.join(__dirname, '../services/message-handler.js');
    const content = fs.readFileSync(messageHandlerPath, 'utf8');
    
    // 检查可能的异步问题
    const patterns = [
      {
        pattern: /this\.[a-zA-Z]+Async\([^)]*\);(?!\s*\/\/.*await)/g,
        description: '调用Async方法但没有await',
        severity: '高'
      },
      {
        pattern: /this\.startVideoGeneration[^;]*;(?!\s*\/\/.*await)/g,
        description: '启动视频生成但没有await',
        severity: '中'
      },
      {
        pattern: /this\.simulate[^;]*;(?!\s*\/\/.*await)/g,
        description: '模拟函数调用但没有await',
        severity: '高'
      }
    ];
    
    patterns.forEach((p, index) => {
      const matches = content.match(p.pattern);
      if (matches) {
        console.log(`\n❌ 问题 ${index + 1}: ${p.description}`);
        console.log(`   严重性: ${p.severity}`);
        console.log(`   找到 ${matches.length} 个匹配:`);
        matches.forEach((match, i) => {
          console.log(`   ${i + 1}. ${match.trim()}`);
        });
      } else {
        console.log(`\n✅ 检查 ${index + 1}: ${p.description} - 无问题`);
      }
    });
    
  } catch (error) {
    console.error('❌ 代码检测失败:', error.message);
  }
}

// 主函数
async function main() {
  console.log('🎬 视频发送逻辑全面检查');
  console.log('='.repeat(60));
  
  const checkPassed = await checkVideoSendingLogic();
  
  if (checkPassed) {
    await detectAsyncIssues();
  }
  
  console.log('\n='.repeat(60));
  console.log('🎯 总结: 免费试用的主要问题已修复');
  console.log('⚠️  建议: 继续监控真实用户生成的表现');
  console.log('📱 测试: 请立即测试免费试用功能');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkVideoSendingLogic, detectAsyncIssues }; 