const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');

const client = new Client({
  channelAccessToken: lineConfig.channelAccessToken,
  channelSecret: lineConfig.channelSecret
});

// 创建简单的2500x1686纯色PNG图片 (BASE64编码)
function createSimplePNG() {
  // 这是一个简单的2500x1686白色PNG图片的BASE64数据
  // 实际上为了测试，我们创建一个最小的有效PNG
  const width = 2500;
  const height = 1686;
  
  // 创建一个简单的PNG header + 白色像素数据
  // 这里使用一个预先计算好的最小PNG结构
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk (图片头)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);  // 宽度
  ihdrData.writeUInt32BE(height, 4); // 高度
  ihdrData[8] = 8;   // 位深度
  ihdrData[9] = 2;   // 颜色类型 (RGB)
  ihdrData[10] = 0;  // 压缩方法
  ihdrData[11] = 0;  // 过滤方法
  ihdrData[12] = 0;  // 交错方法
  
  const ihdrCRC = calculateCRC(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdrChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),  // 长度
    Buffer.from('IHDR'),         // 类型
    ihdrData,                    // 数据
    ihdrCRC                      // CRC
  ]);
  
  // 简单的IDAT chunk (图片数据)
  const idatData = Buffer.from([0x78, 0x9C, 0x01, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x01]);
  const idatCRC = calculateCRC(Buffer.concat([Buffer.from('IDAT'), idatData]));
  const idatChunk = Buffer.concat([
    Buffer.from([0, 0, 0, idatData.length]),
    Buffer.from('IDAT'),
    idatData,
    idatCRC
  ]);
  
  // IEND chunk
  const iendCRC = calculateCRC(Buffer.from('IEND'));
  const iendChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),   // 长度
    Buffer.from('IEND'),         // 类型
    iendCRC                      // CRC
  ]);
  
  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

// 简单的CRC32计算
function calculateCRC(data) {
  const crcTable = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[i] = c;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  const result = Buffer.alloc(4);
  result.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, 0);
  return result;
}

// 或者使用一个简单的颜色块图片
function createColorBlockPNG() {
  // 为了简单起见，我们创建一个更简单的方法
  // 使用Canvas或直接读取一个小的测试图片
  const fs = require('fs');
  const path = require('path');
  
  // 尝试读取现有的图片文件
  const testImagePath = path.join(__dirname, '..', 'assets', 'richmenu-main.png');
  if (fs.existsSync(testImagePath)) {
    return fs.readFileSync(testImagePath);
  }
  
  // 如果没有，创建一个最小的有效PNG
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77mgAAAABJRU5ErkJggg==', 'base64');
}

async function createSimpleRichMenu() {
  try {
    console.log('🔄 创建带图片的简单Rich Menu...');
    
    // 1. 删除现有Rich Menu
    console.log('🗑️ 删除现有Rich Menu...');
    const existingMenus = await client.getRichMenuList();
    for (const menu of existingMenus) {
      console.log(`删除: ${menu.name}`);
      await client.deleteRichMenu(menu.richMenuId);
    }
    
    // 2. 创建最简单的Rich Menu配置
    const richMenuConfig = {
      size: {
        width: 2500,
        height: 1686
      },
      selected: false,
      name: "Test Simple Menu",
      chatBarText: "テスト",
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
            displayText: "手振り"
          }
        }
      ]
    };
    
    console.log('🎨 创建Rich Menu...');
    const newMenuId = await client.createRichMenu(richMenuConfig);
    console.log('✅ Rich Menu创建成功:', newMenuId);
    
    // 3. 上传图片 - 尝试多种方法
    console.log('📷 准备上传图片...');
    
    let imageBuffer;
    const fs = require('fs');
    const path = require('path');
    
    // 方法1: 尝试读取现有图片
    const imagePath = path.join(__dirname, '..', 'assets', 'richmenu-main.png');
    if (fs.existsSync(imagePath)) {
      imageBuffer = fs.readFileSync(imagePath);
      console.log(`📊 使用现有图片: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
    } else {
      // 方法2: 创建一个1x1像素的测试图片
      imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77mgAAAABJRU5ErkJggg==', 'base64');
      console.log('📊 使用1x1测试图片');
    }
    
    // 4. 上传图片
    console.log('📤 上传图片到Rich Menu...');
    await client.setRichMenuImage(newMenuId, imageBuffer, 'image/png');
    console.log('✅ 图片上传成功！');
    
    // 5. 验证图片
    console.log('🔍 验证图片上传...');
    try {
      const uploadedImage = await client.getRichMenuImage(newMenuId);
      console.log(`✅ 验证成功! 图片大小: ${uploadedImage.length} bytes`);
    } catch (verifyError) {
      console.log('⚠️ 验证失败，但上传可能成功');
    }
    
    // 6. 设置为默认菜单
    console.log('📱 设置为默认Rich Menu...');
    await client.setDefaultRichMenu(newMenuId);
    console.log('✅ 设置完成！');
    
    console.log('\n🎉 Rich Menu创建完成！');
    console.log('📋 菜单ID:', newMenuId);
    console.log('🧪 请重启LINE应用测试');
    console.log('📱 点击整个Rich Menu区域应该触发postback事件');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('🔍 错误堆栈:', error.stack);
  }
}

// 运行脚本
createSimpleRichMenu(); 