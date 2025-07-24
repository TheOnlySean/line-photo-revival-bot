const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function testQuickReply() {
  console.log('🧪 开始测试Quick Reply功能...');
  
  try {
    // 测试用户ID - 请替换为您的LINE用户ID
    const testUserId = 'U23ea34c52091796e999d10f150460c78'; // 替换为实际用户ID
    
    // 创建Quick Reply消息
    const quickReplyMessage = {
      type: 'text',
      text: '🧪 Quick Reply功能测试\n\n📸 请从下方按钮选择上传方式：',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'cameraRoll',
              label: '📱 カメラロールから選ぶ'
            }
          },
          {
            type: 'action',
            action: {
              type: 'camera',
              label: '📷 カメラを起動する'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '❌ テストを終了',
              data: 'action=test_end'
            }
          }
        ]
      }
    };
    
    console.log('📤 发送Quick Reply测试消息...');
    console.log('📋 消息内容:', JSON.stringify(quickReplyMessage, null, 2));
    
    await client.pushMessage(testUserId, quickReplyMessage);
    
    console.log('✅ Quick Reply测试消息发送成功！');
    console.log('');
    console.log('📱 在LINE中检查以下内容：');
    console.log('1. 消息是否正常显示');
    console.log('2. 是否在消息下方显示两个按钮：');
    console.log('   - 📱 カメラロールから選ぶ');
    console.log('   - 📷 カメラを起動する');
    console.log('3. 点击按钮是否能正常打开相机或相册');
    console.log('');
    console.log('💡 如果按钮显示但点击无效果，可能是以下原因：');
    console.log('- 设备不支持Quick Reply功能');
    console.log('- LINE版本过旧');
    console.log('- Bot权限设置问题');
    
  } catch (error) {
    console.error('❌ Quick Reply测试失败:', error);
    
    if (error.response) {
      console.error('📊 API错误状态:', error.response.status);
      console.error('📋 API错误详情:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('');
    console.log('🔧 故障排除建议:');
    console.log('1. 检查LINE Bot配置是否正确');
    console.log('2. 确认用户ID是否有效');
    console.log('3. 验证Bot是否已添加为好友');
    console.log('4. 检查API权限设置');
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
🧪 Quick Reply功能测试工具

功能：
- 测试LINE Bot的Quick Reply按钮功能
- 验证相机和相册按钮是否正常工作
- 提供详细的测试结果和故障排除建议

使用方法：
  node scripts/test-quickreply.js

注意事项：
- 需要修改脚本中的testUserId为实际用户ID
- 确保Bot已添加为测试用户的好友
- 测试设备需要支持LINE的Quick Reply功能

支持的Quick Reply按钮类型：
- camera: 启动相机
- cameraRoll: 打开相册/相机胶卷  
- location: 获取位置信息
- postback: 发送回调数据
- message: 发送预设消息
- uri: 打开网页链接
- datetime: 选择日期时间

Quick Reply的优势：
- 提供更直观的用户界面
- 减少用户输入步骤
- 提高交互效率
- 支持多种操作类型
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    testQuickReply();
  }
}

module.exports = testQuickReply; 