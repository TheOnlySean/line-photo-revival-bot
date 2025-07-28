/**
 * 修复Rich Menu按钮动作
 * 官网和分享按钮应该直接跳转，不是postback
 */

const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  // 管理员验证
  const { adminKey } = req.body;
  if (adminKey !== 'fix-richmenu-actions-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 开始修复Rich Menu按钮动作...');

    // 初始化LINE客户端（使用生产环境配置）
    const client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD || process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET_PROD || process.env.LINE_CHANNEL_SECRET,
    });

    // 读取Rich Menu图片
    const imagePath = path.join(process.cwd(), 'assets', 'main.jpg');
    const imageBuffer = fs.readFileSync(imagePath);

    console.log('📷 图片大小:', Math.round(imageBuffer.length / 1024), 'KB');

    // 修复后的主Rich Menu配置 - 使用正确的URI actions
    const fixedMainRichMenu = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: true,
      name: 'Main Menu - Fixed Actions',
      chatBarText: '写真復活メニュー',
      areas: [
        // 第一行 - 3个按钮
        // 左上："手を振る" - WAVE_VIDEO (保持postback)
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=WAVE_VIDEO" }
        },
        // 中上："寄り添う" - GROUP_VIDEO (保持postback)
        {
          bounds: { x: 833, y: 0, width: 834, height: 843 },
          action: { type: "postback", data: "action=GROUP_VIDEO" }
        },
        // 右上："テキストで動かす" - PERSONALIZE (保持postback)
        {
          bounds: { x: 1667, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=PERSONALIZE" }
        },
        
        // 第二行 - 3个按钮
        // 左下："クーポン配布中！" - COUPON (保持postback)
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: "postback", data: "action=COUPON" }
        },
        // 中下："プロ品質はこちら" - 修复为直接跳转官网
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: { type: "uri", uri: "https://angelsphoto.ai" }
        },
        // 右下："友だちにシェア" - 修复为直接分享LINE账号
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: { type: "uri", uri: `https://line.me/R/nv/recommendOA/${lineConfig.basicId}` }
        }
      ]
    };

    // 1. 创建修复后的Rich Menu
    console.log('📋 创建修复后的Rich Menu...');
    const fixedMainMenuId = await client.createRichMenu(fixedMainRichMenu);
    console.log('✅ 修复后Rich Menu创建成功:', fixedMainMenuId);

    // 2. 上传图片
    console.log('📷 上传Rich Menu图片...');
    await client.setRichMenuImage(fixedMainMenuId, imageBuffer, 'image/jpeg');
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

    // 4. 设置修复后的Rich Menu为默认
    console.log('🔧 设置修复后的Rich Menu为默认...');
    await client.setDefaultRichMenu(fixedMainMenuId);
    console.log('✅ 修复后Rich Menu已设为默认');

    // 5. 删除旧的Rich Menu（如果存在）
    if (currentMainMenuId && currentMainMenuId !== fixedMainMenuId) {
      try {
        console.log('🗑️ 删除旧的Rich Menu:', currentMainMenuId);
        await client.deleteRichMenu(currentMainMenuId);
        console.log('✅ 旧Rich Menu删除成功');
      } catch (error) {
        console.log('⚠️ 删除旧Rich Menu失败（可能已不存在）:', error.message);
      }
    }

    console.log('🎉 Rich Menu按钮动作修复完成！');

    res.json({
      success: true,
      message: 'Rich Menu按钮动作修复成功',
      timestamp: new Date().toISOString(),
      details: {
        fixedMainMenuId,
        oldMainMenuId: currentMainMenuId,
        fixes: [
          '官网按钮: 改为直接跳转 https://angelsphoto.ai',
          `分享按钮: 改为直接分享LINE账号 ${lineConfig.basicId}`
        ],
        areas: fixedMainRichMenu.areas.length
      }
    });

  } catch (error) {
    console.error('❌ 修复Rich Menu失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 