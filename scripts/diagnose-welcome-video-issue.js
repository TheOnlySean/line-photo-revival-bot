const MessageHandler = require('../services/message-handler');
const LineBot = require('../services/line-bot');

async function diagnoseWelcomeVideoIssue() {
  console.log('🔍 诊断重新添加好友时发送旧视频的问题');
  console.log('='.repeat(60));
  
  try {
    // 1. 分析欢迎消息流程
    console.log('\n📋 1. 欢迎消息流程分析:');
    
    const welcomeFlow = [
      '用户添加好友 → handleFollow',
      'handleFollow → sendWelcomeMessage',
      'sendWelcomeMessage → sendFreeTrialOptions',
      'sendFreeTrialOptions → 发送试用选项'
    ];
    
    welcomeFlow.forEach((step, index) => {
      console.log(`   ${index + 1}. ${step}`);
    });
    
    // 2. 检查可能发送视频的地方
    console.log('\n🎬 2. 可能发送视频的地方:');
    
    const fs = require('fs');
    const path = require('path');
    
    // 读取所有服务文件
    const servicePaths = [
      '../services/message-handler.js',
      '../services/line-bot.js',
      '../services/video-generator.js'
    ];
    
    for (const servicePath of servicePaths) {
      const fullPath = path.join(__dirname, servicePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // 查找可能发送视频的模式
      const videoPatterns = [
        /type:\s*['"]video['"]/g,
        /originalContentUrl/g,
        /previewImageUrl/g,
        /pushMessage.*video/gi,
        /replyMessage.*video/gi
      ];
      
      console.log(`\n   📁 检查文件: ${servicePath}`);
      
      videoPatterns.forEach((pattern, index) => {
        const matches = content.match(pattern);
        if (matches) {
          console.log(`     🎬 模式 ${index + 1}: 找到 ${matches.length} 个匹配`);
          
          // 获取匹配行的上下文
          const lines = content.split('\n');
          const contextLines = [];
          
          lines.forEach((line, lineIndex) => {
            if (pattern.test(line)) {
              const start = Math.max(0, lineIndex - 2);
              const end = Math.min(lines.length, lineIndex + 3);
              contextLines.push({
                lineNumber: lineIndex + 1,
                context: lines.slice(start, end).map((l, i) => 
                  `${start + i + 1}: ${l}`
                ).join('\n')
              });
            }
          });
          
          if (contextLines.length > 0) {
            console.log(`       📍 位置:`);
            contextLines.slice(0, 3).forEach(ctx => {
              console.log(`         行 ${ctx.lineNumber}:`);
              console.log(`${ctx.context}\n`);
            });
          }
        } else {
          console.log(`     ✅ 模式 ${index + 1}: 未找到匹配`);
        }
      });
    }
    
    // 3. 分析可能的异步任务或缓存问题
    console.log('\n⏰ 3. 异步任务和缓存问题分析:');
    
    const possibleCauses = [
      {
        cause: '轮询任务未正确清理',
        description: 'pollVideoStatus 可能还在运行',
        check: 'VideoGenerator.pollVideoStatus',
        solution: '确保轮询任务在用户取消关注时清理'
      },
      {
        cause: 'setTimeout 延迟任务',
        description: 'handleDemoGenerate 使用了 setTimeout',
        check: 'MessageHandler.handleDemoGenerate',
        solution: '检查是否有未清理的定时器'
      },
      {
        cause: '数据库状态不一致',
        description: '用户状态或视频记录残留',
        check: '数据库用户状态表',
        solution: '清理用户状态和未完成的视频记录'
      },
      {
        cause: 'LINE SDK缓存',
        description: 'LINE Client可能有消息缓存',
        check: 'LINE Bot SDK行为',
        solution: '检查LINE消息发送的时序'
      },
      {
        cause: 'Vercel函数实例复用',
        description: 'serverless函数实例间的状态泄漏',
        check: '全局变量和内存状态',
        solution: '确保没有全局状态污染'
      }
    ];
    
    possibleCauses.forEach((cause, index) => {
      console.log(`\n   ${index + 1}. 🔍 ${cause.cause}`);
      console.log(`      描述: ${cause.description}`);
      console.log(`      检查: ${cause.check}`);
      console.log(`      解决: ${cause.solution}`);
    });
    
    // 4. 具体检查欢迎消息代码
    console.log('\n📝 4. 欢迎消息代码详细检查:');
    
    const messageHandlerPath = path.join(__dirname, '../services/message-handler.js');
    const messageHandlerContent = fs.readFileSync(messageHandlerPath, 'utf8');
    
    // 查找 handleFollow 方法
    const followMatch = messageHandlerContent.match(/async handleFollow\(event\)[^}]*{[\s\S]*?^  }/m);
    if (followMatch) {
      console.log('   📍 找到 handleFollow 方法:');
      console.log('   ```javascript');
      console.log(followMatch[0].split('\n').map((line, i) => `   ${i + 1}. ${line}`).join('\n'));
      console.log('   ```');
    }
    
    // 5. 检查是否有全局状态或缓存
    console.log('\n🌐 5. 全局状态检查:');
    
    const globalPatterns = [
      /global\./g,
      /process\.env\./g,
      /require\.cache/g,
      /module\.exports\s*=\s*{/g
    ];
    
    servicePaths.forEach(servicePath => {
      const fullPath = path.join(__dirname, servicePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      console.log(`\n   📁 ${servicePath}:`);
      
      globalPatterns.forEach((pattern, index) => {
        const matches = content.match(pattern);
        if (matches) {
          console.log(`     ⚠️  全局状态 ${index + 1}: ${matches.length} 个匹配`);
          
          // 显示前几个匹配的上下文
          const lines = content.split('\n');
          lines.forEach((line, lineIndex) => {
            if (pattern.test(line)) {
              console.log(`       行 ${lineIndex + 1}: ${line.trim()}`);
            }
          });
        }
      });
    });
    
    // 6. 推荐的调试步骤
    console.log('\n🔧 6. 推荐的调试步骤:');
    
    const debugSteps = [
      '在 handleFollow 中添加详细日志',
      '检查数据库中是否有用户的残留视频记录',
      '监控 Vercel 函数日志查看异步任务',
      '在欢迎消息中添加唯一标识符',
      '测试不同用户ID的行为',
      '检查LINE Webhook的重复调用'
    ];
    
    debugSteps.forEach((step, index) => {
      console.log(`   ${index + 1}. ${step}`);
    });
    
    // 7. 临时解决方案
    console.log('\n🚑 7. 临时解决方案:');
    
    const tempSolutions = [
      '在 handleFollow 开始时清理用户的所有pending状态',
      '添加用户重新关注的检测逻辑',
      '实现更严格的视频发送权限检查',
      '在欢迎消息前延迟1-2秒',
      '添加消息去重机制'
    ];
    
    tempSolutions.forEach((solution, index) => {
      console.log(`   ${index + 1}. ${solution}`);
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ 诊断过程失败:', error);
    return false;
  }
}

// 创建修复建议脚本
async function createWelcomeVideoFix() {
  console.log('\n\n🔧 创建欢迎视频问题修复建议');
  console.log('='.repeat(50));
  
  const fixSuggestions = `
// 修复建议 1: 在 handleFollow 中清理用户状态
async handleFollow(event) {
  const userId = event.source.userId;
  console.log('👋 新用户添加好友:', userId);

  try {
    // 🔧 新增: 清理用户的所有pending状态
    console.log('🧹 清理用户pending状态...');
    await this.db.clearUserState(userId);
    await this.db.clearPendingVideoRecords(userId);
    
    // 获取用户资料
    const profile = await this.client.getProfile(userId);
    // ... 其余代码保持不变
  }
}

// 修复建议 2: 添加消息去重机制
async sendWelcomeMessage(replyToken, userId) {
  // 🔧 新增: 检查是否已经发送过欢迎消息
  const lastWelcome = await this.db.getLastWelcomeTime(userId);
  const now = Date.now();
  
  if (lastWelcome && (now - lastWelcome) < 60000) { // 1分钟内不重复发送
    console.log('⚠️ 欢迎消息1分钟内已发送，跳过重复发送');
    return;
  }
  
  // 发送欢迎消息
  await this.client.replyMessage(replyToken, welcomeMessages);
  
  // 记录发送时间
  await this.db.recordWelcomeTime(userId, now);
}

// 修复建议 3: 改善异步任务管理
class VideoTaskManager {
  constructor() {
    this.activeTasks = new Map(); // userId -> Set<taskId>
  }
  
  addTask(userId, taskId) {
    if (!this.activeTasks.has(userId)) {
      this.activeTasks.set(userId, new Set());
    }
    this.activeTasks.get(userId).add(taskId);
  }
  
  removeTask(userId, taskId) {
    const userTasks = this.activeTasks.get(userId);
    if (userTasks) {
      userTasks.delete(taskId);
      if (userTasks.size === 0) {
        this.activeTasks.delete(userId);
      }
    }
  }
  
  clearUserTasks(userId) {
    this.activeTasks.delete(userId);
    console.log(\`🧹 清理用户 \${userId} 的所有异步任务\`);
  }
  
  hasActiveTasks(userId) {
    const userTasks = this.activeTasks.get(userId);
    return userTasks && userTasks.size > 0;
  }
}
`;

  console.log(fixSuggestions);
  
  console.log('\n💡 立即应用的快速修复:');
  console.log('1. 在 handleFollow 开始时清理用户状态');
  console.log('2. 为免费试用添加时间窗口限制');
  console.log('3. 增强日志记录以便调试');
}

// 主函数
async function main() {
  const diagnosisResult = await diagnoseWelcomeVideoIssue();
  
  if (diagnosisResult) {
    await createWelcomeVideoFix();
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 下一步: 测试免费试用功能是否正常');
  console.log('📱 如果还有问题，请提供详细的复现步骤');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { diagnoseWelcomeVideoIssue, createWelcomeVideoFix }; 