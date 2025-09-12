/**
 * 海报模板上传脚本
 * 上传4张海报模板图片并更新数据库
 */

const fs = require('fs');
const path = require('path');
const PosterImageService = require('../services/poster-image-service');
const db = require('../config/database');

class PosterTemplateUploader {
  constructor() {
    this.posterImageService = new PosterImageService();
    
    // 预定义的4个模板信息
    this.templateConfigs = [
      {
        name: 'vintage_magazine_01',
        fileName: 'template1.jpg', // 您需要将模板图片命名为这些文件名
        description: '昭和时代经典杂志封面风格',
        category: 'vintage'
      },
      {
        name: 'retro_poster_01',
        fileName: 'template2.jpg',
        description: '复古电影海报风格',
        category: 'retro'
      },
      {
        name: 'classic_photo_01',
        fileName: 'template3.jpg',
        description: '经典人像摄影风格',
        category: 'classic'
      },
      {
        name: 'japanese_style_01',
        fileName: 'template4.jpg',
        description: '日式传统海报设计',
        category: 'japanese'
      }
    ];
  }

  /**
   * 上传所有模板图片
   */
  async uploadAllTemplates() {
    console.log('🎨 开始上传海报模板图片...\n');
    
    const templateDir = path.join(__dirname, '..', 'assets', 'poster-templates');
    console.log(`📁 模板图片目录: ${templateDir}`);
    
    // 检查目录是否存在
    if (!fs.existsSync(templateDir)) {
      console.log(`📂 创建模板目录: ${templateDir}`);
      fs.mkdirSync(templateDir, { recursive: true });
      
      console.log('\n📝 请将您的4张海报模板图片放在以下位置：');
      this.templateConfigs.forEach((config, index) => {
        console.log(`   ${index + 1}. ${path.join(templateDir, config.fileName)} - ${config.description}`);
      });
      console.log('\n然后重新运行此脚本。');
      return;
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const config of this.templateConfigs) {
      try {
        console.log(`📤 上传模板: ${config.name}...`);
        
        const imagePath = path.join(templateDir, config.fileName);
        
        // 检查文件是否存在
        if (!fs.existsSync(imagePath)) {
          console.log(`   ⚠️ 文件不存在: ${config.fileName}`);
          results.push({
            template: config.name,
            status: 'missing',
            error: `文件不存在: ${config.fileName}`
          });
          errorCount++;
          continue;
        }

        // 检查文件大小
        const stats = fs.statSync(imagePath);
        const fileSizeKB = stats.size / 1024;
        console.log(`   📊 文件大小: ${fileSizeKB.toFixed(2)} KB`);
        
        if (stats.size === 0) {
          console.log(`   ❌ 文件为空: ${config.fileName}`);
          results.push({
            template: config.name,
            status: 'empty',
            error: '文件为空'
          });
          errorCount++;
          continue;
        }

        // 读取并上传图片
        const imageBuffer = fs.readFileSync(imagePath);
        
        // 验证图片格式
        if (!this.posterImageService.isValidImageFormat(imageBuffer)) {
          console.log(`   ❌ 无效的图片格式: ${config.fileName}`);
          results.push({
            template: config.name,
            status: 'invalid_format',
            error: '无效的图片格式'
          });
          errorCount++;
          continue;
        }

        // 上传到存储服务
        const uploadedUrl = await this.posterImageService.uploadTemplateImage(
          imageBuffer, 
          config.name
        );
        
        console.log(`   ✅ 上传成功: ${uploadedUrl}`);
        
        // 更新数据库
        const updateResult = await db.updatePosterTemplateUrl(config.name, uploadedUrl);
        
        if (updateResult) {
          console.log(`   ✅ 数据库更新成功: ${config.name}`);
          results.push({
            template: config.name,
            status: 'success',
            url: uploadedUrl,
            description: config.description,
            category: config.category
          });
          successCount++;
        } else {
          console.log(`   ⚠️ 数据库更新失败: ${config.name}`);
          results.push({
            template: config.name,
            status: 'db_error',
            url: uploadedUrl,
            error: '数据库更新失败'
          });
          errorCount++;
        }
        
      } catch (error) {
        console.log(`   ❌ 上传失败: ${config.name} - ${error.message}`);
        results.push({
          template: config.name,
          status: 'error',
          error: error.message
        });
        errorCount++;
      }
      
      console.log(''); // 空行分隔
    }

    // 显示结果统计
    console.log('📊 上传结果统计:');
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${errorCount} 个`);
    console.log(`📋 总计: ${this.templateConfigs.length} 个模板\n`);

    // 显示详细结果
    console.log('📋 详细结果:');
    results.forEach((result, index) => {
      const status = result.status === 'success' ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.template}`);
      if (result.status === 'success') {
        console.log(`   URL: ${result.url}`);
        console.log(`   描述: ${result.description}`);
      } else {
        console.log(`   错误: ${result.error}`);
      }
    });

    // 验证数据库状态
    console.log('\n🔍 验证数据库状态...');
    const activeTemplates = await db.getActivePosterTemplates();
    const validTemplates = activeTemplates.filter(t => 
      t.template_url && 
      t.template_url !== 'https://placeholder-url/vintage-magazine-01.jpg' &&
      t.template_url.startsWith('https://')
    );
    
    console.log(`📊 数据库中有效模板: ${validTemplates.length}/${activeTemplates.length}`);
    
    if (validTemplates.length >= 4) {
      console.log('🎉 所有模板准备就绪！海报生成功能可以正常工作了！');
      
      // 测试随机选择
      const randomTemplate = await db.getRandomPosterTemplate();
      console.log(`🎲 随机模板测试: ${randomTemplate.template_name} - ${randomTemplate.template_url}`);
    } else {
      console.log('⚠️ 还需要更多有效模板才能正常工作');
    }

    return {
      success: successCount,
      error: errorCount,
      total: this.templateConfigs.length,
      results: results,
      readyForProduction: validTemplates.length >= 4
    };
  }

  /**
   * 列出当前模板状态
   */
  async listCurrentTemplates() {
    console.log('📋 当前海报模板状态:\n');
    
    const templates = await db.getActivePosterTemplates();
    
    templates.forEach((template, index) => {
      const isValid = template.template_url && 
                     template.template_url.startsWith('https://') &&
                     !template.template_url.includes('placeholder-url');
      
      const status = isValid ? '✅ 有效' : '⚠️ 占位符';
      console.log(`${index + 1}. ${template.template_name} (${template.style_category})`);
      console.log(`   状态: ${status}`);
      console.log(`   URL: ${template.template_url}`);
      console.log(`   描述: ${template.description || '无描述'}`);
      console.log('');
    });
  }
}

// 主函数
async function main() {
  const uploader = new PosterTemplateUploader();
  
  try {
    // 显示当前状态
    await uploader.listCurrentTemplates();
    
    console.log('─'.repeat(60));
    
    // 执行上传
    const result = await uploader.uploadAllTemplates();
    
    if (result) {
      console.log('\n🎯 下一步:');
      if (result.readyForProduction) {
        console.log('✅ 海报生成功能已就绪，可以开始测试！');
        console.log('📝 运行测试: node scripts/test-poster-generator.js');
      } else {
        console.log('📋 请确保所有模板图片都已正确上传');
        console.log('🔧 检查 assets/poster-templates/ 目录中的文件');
      }
    }
    
  } catch (error) {
    console.error('❌ 上传过程中出错:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = PosterTemplateUploader;
