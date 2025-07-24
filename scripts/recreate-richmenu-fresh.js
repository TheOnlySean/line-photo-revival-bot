const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function recreateRichMenusFresh() {
  console.log('🔄 开始重新创建Rich Menu...');
  
  try {
    // 步骤1: 删除所有现有的Rich Menu
    console.log('\n🗑️ 步骤1: 删除所有现有Rich Menu');
    const existingMenus = await client.getRichMenuList();
    
    for (const menu of existingMenus) {
      console.log(`🗑️ 删除Rich Menu: ${menu.name} (${menu.richMenuId})`);
      try {
        await client.deleteRichMenu(menu.richMenuId);
        console.log('✅ 删除成功');
      } catch (deleteError) {
        console.error(`❌ 删除失败: ${deleteError.message}`);
      }
    }
    
    // 等待一下确保删除完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 步骤2: 创建主菜单
    console.log('\n📋 步骤2: 创建主Rich Menu');
    const mainRichMenu = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: true,
      name: '写真復活 Main Menu',
      chatBarText: 'メニュー',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: 'postback', data: 'action=wave&mode=video_generation' }
        },
        {
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: { type: 'postback', data: 'action=group&mode=video_generation' }
        },
        {
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: { type: 'postback', data: 'action=custom&mode=video_generation' }
        },
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: 'postback', data: 'action=credits&mode=info' }
        },
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: { type: 'postback', data: 'action=share&mode=info' }
        },
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: { type: 'postback', data: 'action=status_check&mode=info' }
        }
      ]
    };
    
    const mainRichMenuId = await client.createRichMenu(mainRichMenu);
    console.log('✅ 主Rich Menu创建成功:', mainRichMenuId);
    
    // 步骤3: 创建处理中菜单
    console.log('\n📋 步骤3: 创建处理中Rich Menu');
    const processingRichMenu = {
      size: {
        width: 2500,
        height: 843
      },
      selected: true,
      name: '写真復活 Processing Menu',
      chatBarText: '生成中...',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 2500, height: 843 },
          action: { type: 'postback', data: 'action=status_check&mode=processing' }
        }
      ]
    };
    
    const processingRichMenuId = await client.createRichMenu(processingRichMenu);
    console.log('✅ 处理中Rich Menu创建成功:', processingRichMenuId);
    
    // 等待Rich Menu创建完成
    console.log('\n⏱️ 等待Rich Menu创建完成...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 步骤4: 上传主菜单图片
    console.log('\n🖼️ 步骤4: 上传主菜单图片');
    const mainImagePath = path.join(__dirname, '../assets/richmenu-main.png');
    
    if (fs.existsSync(mainImagePath)) {
      try {
        const mainImageBuffer = fs.readFileSync(mainImagePath);
        await client.setRichMenuImage(mainRichMenuId, mainImageBuffer, 'image/png');
        console.log('✅ 主菜单图片上传成功');
      } catch (uploadError) {
        console.error(`❌ 主菜单图片上传失败: ${uploadError.message}`);
      }
    } else {
      console.error('❌ 主菜单图片文件不存在');
    }
    
    // 步骤5: 上传处理中菜单图片
    console.log('\n🖼️ 步骤5: 上传处理中菜单图片');
    const processingImagePath = path.join(__dirname, '../assets/richmenu-processing.png');
    
    if (fs.existsSync(processingImagePath)) {
      try {
        const processingImageBuffer = fs.readFileSync(processingImagePath);
        await client.setRichMenuImage(processingRichMenuId, processingImageBuffer, 'image/png');
        console.log('✅ 处理中菜单图片上传成功');
      } catch (uploadError) {
        console.error(`❌ 处理中菜单图片上传失败: ${uploadError.message}`);
      }
    } else {
      console.error('❌ 处理中菜单图片文件不存在');
    }
    
    // 步骤6: 设置主菜单为默认
    console.log('\n🎯 步骤6: 设置主菜单为默认');
    try {
      await client.setDefaultRichMenu(mainRichMenuId);
      console.log('✅ 主菜单设置为默认成功');
    } catch (defaultError) {
      console.error(`❌ 设置默认菜单失败: ${defaultError.message}`);
    }
    
    console.log('\n🎉 Rich Menu重新创建完成！');
    console.log('');
    console.log('📋 创建结果:');
    console.log(`主菜单ID: ${mainRichMenuId}`);
    console.log(`处理中菜单ID: ${processingRichMenuId}`);
    console.log('');
    console.log('📱 请在LINE中验证：');
    console.log('1. 主菜单是否显示了新的图片设计');
    console.log('2. 处理中菜单是否显示了新的图片设计');
    console.log('3. 点击按钮是否能正常工作');
    console.log('4. 菜单切换是否流畅');
    console.log('');
    console.log('💡 如果图片仍然不显示，可能需要：');
    console.log('- 检查图片格式是否为PNG');
    console.log('- 检查图片尺寸是否正确');
    console.log('- 等待几分钟让LINE缓存更新');
    
    return {
      mainRichMenuId,
      processingRichMenuId
    };
    
  } catch (error) {
    console.error('❌ 重新创建Rich Menu失败:', error.message);
    
    if (error.response) {
      console.error('📊 API错误状态:', error.response.status);
      console.error('📋 API错误详情:', error.response.data);
    }
    
    throw error;
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
🔄 Rich Menu完全重新创建工具

功能：
- 删除所有现有的Rich Menu
- 创建新的主菜单和处理中菜单
- 上传更新后的图片文件
- 设置默认菜单

使用方法：
  node scripts/recreate-richmenu-fresh.js

处理流程：
1. 删除所有现有Rich Menu
2. 创建主Rich Menu (2500x1686)
3. 创建处理中Rich Menu (2500x843)
4. 上传主菜单图片 (richmenu-main.png)
5. 上传处理中图片 (richmenu-processing.png)
6. 设置主菜单为默认

注意事项：
- 会删除所有现有的Rich Menu
- 需要确保图片文件存在于assets/目录
- 图片必须为PNG格式
- 建议在测试环境先试用

图片要求：
- richmenu-main.png: 2500x1686像素
- richmenu-processing.png: 2500x843像素
- 格式: PNG
- 大小: < 1MB
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    recreateRichMenusFresh()
      .then(result => {
        console.log('🎯 重新创建成功完成！');
        console.log('菜单ID已保存，可以在代码中使用');
      })
      .catch(error => {
        console.error('💥 重新创建过程中发生错误');
        process.exit(1);
      });
  }
}

module.exports = recreateRichMenusFresh; 