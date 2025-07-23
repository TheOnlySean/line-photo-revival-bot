const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const fs = require('fs');
const path = require('path');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

async function recreateRichMenuFresh() {
  try {
    console.log('🔄 完全重新创建Rich Menu...');
    
    // 1. 删除所有现有Rich Menu
    console.log('🗑️ 删除所有现有Rich Menu...');
    const existingMenus = await client.getRichMenuList();
    console.log(`📋 找到 ${existingMenus.length} 个现有菜单`);
    
    for (const menu of existingMenus) {
      console.log(`删除: ${menu.name} (${menu.richMenuId})`);
      await client.deleteRichMenu(menu.richMenuId);
    }
    console.log('✅ 所有现有菜单已删除');
    
    // 2. 创建最简单的Rich Menu配置
    const richMenuConfig = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: false,
      name: "写真復活 - 简化测试菜单",
      chatBarText: "メニュー",
      areas: [
        {
          bounds: {
            x: 0,
            y: 0,
            width: 2500,
            height: 1686
          },
          action: {
            type: "postback",
            data: "action=wave",
            displayText: "手振り動画生成"
          }
        }
      ]
    };
    
    console.log('🎨 创建新的Rich Menu...');
    const newMenuId = await client.createRichMenu(richMenuConfig);
    console.log(`✅ 新菜单创建成功: ${newMenuId}`);
    
    // 3. 准备图片
    console.log('📷 准备图片...');
    const imagePath = path.join(__dirname, '..', 'assets', 'richmenu-main.png');
    
    let imageBuffer;
    if (fs.existsSync(imagePath)) {
      imageBuffer = fs.readFileSync(imagePath);
      console.log(`✅ 使用现有图片: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
    } else {
      console.log('❌ 找不到图片文件，创建纯色图片...');
      
      // 创建一个简单的白色2500x1686 PNG
      // 这是一个最小的有效PNG，但实际上很小，LINE可能会拒绝
      // 让我们创建一个更真实的图片数据
      
      // 使用一个简单的1x1透明PNG作为基础
      const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77mgAAAABJRU5ErkJggg==';
      imageBuffer = Buffer.from(base64PNG, 'base64');
      console.log('📊 使用1x1测试图片');
    }
    
    // 4. 上传图片
    console.log('📤 上传图片...');
    try {
      await client.setRichMenuImage(newMenuId, imageBuffer, 'image/png');
      console.log('✅ 图片上传成功！');
    } catch (uploadError) {
      console.error('❌ 图片上传失败:', uploadError.message);
      
      if (uploadError.response) {
        console.error('📊 响应状态:', uploadError.response.status);
        console.error('📋 响应数据:', uploadError.response.data);
      }
      
      // 如果图片上传失败，先不设置为默认，让用户知道问题
      console.log('⚠️ 由于图片上传失败，Rich Menu将无法正常显示');
      return;
    }
    
    // 5. 验证图片
    console.log('🔍 验证图片上传...');
    try {
      const uploadedImage = await client.getRichMenuImage(newMenuId);
      if (uploadedImage && uploadedImage.length > 0) {
        console.log(`✅ 验证成功! 图片大小: ${uploadedImage.length} bytes`);
      } else {
        console.log('⚠️ 验证失败，图片可能为空');
        return;
      }
    } catch (verifyError) {
      console.log('⚠️ 验证过程出错，但可能上传成功');
    }
    
    // 6. 设置为默认菜单
    console.log('📱 设置为默认Rich Menu...');
    await client.setDefaultRichMenu(newMenuId);
    console.log('✅ 设置完成！');
    
    // 7. 最终验证
    console.log('🔄 最终验证...');
    const finalMenus = await client.getRichMenuList();
    const defaultMenuId = await client.getDefaultRichMenuId();
    
    console.log(`📊 当前菜单总数: ${finalMenus.length}`);
    console.log(`📱 默认菜单ID: ${defaultMenuId}`);
    console.log(`🎯 新创建菜单ID: ${newMenuId}`);
    
    if (defaultMenuId === newMenuId) {
      console.log('🎉 Rich Menu重新创建成功！');
      console.log('');
      console.log('🧪 现在请测试：');
      console.log('1. 完全关闭LINE应用（从后台清除）');
      console.log('2. 等待30秒');
      console.log('3. 重新打开LINE应用');
      console.log('4. 进入bot对话');
      console.log('5. 应该看到底部菜单栏显示"メニュー"');
      console.log('6. 点击菜单区域');
      console.log('');
      console.log('📋 期望结果：');
      console.log('   机器人应该回复："👋【手振り動画生成】が選択されました"');
      console.log('   而不是你发送"手振り動画生成"文本消息');
    } else {
      console.log('⚠️ 默认菜单设置可能有问题');
    }
    
  } catch (error) {
    console.error('❌ 重新创建失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('🔍 错误堆栈:', error.stack);
  }
}

// 运行脚本
recreateRichMenuFresh(); 