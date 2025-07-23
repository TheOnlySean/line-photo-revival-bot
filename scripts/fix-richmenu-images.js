const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

// 创建LINE客户端
const client = new Client({
  channelSecret: lineConfig.channelSecret,
  channelAccessToken: lineConfig.channelAccessToken
});

async function fixRichMenuImages() {
  console.log('🔧 开始修复Rich Menu图片上传问题...');
  
  try {
    // 获取所有现有的Rich Menu
    console.log('📋 获取现有Rich Menu列表...');
    const richMenus = await client.getRichMenuList();
    console.log('📊 找到', richMenus.length, '个Rich Menu');
    
    if (richMenus.length === 0) {
      console.log('❌ 没有找到Rich Menu，请先运行setupRichMenu');
      return;
    }
    
    // 显示所有Rich Menu信息
    richMenus.forEach((menu, index) => {
      console.log(`\n📋 Rich Menu ${index + 1}:`);
      console.log('   ID:', menu.richMenuId);
      console.log('   名称:', menu.name);
      console.log('   聊天栏文字:', menu.chatBarText);
      console.log('   选中状态:', menu.selected);
    });
    
    // 尝试为每个Rich Menu上传对应的图片
    for (const menu of richMenus) {
      const richMenuId = menu.richMenuId;
      console.log(`\n🔄 处理Rich Menu: ${menu.name} (${richMenuId})`);
      
      let imageType = '';
      let imageFileName = '';
      
      // 根据名称确定图片类型
      if (menu.name.includes('Main') || menu.name.includes('主要')) {
        imageType = 'main';
        imageFileName = 'richmenu-main.png';
      } else if (menu.name.includes('Processing') || menu.name.includes('生成中')) {
        imageType = 'processing';
        imageFileName = 'richmenu-processing.png';
      } else {
        console.log('⚠️ 无法确定图片类型，跳过');
        continue;
      }
      
      console.log(`📤 准备上传 ${imageType} 图片: ${imageFileName}`);
      
      try {
        await uploadRichMenuImage(richMenuId, imageType, imageFileName);
        console.log(`✅ ${imageType} 图片上传成功`);
      } catch (error) {
        console.error(`❌ ${imageType} 图片上传失败:`, error.message);
      }
    }
    
    // 检查是否有默认Rich Menu
    try {
      const defaultRichMenuId = await client.getDefaultRichMenuId();
      console.log('\n📌 当前默认Rich Menu ID:', defaultRichMenuId);
    } catch (error) {
      console.log('\n⚠️ 没有设置默认Rich Menu');
      
      // 尝试设置第一个Rich Menu为默认
      if (richMenus.length > 0) {
        try {
          const firstMenuId = richMenus[0].richMenuId;
          await client.setDefaultRichMenu(firstMenuId);
          console.log('✅ 已设置默认Rich Menu:', firstMenuId);
        } catch (setError) {
          console.error('❌ 设置默认Rich Menu失败:', setError.message);
        }
      }
    }
    
    console.log('\n🎉 Rich Menu图片修复完成！');
    
  } catch (error) {
    console.error('❌ 修复过程中出错:', error);
  }
}

async function uploadRichMenuImage(richMenuId, imageType, imageFileName) {
  // 确定图片文件路径
  const imagePath = path.join(__dirname, '..', 'assets', imageFileName);
  
  console.log('📂 图片路径:', imagePath);
  
  // 检查文件是否存在
  if (!fs.existsSync(imagePath)) {
    throw new Error(`图片文件不存在: ${imagePath}`);
  }
  
  // 检查文件大小（最大1MB）
  const stats = fs.statSync(imagePath);
  console.log(`📊 文件大小: ${(stats.size / 1024).toFixed(2)}KB`);
  
  if (stats.size > 1024 * 1024) {
    throw new Error(`图片文件过大: ${(stats.size / 1024 / 1024).toFixed(2)}MB > 1MB`);
  }
  
  // 读取图片文件
  const imageBuffer = fs.readFileSync(imagePath);
  
  // 确定图片类型
  const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  console.log(`🎨 内容类型: ${contentType}`);
  
  // 上传图片到LINE
  console.log('📤 正在上传图片到LINE服务器...');
  await client.setRichMenuImage(richMenuId, imageBuffer, contentType);
  console.log('✅ 图片上传成功');
}

// 显示帮助信息
function showHelp() {
  console.log(`
🔧 Rich Menu图片修复工具

用途：
- 修复Rich Menu图片上传失败的问题
- 重新上传图片到已存在的Rich Menu
- 设置默认Rich Menu

使用方法：
  node scripts/fix-richmenu-images.js

注意事项：
- 需要assets/目录中有正确的图片文件
- 图片尺寸必须是2500x1686px
- 图片大小不能超过1MB
- 需要有效的LINE Bot配置
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    fixRichMenuImages();
  }
}

module.exports = fixRichMenuImages; 