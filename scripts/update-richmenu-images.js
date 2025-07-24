const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function updateRichMenuImages() {
  console.log('🔄 开始更新Rich Menu图片...');
  
  try {
    // 获取所有Rich Menu
    const richMenuList = await client.getRichMenuList();
    console.log(`📋 找到 ${richMenuList.length} 个Rich Menu`);
    
    for (const menu of richMenuList) {
      console.log(`\n🎯 处理Rich Menu: ${menu.name}`);
      console.log(`   ID: ${menu.richMenuId}`);
      
      let imagePath = '';
      
      // 根据菜单名称确定对应的图片文件
      if (menu.name.includes('Main') || menu.name.includes('主要') || menu.name.includes('メイン')) {
        imagePath = path.join(__dirname, '../assets/richmenu-main.png');
        console.log('🖼️ 使用主菜单图片: richmenu-main.png');
      } else if (menu.name.includes('Processing') || menu.name.includes('生成中') || menu.name.includes('処理中')) {
        imagePath = path.join(__dirname, '../assets/richmenu-processing.png');
        console.log('🖼️ 使用处理中菜单图片: richmenu-processing.png');
      } else {
        console.log('⚠️ 无法确定图片类型，跳过');
        continue;
      }
      
      // 检查图片文件是否存在
      if (!fs.existsSync(imagePath)) {
        console.error(`❌ 图片文件不存在: ${imagePath}`);
        continue;
      }
      
      // 获取图片信息
      const stats = fs.statSync(imagePath);
      console.log(`📏 图片大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
      try {
        // 上传图片到Rich Menu
        console.log('📤 正在上传图片...');
        const imageBuffer = fs.readFileSync(imagePath);
        
        await client.setRichMenuImage(menu.richMenuId, imageBuffer, 'image/png');
        console.log('✅ 图片上传成功！');
        
        // 稍等一下确保上传完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (uploadError) {
        console.error(`❌ 图片上传失败: ${uploadError.message}`);
        
        if (uploadError.response) {
          console.error(`📊 API错误状态: ${uploadError.response.status}`);
          console.error(`📋 API错误详情:`, uploadError.response.data);
        }
      }
    }
    
    console.log('\n🎉 Rich Menu图片更新完成！');
    console.log('');
    console.log('📱 请在LINE中验证：');
    console.log('1. Main Rich Menu是否显示了新的主菜单图片');
    console.log('2. Processing Rich Menu是否显示了新的处理中图片');
    console.log('3. 点击按钮是否能正常切换菜单');
    console.log('4. 菜单图片是否清晰和美观');
    
  } catch (error) {
    console.error('❌ 更新Rich Menu图片失败:', error.message);
    
    if (error.response) {
      console.error('📊 API错误状态:', error.response.status);
      console.error('📋 API错误详情:', error.response.data);
    }
  }
}

// 验证图片文件
async function validateImages() {
  console.log('🔍 验证图片文件...');
  
  const mainImagePath = path.join(__dirname, '../assets/richmenu-main.png');
  const processingImagePath = path.join(__dirname, '../assets/richmenu-processing.png');
  
  // 检查主菜单图片
  if (fs.existsSync(mainImagePath)) {
    const mainStats = fs.statSync(mainImagePath);
    console.log(`✅ 主菜单图片: ${(mainStats.size / 1024).toFixed(2)} KB`);
  } else {
    console.error('❌ 主菜单图片文件不存在: richmenu-main.png');
    return false;
  }
  
  // 检查处理中菜单图片
  if (fs.existsSync(processingImagePath)) {
    const processingStats = fs.statSync(processingImagePath);
    console.log(`✅ 处理中菜单图片: ${(processingStats.size / 1024).toFixed(2)} KB`);
  } else {
    console.error('❌ 处理中菜单图片文件不存在: richmenu-processing.png');
    return false;
  }
  
  console.log('✅ 图片文件验证通过');
  return true;
}

// 显示帮助信息
function showHelp() {
  console.log(`
🔄 Rich Menu图片更新工具

功能：
- 自动识别现有的Rich Menu
- 为Main Menu上传richmenu-main.png
- 为Processing Menu上传richmenu-processing.png
- 验证图片文件和上传结果

使用方法：
  node scripts/update-richmenu-images.js           # 更新图片
  node scripts/update-richmenu-images.js --check   # 只验证图片文件

注意事项：
- 图片文件应放在assets/目录下
- 支持PNG格式，建议大小在1MB以内
- Rich Menu结构必须已存在
- 需要Bot具有Rich Menu管理权限

图片要求：
- 主菜单: richmenu-main.png (建议2500x1686像素)
- 处理中菜单: richmenu-processing.png (建议2500x843像素)
- 格式: PNG
- 大小: < 1MB
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else if (process.argv.includes('--check')) {
    validateImages();
  } else {
    // 先验证图片，然后更新
    validateImages().then(isValid => {
      if (isValid) {
        updateRichMenuImages();
      } else {
        console.error('❌ 图片验证失败，请检查assets/目录下的图片文件');
      }
    });
  }
}

module.exports = { updateRichMenuImages, validateImages }; 