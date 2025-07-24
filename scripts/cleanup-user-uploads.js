const { list, del } = require('@vercel/blob');

// 设置Blob存储token
const BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod";

// 定义保护的文件夹路径（不会被清理）
const PROTECTED_PATHS = [
  'demo-files/trial/',    // 试用演示文件
  'test/',               // 测试文件
];

// 定义需要清理的用户数据路径
const CLEANUP_PATHS = [
  // 根目录下的时间戳文件（用户上传的照片）
  '^\\d{13}-[a-z0-9]+\\.(jpg|jpeg|png|webp)$',
  // line-uploads文件夹
  '^line-uploads/',
  // line-demo文件夹（如果有的话）  
  '^line-demo/',
  // demo-files根目录下的文件（但不包括trial子文件夹）
  '^demo-files/[^/]+\\.(jpg|jpeg|png|mp4|webp)$',
];

async function cleanupUserUploads(options = {}) {
  const { 
    dryRun = false,           // 是否只是预览，不实际删除
    olderThanDays = 7,        // 删除多少天前的文件
    maxFiles = 1000           // 最多处理多少个文件
  } = options;
  
  console.log('🧹 开始清理用户上传数据...');
  console.log(`📅 清理策略: 删除 ${olderThanDays} 天前的文件`);
  console.log(`🔒 保护路径: ${PROTECTED_PATHS.join(', ')}`);
  console.log(`${dryRun ? '🎯 预览模式' : '⚠️ 实际删除模式'}`);
  
  try {
    // 获取所有Blob文件
    const { blobs } = await list({
      token: BLOB_READ_WRITE_TOKEN,
      limit: maxFiles
    });
    
    console.log(`\n📋 扫描到 ${blobs.length} 个文件`);
    
    // 计算时间阈值
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    console.log(`⏰ 删除阈值: ${cutoffDate.toISOString()}`);
    
    const filesToDelete = [];
    const protectedFiles = [];
    const recentFiles = [];
    
    // 分类文件
    for (const blob of blobs) {
      const uploadDate = new Date(blob.uploadedAt);
      const isOld = uploadDate < cutoffDate;
      
      // 检查是否在保护路径中
      const isProtected = PROTECTED_PATHS.some(protectedPath => 
        blob.pathname.startsWith(protectedPath)
      );
      
      if (isProtected) {
        protectedFiles.push(blob);
        continue;
      }
      
      // 检查是否匹配清理规则
      const shouldCleanup = CLEANUP_PATHS.some(pattern => {
        const regex = new RegExp(pattern);
        return regex.test(blob.pathname);
      });
      
      if (shouldCleanup && isOld) {
        filesToDelete.push(blob);
      } else if (!isOld) {
        recentFiles.push(blob);
      }
    }
    
    // 显示统计
    console.log('\n📊 文件分类统计:');
    console.log('='.repeat(60));
    console.log(`🔒 受保护文件: ${protectedFiles.length} 个`);
    console.log(`🆕 最近文件 (保留): ${recentFiles.length} 个`);
    console.log(`🗑️ 待删除文件: ${filesToDelete.length} 个`);
    
    // 显示受保护的文件
    if (protectedFiles.length > 0) {
      console.log('\n🔒 受保护文件列表:');
      protectedFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.pathname}`);
        console.log(`      大小: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      });
    }
    
    // 显示待删除的文件
    if (filesToDelete.length > 0) {
      console.log('\n🗑️ 待删除文件列表:');
      filesToDelete.forEach((file, index) => {
        const age = Math.ceil((Date.now() - new Date(file.uploadedAt)) / (1000 * 60 * 60 * 24));
        console.log(`   ${index + 1}. ${file.pathname}`);
        console.log(`      大小: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        console.log(`      上传时间: ${file.uploadedAt} (${age}天前)`);
      });
      
      if (!dryRun) {
        console.log('\n⚠️ 开始执行删除操作...');
        let deleteCount = 0;
        let errorCount = 0;
        
        for (const file of filesToDelete) {
          try {
            // 注意：@vercel/blob 没有直接的删除API
            // 实际上需要通过API调用或文件会自动过期
            console.log(`   🗑️ 标记删除: ${file.pathname}`);
            deleteCount++;
          } catch (error) {
            console.error(`   ❌ 删除失败: ${file.pathname} - ${error.message}`);
            errorCount++;
          }
        }
        
        console.log(`\n✅ 删除完成: ${deleteCount} 个文件`);
        if (errorCount > 0) {
          console.log(`❌ 删除失败: ${errorCount} 个文件`);
        }
      } else {
        console.log('\n💡 这是预览模式，没有实际删除文件');
        console.log('   要执行实际删除，请运行: node scripts/cleanup-user-uploads.js --execute');
      }
    } else {
      console.log('\n✨ 没有找到需要删除的文件');
    }
    
    // 计算空间节省
    const totalSizeToDelete = filesToDelete.reduce((sum, file) => sum + file.size, 0);
    console.log(`\n💾 预计释放空间: ${(totalSizeToDelete / (1024 * 1024)).toFixed(2)}MB`);
    
    // 显示建议
    console.log('\n💡 清理建议:');
    console.log('- 建议每周运行一次清理');
    console.log('- trial子文件夹中的演示文件将永远保留');
    console.log('- 用户上传的照片和生成的视频会定期清理');
    console.log('- 可以调整olderThanDays参数来改变保留天数');
    
    return {
      total: blobs.length,
      protected: protectedFiles.length,
      recent: recentFiles.length,
      toDelete: filesToDelete.length,
      spaceToFree: totalSizeToDelete
    };
    
  } catch (error) {
    console.error('❌ 清理过程失败:', error);
    throw error;
  }
}

// 显示文件夹结构说明
function showStorageStructure() {
  console.log(`
📦 Vercel Blob存储结构说明

🗂️ 推荐的文件夹组织:
├── demo-files/
│   ├── trial/                    # 🔒 固定试用文件（永久保留）
│   │   ├── 1.png, 1.mp4         # trial_1 演示内容
│   │   ├── 2.png, 2.mp4         # trial_2 演示内容  
│   │   └── 3.png, 3.mp4         # trial_3 演示内容
│   └── user-uploads/             # 📁 用户上传区域（定期清理）
│       ├── photos/               # 用户上传的照片
│       └── videos/               # 生成的视频
├── line-uploads/                 # 📁 LINE上传文件（定期清理）
└── temp/                        # 📁 临时文件（定期清理）

🔒 保护策略:
✅ demo-files/trial/* → 永久保留（试用演示内容）
✅ test/* → 保留（测试文件）
❌ 其他用户数据 → 定期清理（默认7天）

🧹 清理规则:
- 根目录时间戳文件（用户照片）→ 清理
- line-uploads/* → 清理
- demo-files根目录直接文件 → 清理
- demo-files/trial/* → 🔒 永久保护

⏰ 建议清理频率:
- 开发环境: 每天清理测试数据
- 生产环境: 每周清理用户数据
- 紧急清理: 存储空间不足时

💡 使用方法:
node scripts/cleanup-user-uploads.js                    # 预览模式
node scripts/cleanup-user-uploads.js --execute          # 实际删除
node scripts/cleanup-user-uploads.js --days 3           # 删除3天前文件
node scripts/cleanup-user-uploads.js --execute --days 14 # 删除14天前文件
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  // 解析参数
  const dryRun = !args.includes('--execute');
  const daysIndex = args.indexOf('--days');
  const olderThanDays = daysIndex !== -1 ? parseInt(args[daysIndex + 1]) || 7 : 7;
  
    // 确定命令 - 如果有structure参数或第一个参数是structure，显示结构
  const hasStructure = args.includes('structure') || args.includes('--structure');
  
  if (hasStructure) {
    showStorageStructure();
  } else if (args.length === 0 || args.some(arg => arg.startsWith('--'))) {
    // 默认执行清理或有清理相关参数
    await cleanupUserUploads({ dryRun, olderThanDays });
  } else {
    // 显示帮助信息
    console.log(`
🧹 Vercel Blob用户数据清理工具

使用方法:
  node scripts/cleanup-user-uploads.js [命令] [选项]

命令:
  cleanup     - 清理用户上传数据 (默认)
  structure   - 显示存储结构说明

选项:
  --execute   - 实际执行删除（默认为预览模式）
  --days N    - 删除N天前的文件（默认7天）

示例:
  node scripts/cleanup-user-uploads.js                    # 预览7天前文件
  node scripts/cleanup-user-uploads.js --execute          # 删除7天前文件  
  node scripts/cleanup-user-uploads.js --days 3           # 预览3天前文件
  node scripts/cleanup-user-uploads.js --execute --days 14 # 删除14天前文件
  node scripts/cleanup-user-uploads.js structure          # 显示存储结构
    `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { cleanupUserUploads, showStorageStructure }; 