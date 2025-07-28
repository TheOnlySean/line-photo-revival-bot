/**
 * 更新生产环境主Rich Menu
 * 使用新的main.jpg设计
 */

const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  // 管理员验证
  const { adminKey } = req.body;
  if (adminKey !== 'update-main-richmenu-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 开始更新生产环境主Rich Menu...');

    // 初始化LINE客户端（使用生产环境配置）
    const client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD || process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET_PROD || process.env.LINE_CHANNEL_SECRET,
    });

    // 读取新的Rich Menu图片
    const imagePath = path.join(process.cwd(), 'assets', 'main.jpg');
    const imageBuffer = fs.readFileSync(imagePath);

    console.log('📷 新图片大小:', Math.round(imageBuffer.length / 1024), 'KB');

    // 新的主Rich Menu配置（基于图片设计分析）
    // 图片尺寸：2500x1686
    const newMainRichMenu = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: true,
      name: 'Main Menu - Updated',
      chatBarText: '写真復活メニュー',
      areas: [
        // 第一行 - 3个按钮
        // 左上："手を振る" - WAVE_VIDEO
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=WAVE_VIDEO" }
        },
        // 中上："寄り添う" - GROUP_VIDEO
        {
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: { type: "postback", data: "action=GROUP_VIDEO" }
        },
        // 右上："テキストで動かす" - PERSONALIZE
        {
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=PERSONALIZE" }
        },
        
        // 第二行 - 3个按钮
        // 左下："クーポン配布中！" - COUPON
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: "postback", data: "action=COUPON" }
        },
        // 中下："プロ品質はこちら" - OFFICIAL_SITE
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: { type: "postback", data: "action=OFFICIAL_SITE" }
        },
        // 右下："友だちにシェア" - SHARE
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: { type: "postback", data: "action=SHARE" }
        }
      ]
    };

    // 1. 创建新的Rich Menu
    console.log('📋 创建新的主Rich Menu...');
    const newMainMenuId = await client.createRichMenu(newMainRichMenu);
    console.log('✅ 新主Rich Menu创建成功:', newMainMenuId);

    // 2. 上传新图片
    console.log('📷 上传新Rich Menu图片...');
    await client.setRichMenuImage(newMainMenuId, imageBuffer, 'image/jpeg');
    console.log('✅ 图片上传成功');

    // 3. 获取当前Rich Menu配置
    let currentMainMenuId = null;
    try {
      const richMenuConfig = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'config', 'richmenu-ids-production.json'), 
        'utf8'
      ));
      currentMainMenuId = richMenuConfig.mainRichMenuId;
      console.log('📋 当前主Rich Menu ID:', currentMainMenuId);
    } catch (error) {
      console.log('⚠️ 无法读取当前Rich Menu配置');
    }

    // 4. 设置新Rich Menu为默认
    console.log('🔧 设置新Rich Menu为默认...');
    await client.setDefaultRichMenu(newMainMenuId);
    console.log('✅ 新Rich Menu已设为默认');

    // 5. 删除旧的主Rich Menu（如果存在）
    if (currentMainMenuId && currentMainMenuId !== newMainMenuId) {
      try {
        console.log('🗑️ 删除旧的主Rich Menu:', currentMainMenuId);
        await client.deleteRichMenu(currentMainMenuId);
        console.log('✅ 旧Rich Menu删除成功');
      } catch (error) {
        console.log('⚠️ 删除旧Rich Menu失败（可能已不存在）:', error.message);
      }
    }

    // 6. 更新配置文件
    const configPath = path.join(process.cwd(), 'config', 'richmenu-ids-production.json');
    let config = {};
    
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.log('📝 创建新的配置文件');
    }

    config.mainRichMenuId = newMainMenuId;
    config.updatedAt = new Date().toISOString();
    config.note = 'Updated with new main.jpg design';

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('📝 配置文件已更新');

    console.log('🎉 主Rich Menu更新完成！');

    res.json({
      success: true,
      message: '主Rich Menu更新成功',
      timestamp: new Date().toISOString(),
      details: {
        newMainMenuId,
        oldMainMenuId: currentMainMenuId,
        imageSizeKB: Math.round(imageBuffer.length / 1024),
        areas: newMainRichMenu.areas.length,
        configUpdated: true
      }
    });

  } catch (error) {
    console.error('❌ 更新Rich Menu失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 