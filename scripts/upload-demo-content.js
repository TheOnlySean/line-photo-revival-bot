const { put } = require('@vercel/blob');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const lineConfig = require('../config/line-config');
const db = require('../config/database');

// 演示内容信息
const DEMO_INFO = [
  {
    title: '复古美女',
    description: '优雅的复古风格女性肖像，展现经典美感',
    sortOrder: 1
  },
  {
    title: '商务男士', 
    description: '专业的商务男性形象，彰显职场风范',
    sortOrder: 2
  },
  {
    title: '青春少女',
    description: '活泼可爱的青春少女，充满朝气活力',
    sortOrder: 3
  }
];

// 上传单个文件到Vercel Blob
async function uploadFileToBlob(filePath, fileName) {
  try {
    console.log(`📤 上传文件: ${fileName}`);
    
    const fileBuffer = await fs.readFile(filePath);
    const blobFileName = `line-demo/${fileName}`;
    
    const blob = await put(blobFileName, fileBuffer, {
      access: 'public',
      token: lineConfig.blobToken
    });
    
    console.log(`✅ 上传成功: ${blob.url}`);
    return blob.url;
    
  } catch (error) {
    console.error(`❌ 上传失败 ${fileName}:`, error.message);
    return null;
  }
}

// 批量上传演示文件
async function uploadDemoFiles(demoFolderPath) {
  try {
    console.log('🚀 开始上传演示内容...');
    console.log('=======================');
    
    // 检查文件夹是否存在
    try {
      await fs.access(demoFolderPath);
    } catch (error) {
             console.error(`❌ 找不到演示文件夹: ${demoFolderPath}`);
       console.log('💡 请确保文件夹存在，并包含以下文件:');
       console.log('  - 图片: demo1.jpg/png 或 1.jpg/png');
       console.log('  - 视频: demo1.mp4 或 1.mp4');
       console.log('  - (同样的命名规则适用于 2 和 3)');
      return;
    }
    
    const results = [];
    
    // 遍历3组演示内容
    for (let i = 1; i <= 3; i++) {
      console.log(`\n📁 处理第${i}组演示内容...`);
      
      // 支持多种文件格式和命名方式
      let imageFile, videoFile, imagePath, videoPath;
      
      // 尝试不同的命名格式
      const possibleImageNames = [`demo${i}.jpg`, `demo${i}.png`, `${i}.jpg`, `${i}.png`];
      const possibleVideoNames = [`demo${i}.mp4`, `${i}.mp4`];
      
      // 查找图片文件
      for (const name of possibleImageNames) {
        const testPath = path.join(demoFolderPath, name);
        try {
          await fs.access(testPath);
          imageFile = name;
          imagePath = testPath;
          break;
        } catch (error) {
          // 继续尝试下一个
        }
      }
      
      // 查找视频文件
      for (const name of possibleVideoNames) {
        const testPath = path.join(demoFolderPath, name);
        try {
          await fs.access(testPath);
          videoFile = name;
          videoPath = testPath;
          break;
        } catch (error) {
          // 继续尝试下一个
        }
      }
      
      // 检查文件是否都找到了
      if (!imageFile || !videoFile) {
        console.error(`❌ 找不到第${i}组的图片或视频文件`);
        console.log(`   期望找到: ${possibleImageNames.join(' 或 ')}`);
        console.log(`   期望找到: ${possibleVideoNames.join(' 或 ')}`);
        continue;
      }
      
      console.log(`📸 找到图片: ${imageFile}`);
      console.log(`🎬 找到视频: ${videoFile}`);
      
      // 上传图片和视频（统一命名格式）
      const normalizedImageName = `demo${i}.jpg`;
      const normalizedVideoName = `demo${i}.mp4`;
      
      const imageUrl = await uploadFileToBlob(imagePath, normalizedImageName);
      const videoUrl = await uploadFileToBlob(videoPath, normalizedVideoName);
      
      if (imageUrl && videoUrl) {
        results.push({
          ...DEMO_INFO[i - 1],
          imageUrl,
          videoUrl
        });
        
        console.log(`✅ 第${i}组内容上传完成`);
      } else {
        console.error(`❌ 第${i}组内容上传失败`);
      }
    }
    
    if (results.length > 0) {
      console.log('\n💾 更新数据库...');
      await updateDatabaseWithUrls(results);
      console.log('🎉 演示内容上传和配置完成！');
      
      // 显示结果摘要
      console.log('\n📊 上传结果摘要:');
      results.forEach((demo, index) => {
        console.log(`${index + 1}. ${demo.title}`);
        console.log(`   图片: ${demo.imageUrl}`);
        console.log(`   视频: ${demo.videoUrl}`);
      });
    } else {
      console.log('❌ 没有成功上传任何内容');
    }
    
  } catch (error) {
    console.error('❌ 上传过程中发生错误:', error.message);
  }
}

// 更新数据库中的演示内容
async function updateDatabaseWithUrls(demoContents) {
  try {
    // 清除现有演示内容
    await db.query('DELETE FROM line_demo_contents');
    console.log('🗑️ 清除现有演示内容');
    
    // 插入新的演示内容
    for (const demo of demoContents) {
      const result = await db.insertDemoContent(
        demo.title,
        demo.imageUrl,
        demo.videoUrl,
        demo.description,
        demo.sortOrder
      );
      
      console.log(`✅ 添加演示内容: ${demo.title} (ID: ${result.id})`);
    }
    
    console.log('💾 数据库更新完成');
    
  } catch (error) {
    console.error('❌ 数据库更新失败:', error.message);
    throw error;
  }
}

// 使用URL直接配置演示内容
async function configureWithUrls(demoUrls) {
  try {
    console.log('🔧 使用提供的URL配置演示内容...');
    
    if (demoUrls.length !== 3) {
      throw new Error('需要提供3组演示内容URL');
    }
    
    const demoContents = demoUrls.map((urls, index) => ({
      ...DEMO_INFO[index],
      imageUrl: urls.imageUrl,
      videoUrl: urls.videoUrl
    }));
    
    await updateDatabaseWithUrls(demoContents);
    console.log('🎉 演示内容配置完成！');
    
  } catch (error) {
    console.error('❌ 配置失败:', error.message);
  }
}

// 查看当前演示内容
async function viewCurrentDemoContent() {
  try {
    console.log('📋 当前演示内容:');
    console.log('================');
    
    const contents = await db.getDemoContents();
    
    if (contents.length === 0) {
      console.log('❌ 没有找到演示内容');
      return;
    }
    
    contents.forEach((content, index) => {
      console.log(`${index + 1}. ${content.title}`);
      console.log(`   描述: ${content.description}`);
      console.log(`   图片: ${content.image_url}`);
      console.log(`   视频: ${content.video_url}`);
      console.log(`   状态: ${content.is_active ? '激活' : '禁用'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ 查看演示内容失败:', error.message);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🎬 演示内容管理工具');
  console.log('===================');
  
  switch (command) {
    case 'upload':
      const folderPath = args[1] || './demo-files';
      await uploadDemoFiles(folderPath);
      break;
      
    case 'config':
      // 使用预定义URL配置（需要手动编辑此脚本）
      const exampleUrls = [
        {
          imageUrl: 'https://your-storage.com/demo1.jpg',
          videoUrl: 'https://your-storage.com/demo1.mp4'
        },
        {
          imageUrl: 'https://your-storage.com/demo2.jpg', 
          videoUrl: 'https://your-storage.com/demo2.mp4'
        },
        {
          imageUrl: 'https://your-storage.com/demo3.jpg',
          videoUrl: 'https://your-storage.com/demo3.mp4'  
        }
      ];
      
      console.log('💡 请编辑此脚本中的 exampleUrls 数组，然后重新运行');
      // await configureWithUrls(exampleUrls);
      break;
      
    case 'view':
      await viewCurrentDemoContent();
      break;
      
    default:
      console.log('📖 使用方法:');
      console.log('');
      console.log('查看当前演示内容:');
      console.log('  node scripts/upload-demo-content.js view');
      console.log('');
      console.log('从文件夹上传演示内容:');
      console.log('  node scripts/upload-demo-content.js upload [文件夹路径]');
      console.log('  默认路径: ./demo-files');
      console.log('');
      console.log('使用URL配置演示内容:');
      console.log('  node scripts/upload-demo-content.js config');
      console.log('  (需要先编辑脚本中的URL)');
      console.log('');
      console.log('📁 文件夹结构示例:');
      console.log('  demo-files/');
      console.log('  ├── demo1.jpg');
      console.log('  ├── demo1.mp4');
      console.log('  ├── demo2.jpg');
      console.log('  ├── demo2.mp4');
      console.log('  ├── demo3.jpg');
      console.log('  └── demo3.mp4');
      break;
  }
  
  // 关闭数据库连接
  await db.close();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  uploadDemoFiles,
  configureWithUrls,
  viewCurrentDemoContent
}; 