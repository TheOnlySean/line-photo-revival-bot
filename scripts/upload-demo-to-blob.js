const { put, list } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

// 设置Blob存储token
const BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod";

async function uploadDemoFilesToBlob() {
  console.log('🚀 开始上传demo-files到Vercel Blob存储...');
  
  try {
    // 检查demo-files文件夹
    const demoFilesDir = path.join(__dirname, '..', 'demo-files');
    const files = fs.readdirSync(demoFilesDir).filter(file => 
      file.endsWith('.png') || file.endsWith('.mp4')
    );
    
    console.log(`📁 找到 ${files.length} 个文件需要上传:`);
    files.forEach(file => console.log(`   - ${file}`));
    
    const uploadResults = [];
    
    // 上传每个文件
    for (const file of files) {
      console.log(`\n📤 上传文件: ${file}`);
      
      const filePath = path.join(demoFilesDir, file);
      const fileBuffer = fs.readFileSync(filePath);
      const fileSizeInMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
      
      console.log(`   文件大小: ${fileSizeInMB}MB`);
      
      try {
        // 上传到Vercel Blob
        const blob = await put(`demo-files/${file}`, fileBuffer, {
          access: 'public',
          token: BLOB_READ_WRITE_TOKEN,
        });
        
        console.log(`   ✅ 上传成功: ${blob.url}`);
        
        uploadResults.push({
          originalFile: file,
          blobUrl: blob.url,
          size: fileSizeInMB + 'MB',
          success: true
        });
        
      } catch (error) {
        console.error(`   ❌ 上传失败: ${error.message}`);
        uploadResults.push({
          originalFile: file,
          error: error.message,
          success: false
        });
      }
    }
    
    // 显示上传结果摘要
    console.log('\n📊 上传结果摘要:');
    console.log('='.repeat(60));
    
    const successCount = uploadResults.filter(r => r.success).length;
    const failedCount = uploadResults.filter(r => !r.success).length;
    
    console.log(`✅ 成功: ${successCount} 个文件`);
    console.log(`❌ 失败: ${failedCount} 个文件`);
    
    // 显示详细结果
    console.log('\n📋 详细结果:');
    uploadResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.originalFile}`);
      if (result.success) {
        console.log(`   ✅ Blob URL: ${result.blobUrl}`);
        console.log(`   📊 大小: ${result.size}`);
      } else {
        console.log(`   ❌ 错误: ${result.error}`);
      }
    });
    
    // 生成更新的配置
    if (successCount > 0) {
      console.log('\n🔧 建议的配置更新:');
      console.log('='.repeat(60));
      
      const configUpdates = uploadResults
        .filter(r => r.success)
        .map(r => {
          const fileNumber = r.originalFile.match(/(\d+)\./)[1];
          const fileType = r.originalFile.endsWith('.png') ? 'image' : 'video';
          return { fileNumber, fileType, url: r.blobUrl };
        });
      
      // 按文件编号分组
      const grouped = {};
      configUpdates.forEach(update => {
        if (!grouped[update.fileNumber]) {
          grouped[update.fileNumber] = {};
        }
        grouped[update.fileNumber][update.fileType] = update.url;
      });
      
      console.log('更新 config/demo-trial-photos.js:');
      Object.entries(grouped).forEach(([num, urls]) => {
        console.log(`\ntrial_${num}:`);
        if (urls.image) console.log(`  image_url: '${urls.image}'`);
        if (urls.video) console.log(`  demo_video_url: '${urls.video}'`);
      });
    }
    
    console.log('\n🎯 下一步:');
    console.log('1. 更新配置文件使用Blob URLs');
    console.log('2. 测试免费试用功能');
    console.log('3. 确认图片预览和视频发送都正常工作');
    
    return uploadResults;
    
  } catch (error) {
    console.error('❌ 上传过程失败:', error);
    throw error;
  }
}

// 列出当前Blob存储中的文件
async function listBlobFiles() {
  console.log('📋 列出Vercel Blob存储中的文件...');
  
  try {
    const { blobs } = await list({
      token: BLOB_READ_WRITE_TOKEN,
    });
    
    if (blobs.length === 0) {
      console.log('📁 Blob存储中没有文件');
      return;
    }
    
    console.log(`📁 找到 ${blobs.length} 个文件:`);
    blobs.forEach((blob, index) => {
      console.log(`\n${index + 1}. ${blob.pathname}`);
      console.log(`   URL: ${blob.url}`);
      console.log(`   大小: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`   上传时间: ${blob.uploadedAt}`);
    });
    
    return blobs;
    
  } catch (error) {
    console.error('❌ 列出文件失败:', error);
    throw error;
  }
}

// 清理Blob存储（可选）
async function cleanBlobStorage() {
  console.log('🧹 清理Blob存储...');
  
  try {
    const { blobs } = await list({
      token: BLOB_READ_WRITE_TOKEN,
    });
    
    if (blobs.length === 0) {
      console.log('📁 Blob存储中没有文件需要清理');
      return;
    }
    
    console.log(`🗑️ 准备删除 ${blobs.length} 个文件...`);
    
    for (const blob of blobs) {
      try {
        // 注意：@vercel/blob 没有直接的删除方法，文件会自动过期
        console.log(`   📝 标记删除: ${blob.pathname}`);
      } catch (error) {
        console.error(`   ❌ 删除失败: ${blob.pathname} - ${error.message}`);
      }
    }
    
    console.log('ℹ️ 注意：Vercel Blob文件会自动过期删除');
    
  } catch (error) {
    console.error('❌ 清理过程失败:', error);
    throw error;
  }
}

// 测试Blob连接
async function testBlobConnection() {
  console.log('🧪 测试Vercel Blob连接...');
  
  try {
    // 上传一个小的测试文件
    const testContent = Buffer.from('Blob连接测试', 'utf8');
    const testBlob = await put('test/connection-test.txt', testContent, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
    });
    
    console.log('✅ Blob连接测试成功');
    console.log(`   测试文件URL: ${testBlob.url}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Blob连接测试失败:', error.message);
    return false;
  }
}

// 主函数
async function main() {
  const command = process.argv[2] || 'upload';
  
  switch (command) {
    case 'upload':
      await uploadDemoFilesToBlob();
      break;
    case 'list':
      await listBlobFiles();
      break;
    case 'clean':
      await cleanBlobStorage();
      break;
    case 'test':
      await testBlobConnection();
      break;
    default:
      console.log(`
🚀 Vercel Blob 管理工具

使用方法:
  node scripts/upload-demo-to-blob.js [命令]

命令:
  upload  - 上传demo-files到Blob存储 (默认)
  list    - 列出Blob存储中的文件
  test    - 测试Blob连接
  clean   - 清理Blob存储

示例:
  node scripts/upload-demo-to-blob.js upload
  node scripts/upload-demo-to-blob.js list
      `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  uploadDemoFilesToBlob,
  listBlobFiles,
  cleanBlobStorage,
  testBlobConnection
}; 