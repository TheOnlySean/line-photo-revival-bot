const axios = require('axios');
const lineConfig = require('../config/line-config');

const LINE_ACCESS_TOKEN = lineConfig.channelAccessToken;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

// 根据LINE官方文档的标准Rich Menu配置
function createStandardRichMenu() {
  return {
    size: {
      width: 2500,
      height: 1686
    },
    selected: false,
    name: "写真復活 Standard Menu",
    chatBarText: "メニュー",
    areas: [
      // 第一行：左 (手振り)
      {
        bounds: {
          x: 0,
          y: 0,
          width: 833,
          height: 843
        },
        action: {
          type: "postback",
          data: "action=wave",
          displayText: "手振り動画生成"
        }
      },
      // 第一行：中 (寄り添い)
      {
        bounds: {
          x: 833,
          y: 0,
          width: 834,
          height: 843
        },
        action: {
          type: "postback",
          data: "action=group",
          displayText: "寄り添い動画生成"
        }
      },
      // 第一行：右 (カスタム)
      {
        bounds: {
          x: 1667,
          y: 0,
          width: 833,
          height: 843
        },
        action: {
          type: "postback",
          data: "action=custom",
          displayText: "カスタム動画生成"
        }
      },
      // 第二行：左 (ポイント)
      {
        bounds: {
          x: 0,
          y: 843,
          width: 833,
          height: 843
        },
        action: {
          type: "postback",
          data: "action=credits", 
          displayText: "ポイント購入"
        }
      },
      // 第二行：中 (ウェブサイト)
      {
        bounds: {
          x: 833,
          y: 843,
          width: 834,
          height: 843
        },
        action: {
          type: "uri",
          uri: "https://angelsphoto.ai"
        }
      },
      // 第二行：右 (シェア)
      {
        bounds: {
          x: 1667,
          y: 843,
          width: 833,
          height: 843
        },
        action: {
          type: "postback",
          data: "action=share",
          displayText: "友達にシェア"
        }
      }
    ]
  };
}

// 验证Rich Menu配置
function validateRichMenuConfig(richMenu) {
  const errors = [];
  
  // 验证尺寸
  if (!richMenu.size || !richMenu.size.width || !richMenu.size.height) {
    errors.push('缺少size属性');
  } else {
    if (richMenu.size.width !== 2500) {
      errors.push(`宽度不正确: ${richMenu.size.width}, 应该是2500`);
    }
    if (richMenu.size.height !== 1686) {
      errors.push(`高度不正确: ${richMenu.size.height}, 应该是1686`);
    }
  }
  
  // 验证名称
  if (!richMenu.name || richMenu.name.length > 300) {
    errors.push('名称缺失或过长');
  }
  
  // 验证chatBarText
  if (!richMenu.chatBarText || richMenu.chatBarText.length > 14) {
    errors.push('chatBarText缺失或过长');
  }
  
  // 验证areas
  if (!richMenu.areas || !Array.isArray(richMenu.areas)) {
    errors.push('areas必须是数组');
  } else {
    if (richMenu.areas.length === 0 || richMenu.areas.length > 20) {
      errors.push(`areas数量不正确: ${richMenu.areas.length}, 应该在1-20之间`);
    }
    
    richMenu.areas.forEach((area, index) => {
      // 验证bounds
      if (!area.bounds) {
        errors.push(`Area ${index}: 缺少bounds`);
      } else {
        const b = area.bounds;
        if (b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0) {
          errors.push(`Area ${index}: bounds值无效`);
        }
        if (b.x + b.width > 2500 || b.y + b.height > 1686) {
          errors.push(`Area ${index}: bounds超出Rich Menu范围`);
        }
      }
      
      // 验证action
      if (!area.action) {
        errors.push(`Area ${index}: 缺少action`);
      } else {
        if (!area.action.type) {
          errors.push(`Area ${index}: action缺少type`);
        } else {
          if (area.action.type === 'postback') {
            if (!area.action.data) {
              errors.push(`Area ${index}: postback action缺少data`);
            }
            if (area.action.data && area.action.data.length > 300) {
              errors.push(`Area ${index}: postback data过长`);
            }
            if (area.action.displayText && area.action.displayText.length > 300) {
              errors.push(`Area ${index}: displayText过长`);
            }
          }
        }
      }
    });
  }
  
  return errors;
}

async function testAndCreateStandardRichMenu() {
  try {
    console.log('🔍 创建并验证标准Rich Menu配置...');
    
    const standardRichMenu = createStandardRichMenu();
    
    // 验证配置
    const errors = validateRichMenuConfig(standardRichMenu);
    if (errors.length > 0) {
      console.error('❌ Rich Menu配置验证失败:');
      errors.forEach(error => console.error(`  - ${error}`));
      return;
    }
    
    console.log('✅ Rich Menu配置验证通过');
    
    // 使用LINE API验证Rich Menu对象
    console.log('🔍 使用LINE API验证Rich Menu对象...');
    const validateResponse = await axios.post(`${LINE_API_BASE}/richmenu/validate`, standardRichMenu, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ LINE API验证通过');
    
    // 删除现有Rich Menu
    console.log('🗑️ 删除现有Rich Menu...');
    const listResponse = await axios.get(`${LINE_API_BASE}/richmenu/list`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    for (const menu of listResponse.data.richmenus) {
      console.log(`删除: ${menu.name} (${menu.richMenuId})`);
      await axios.delete(`${LINE_API_BASE}/richmenu/${menu.richMenuId}`, {
        headers: {
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        }
      });
    }
    
    // 创建新的标准Rich Menu
    console.log('🎨 创建标准Rich Menu...');
    const createResponse = await axios.post(`${LINE_API_BASE}/richmenu`, standardRichMenu, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const richMenuId = createResponse.data.richMenuId;
    console.log('✅ 标准Rich Menu创建成功:', richMenuId);
    
    // 上传图片 (使用现有图片)
    console.log('📷 上传Rich Menu图片...');
    const fs = require('fs');
    const path = require('path');
    
    const imagePath = path.join(__dirname, '..', 'assets', 'richmenu-main.png');
    console.log('📁 图片路径:', imagePath);
    
    if (fs.existsSync(imagePath)) {
      const imageBuffer = fs.readFileSync(imagePath);
      console.log('📊 图片大小:', imageBuffer.length, 'bytes');
      
      try {
        console.log('🔗 上传URL:', `${LINE_API_BASE}/richmenu/${richMenuId}/content`);
        
        const uploadResponse = await axios.post(`${LINE_API_BASE}/richmenu/${richMenuId}/content`, imageBuffer, {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'image/png'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        
        console.log('✅ Rich Menu图片上传成功');
        console.log('📊 上传响应:', uploadResponse.status);
      } catch (uploadError) {
        console.error('❌ 图片上传失败:', uploadError.message);
        if (uploadError.response) {
          console.error('📊 上传错误状态:', uploadError.response.status);
          console.error('📋 上传错误数据:', uploadError.response.data);
        }
        
        // 如果图片太大，尝试压缩版本
        const compressedPath = path.join(__dirname, '..', 'assets', 'richmenu-main-compressed.png');
        if (fs.existsSync(compressedPath)) {
          console.log('🔄 尝试使用压缩图片...');
          const compressedBuffer = fs.readFileSync(compressedPath);
          console.log('📊 压缩图片大小:', compressedBuffer.length, 'bytes');
          
          await axios.post(`${LINE_API_BASE}/richmenu/${richMenuId}/content`, compressedBuffer, {
            headers: {
              'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
              'Content-Type': 'image/png'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          });
          
          console.log('✅ 压缩图片上传成功');
        } else {
          throw uploadError;
        }
      }
    } else {
      console.log('⚠️ Rich Menu图片文件不存在:', imagePath);
      
      // 尝试其他图片格式
      const alternativePaths = [
        path.join(__dirname, '..', 'assets', 'richmenu-main-compressed.png'),
        path.join(__dirname, '..', 'assets', 'richmenu-main.png.original')
      ];
      
      for (const altPath of alternativePaths) {
        if (fs.existsSync(altPath)) {
          console.log('📷 使用备用图片:', altPath);
          const imageBuffer = fs.readFileSync(altPath);
          console.log('📊 图片大小:', imageBuffer.length, 'bytes');
          
          await axios.post(`${LINE_API_BASE}/richmenu/${richMenuId}/content`, imageBuffer, {
            headers: {
              'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
              'Content-Type': 'image/png'
            }
          });
          
          console.log('✅ Rich Menu图片上传成功');
          break;
        }
      }
    }
    
    // 设置为默认菜单
    console.log('📱 设置为默认Rich Menu...');
    await axios.post(`${LINE_API_BASE}/user/all/richmenu/${richMenuId}`, {}, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    console.log('🎉 标准Rich Menu设置完成！');
    console.log('⚠️ 请重启LINE应用测试新配置');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行脚本
testAndCreateStandardRichMenu(); 