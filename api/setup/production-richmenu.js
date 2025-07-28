const { Client } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../../config/line-config');

export default async function handler(req, res) {
  // 只允许POST请求和特定的管理密钥
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== 'setup-production-richmenu-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔴 开始为生产环境设置Rich Menu...');
    console.log('📍 环境:', process.env.NODE_ENV);
    
    // 使用生产环境的LINE配置
    const client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD || process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET_PROD || process.env.LINE_CHANNEL_SECRET,
    });

    console.log('🔑 使用Token:', (process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD || process.env.LINE_CHANNEL_ACCESS_TOKEN).substring(0, 20) + '...');

    // Main Rich Menu Configuration
    const mainRichMenu = {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "写真復活 Production Main Menu",
      chatBarText: "メニュー",
      areas: [
        // 第一行：手振り、寄り添い、個性化
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=WAVE_VIDEO" }
        },
        {
          bounds: { x: 833, y: 0, width: 833, height: 843 },
          action: { type: "postback", data: "action=GROUP_VIDEO" }
        },
        {
          bounds: { x: 1666, y: 0, width: 834, height: 843 },
          action: { type: "postback", data: "action=PERSONALIZE" }
        },
        // 第二行：優惠券+充值、官網客服、好友分享
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: "postback", data: "action=COUPON" }
        },
        {
          bounds: { x: 833, y: 843, width: 833, height: 843 },
          action: { type: "uri", uri: "https://angelsphoto.ai" }
        },
        {
          bounds: { x: 1666, y: 843, width: 834, height: 843 },
          action: { type: "uri", uri: `https://line.me/R/nv/recommendOA/${lineConfig.basicId}` }
        }
      ]
    };

    // Processing Rich Menu Configuration  
    const processingRichMenu = {
      size: { width: 2500, height: 843 },
      selected: true,
      name: "写真復活 Production Processing Menu", 
      chatBarText: "生成中...",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 2500, height: 843 },
          action: { type: "postback", data: "action=CHECK_STATUS" }
        }
      ]
    };

    // 1. 清理现有Rich Menu
    console.log('🧹 清理现有Rich Menu...');
    try {
      const existingMenus = await client.getRichMenuList();
      for (const menu of existingMenus) {
        await client.deleteRichMenu(menu.richMenuId);
        console.log(`🗑️ 删除旧菜单: ${menu.richMenuId}`);
      }
    } catch (error) {
      console.log('ℹ️ 没有现有Rich Menu需要清理');
    }

    // 2. 创建主菜单
    console.log('📋 创建主菜单...');
    const mainRichMenuId = await client.createRichMenu(mainRichMenu);
    console.log('✅ 主菜单创建成功, ID:', mainRichMenuId);

    // 3. 上传主菜单图片
    console.log('🖼️ 上传主菜单图片...');
    const mainImagePath = path.join(process.cwd(), 'assets', 'richmenu-main-resized.jpg');
    
    if (!fs.existsSync(mainImagePath)) {
      throw new Error(`主菜单图片文件不存在: ${mainImagePath}`);
    }
    
    const mainImageBuffer = fs.readFileSync(mainImagePath);
    await client.setRichMenuImage(mainRichMenuId, mainImageBuffer, 'image/jpeg');
    console.log('✅ 主菜单图片上传成功');

    // 4. 创建处理中菜单
    console.log('📋 创建处理中菜单...');
    const processingRichMenuId = await client.createRichMenu(processingRichMenu);
    console.log('✅ 处理中菜单创建成功, ID:', processingRichMenuId);

    // 5. 上传处理中菜单图片
    console.log('🖼️ 上传处理中菜单图片...');
    const processingImagePath = path.join(process.cwd(), 'assets', 'richmenu-processing-resized.jpg');
    
    if (!fs.existsSync(processingImagePath)) {
      throw new Error(`处理中菜单图片文件不存在: ${processingImagePath}`);
    }
    
    const processingImageBuffer = fs.readFileSync(processingImagePath);
    await client.setRichMenuImage(processingRichMenuId, processingImageBuffer, 'image/jpeg');
    console.log('✅ 处理中菜单图片上传成功');
    
    // 6. 设置主菜单为默认
    console.log('🎯 设置主菜单为默认...');
    await client.setDefaultRichMenu(mainRichMenuId);
    console.log('✅ 主菜单已设为默认');

    const result = {
      success: true,
      mainRichMenuId,
      processingRichMenuId,
      environment: 'production',
      timestamp: new Date().toISOString()
    };

    console.log('🎉 生产环境Rich Menu设置完成！');
    console.log('结果:', result);

    return res.status(200).json(result);
    
  } catch (error) {
    console.error('❌ 创建生产环境Rich Menu失败:', error);
    
    const errorDetail = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    if (error.originalError?.response?.data) {
      errorDetail.lineApiError = error.originalError.response.data;
    }

    return res.status(500).json(errorDetail);
  }
} 