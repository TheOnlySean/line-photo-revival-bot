/**
 * 添加新增的6个海报模板到数据库
 */

const db = require('../config/database');

class NewTemplateAdder {
  constructor() {
    // 新增的6个模板配置（已上传到Vercel Blob）
    this.newTemplates = [
      {
        name: 'modern_fashion_01',
        url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/modern_fashion_01-j7THS6os9AbVrL3EzBv8wdfIUpeqTi.jpg',
        description: '现代时尚杂志风格',
        category: 'modern'
      },
      {
        name: 'artistic_portrait_01',
        url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/artistic_portrait_01-r6iKWTRnEdIQ5I07KRR7LpqzT6vveR.jpg',
        description: '艺术人像摄影风格',
        category: 'artistic'
      },
      {
        name: 'youth_magazine_01',
        url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/youth_magazine_01-OFg53Q3uEERLDCNfTjKyp7qxmNHp7K.jpg',
        description: '青春杂志封面风格',
        category: 'youth'
      },
      {
        name: 'elegant_style_01',
        url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/elegant_style_01-SILx1Z3ZXXD9QHwt7PP19wWqQbBEWv.jpg',
        description: '优雅时尚风格',
        category: 'elegant'
      },
      {
        name: 'creative_design_01',
        url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/creative_design_01-i6PFyCn2Xo60ryvfFd5PskwdWVvc7D.jpg',
        description: '创意设计海报风格',
        category: 'creative'
      },
      {
        name: 'premium_magazine_01',
        url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/premium_magazine_01-aL8lEetgUw01WqInkyvVtV4MuERwfi.jpg',
        description: '高端杂志封面风格',
        category: 'premium'
      }
    ];
  }

  async addNewTemplates() {
    console.log('🎨 添加新增的6个海报模板到数据库...\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < this.newTemplates.length; i++) {
      const template = this.newTemplates[i];
      
      try {
        console.log(`📤 添加模板 ${i + 1}/6: ${template.name}...`);
        
        // 使用 addPosterTemplate 函数添加新模板
        const result = await db.addPosterTemplate({
          templateName: template.name,
          templateUrl: template.url,
          description: template.description,
          styleCategory: template.category,
          sortOrder: i + 5 // 排序从5开始，因为原有4个模板已经占用1-4
        });

        if (result) {
          console.log(`   ✅ 成功添加: ${template.name}`);
          console.log(`   📝 描述: ${template.description}`);
          console.log(`   🏷️ 分类: ${template.category}`);
          successCount++;
        } else {
          console.log(`   ⚠️ 添加失败: ${template.name} - 可能已存在`);
          errorCount++;
        }
        
      } catch (error) {
        console.log(`   ❌ 添加失败: ${template.name} - ${error.message}`);
        errorCount++;
      }
      
      console.log(''); // 空行分隔
    }

    // 显示结果统计
    console.log('📊 添加结果统计:');
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${errorCount} 个`);
    console.log(`📋 总计: ${this.newTemplates.length} 个新模板\n`);

    // 验证最终状态
    console.log('🔍 验证数据库最终状态...');
    const allTemplates = await db.getActivePosterTemplates();
    console.log(`📊 数据库中总共有效模板: ${allTemplates.length} 个`);
    
    console.log('\n📋 所有模板列表:');
    allTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.template_name} (${template.style_category})`);
    });

    if (allTemplates.length >= 10) {
      console.log('\n🎉 太好了！现在有10个模板，海报生成功能拥有更多样化的选择！');
      
      // 测试随机选择
      const randomTemplate = await db.getRandomPosterTemplate();
      console.log(`🎲 随机模板测试: ${randomTemplate.template_name} (${randomTemplate.style_category})`);
    } else {
      console.log(`\n⚠️ 还需要添加更多模板，当前只有 ${allTemplates.length} 个`);
    }

    return {
      success: successCount,
      error: errorCount,
      total: this.newTemplates.length,
      finalCount: allTemplates.length
    };
  }
}

// 主函数
async function main() {
  const adder = new NewTemplateAdder();
  
  try {
    const result = await adder.addNewTemplates();
    
    console.log('\n🎯 任务完成！');
    console.log('📊 最终统计:', {
      新增成功: result.success,
      新增失败: result.error,
      数据库总模板: result.finalCount
    });
    
  } catch (error) {
    console.error('❌ 添加过程中出错:', error.message);
  }
}

// 运行脚本
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

module.exports = NewTemplateAdder;
