const axios = require('axios');
const fs = require('fs');
const path = require('path');
const lineConfig = require('../config/line-config');

const LINE_ACCESS_TOKEN = lineConfig.channelAccessToken;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

async function uploadRichMenuImage() {
  try {
    // 1. 获取现有Rich Menu列表
    console.log('🔍 获取Rich Menu列表...');
    const listResponse = await axios.get(`${LINE_API_BASE}/richmenu/list`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    const richMenus = listResponse.data.richmenus;
    console.log('📋 找到Rich Menu数量:', richMenus.length);
    
    if (richMenus.length === 0) {
      console.error('❌ 没有找到Rich Menu，请先运行创建脚本');
      return;
    }
    
    // 使用第一个Rich Menu
    const richMenu = richMenus[0];
    console.log('🎯 使用Rich Menu:', richMenu.name, '(', richMenu.richMenuId, ')');
    
    // 2. 准备图片
    const imagePath = path.join(__dirname, '..', 'assets', 'richmenu-main.png');
    console.log('📁 图片路径:', imagePath);
    
    if (!fs.existsSync(imagePath)) {
      console.error('❌ 图片文件不存在:', imagePath);
      return;
    }
    
    const imageBuffer = fs.readFileSync(imagePath);
    console.log('📊 图片大小:', imageBuffer.length, 'bytes');
    
    // 检查图片是否太大 (LINE限制是1MB)
    if (imageBuffer.length > 1024 * 1024) {
      console.log('⚠️ 图片过大，尝试使用压缩版本...');
      const compressedPath = path.join(__dirname, '..', 'assets', 'richmenu-main-compressed.png');
      
      if (fs.existsSync(compressedPath)) {
        const compressedBuffer = fs.readFileSync(compressedPath);
        console.log('📊 压缩图片大小:', compressedBuffer.length, 'bytes');
        
        if (compressedBuffer.length <= 1024 * 1024) {
          console.log('✅ 使用压缩图片');
          imageBuffer = compressedBuffer;
        }
      }
    }
    
    // 3. 验证Rich Menu是否存在
    console.log('🔍 验证Rich Menu...');
    const verifyResponse = await axios.get(`${LINE_API_BASE}/richmenu/${richMenu.richMenuId}`, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    console.log('✅ Rich Menu验证通过:', verifyResponse.data.name);
    
    // 4. 上传图片 (尝试PUT方法)
    console.log('📷 上传Rich Menu图片...');
    console.log('🔗 上传URL:', `${LINE_API_BASE}/richmenu/${richMenu.richMenuId}/content`);
    
    try {
      // 先尝试POST方法
      const uploadResponse = await axios.post(
        `${LINE_API_BASE}/richmenu/${richMenu.richMenuId}/content`, 
        imageBuffer, 
        {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'image/png'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      console.log('✅ POST方法上传成功');
    } catch (postError) {
      console.log('❌ POST方法失败，尝试PUT方法...');
      
      // 尝试PUT方法
      const uploadResponse = await axios.put(
        `${LINE_API_BASE}/richmenu/${richMenu.richMenuId}/content`, 
        imageBuffer, 
        {
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'image/png'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      console.log('✅ PUT方法上传成功');
    }
    
    console.log('✅ Rich Menu图片上传成功!');
    
    // 5. 设置为默认菜单
    console.log('📱 设置为默认Rich Menu...');
    await axios.post(`${LINE_API_BASE}/user/all/richmenu/${richMenu.richMenuId}`, {}, {
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    
    console.log('🎉 Rich Menu设置完成！');
    console.log('⚠️ 请重启LINE应用或等待几分钟让更改生效');
    console.log('🧪 然后测试点击Rich Menu按钮');
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    
    if (error.response) {
      console.error('📊 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 400) {
        console.log('💡 提示: 可能是图片格式或尺寸问题');
        console.log('💡 Rich Menu图片要求: 2500x1686px, PNG/JPEG, 小于1MB');
      }
    }
  }
}

// 运行脚本
uploadRichMenuImage(); 