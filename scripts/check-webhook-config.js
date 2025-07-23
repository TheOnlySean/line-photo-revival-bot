const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

const CORRECT_WEBHOOK_URL = 'https://line-photo-revival-bot.vercel.app/webhook';

async function checkAndSetWebhookConfig() {
  try {
    console.log('🔍 检查当前Webhook配置...');
    
    // 1. 获取当前webhook配置
    console.log('📡 获取当前webhook端点信息...');
    const currentConfig = await client.getWebhookEndpointInfo();
    console.log('📊 当前Webhook配置:');
    console.log('  URL:', currentConfig.endpoint);
    console.log('  激活状态:', currentConfig.active);
    
    // 2. 检查URL是否正确
    if (currentConfig.endpoint === CORRECT_WEBHOOK_URL) {
      console.log('✅ Webhook URL配置正确！');
      
      if (currentConfig.active) {
        console.log('✅ Webhook已激活');
      } else {
        console.log('⚠️ Webhook未激活，但URL正确');
      }
      
    } else {
      console.log('❌ Webhook URL配置错误！');
      console.log('🔧 当前URL:', currentConfig.endpoint);
      console.log('🎯 应该设置为:', CORRECT_WEBHOOK_URL);
      
      // 3. 设置正确的webhook URL
      console.log('🔄 设置正确的Webhook URL...');
      await client.setWebhookEndpointUrl(CORRECT_WEBHOOK_URL);
      console.log('✅ Webhook URL已更新！');
      
      // 4. 验证webhook端点
      console.log('🧪 验证Webhook端点...');
      try {
        const testResult = await client.testWebhookEndpoint(CORRECT_WEBHOOK_URL);
        console.log('✅ Webhook端点验证成功！');
        console.log('📋 验证结果:', testResult);
      } catch (testError) {
        console.log('⚠️ Webhook端点验证失败:', testError.message);
        console.log('💡 这可能是正常的，如果Vercel服务正在运行');
      }
    }
    
    // 5. 最终验证配置
    console.log('🔄 最终验证配置...');
    const finalConfig = await client.getWebhookEndpointInfo();
    console.log('📊 最终Webhook配置:');
    console.log('  URL:', finalConfig.endpoint);
    console.log('  激活状态:', finalConfig.active);
    
    if (finalConfig.endpoint === CORRECT_WEBHOOK_URL && finalConfig.active) {
      console.log('🎉 Webhook配置完全正确！');
      console.log('');
      console.log('🧪 现在请测试Rich Menu按钮：');
      console.log('1. 完全关闭LINE应用');
      console.log('2. 重新打开LINE应用');
      console.log('3. 进入bot对话');
      console.log('4. 点击Rich Menu按钮');
      console.log('5. 应该收到机器人的postback响应');
    } else {
      console.log('⚠️ 配置可能还有问题，请手动检查LINE Developers Console');
    }
    
  } catch (error) {
    console.error('❌ 检查webhook配置失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('🔍 错误堆栈:', error.stack);
    console.log('');
    console.log('💡 手动修复步骤：');
    console.log('1. 登录 https://developers.line.biz/console/');
    console.log('2. 选择你的Provider和Channel');
    console.log('3. 点击"Messaging API"标签');
    console.log('4. 在"Webhook URL"部分点击"Edit"');
    console.log('5. 设置URL为:', CORRECT_WEBHOOK_URL);
    console.log('6. 点击"Update"并点击"Verify"');
    console.log('7. 确保"Use webhook"开关是开启的');
  }
}

// 运行脚本
checkAndSetWebhookConfig(); 