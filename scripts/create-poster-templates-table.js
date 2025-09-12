/**
 * 创建海报模板数据库表的迁移脚本
 * 用于存储海报生成的模板信息
 */

const db = require('../config/database');

async function createPosterTemplatesTable() {
  console.log('🎨 开始创建海报模板数据库表...');
  
  try {
    // 创建海报模板表
    console.log('📊 创建 poster_templates 表...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS poster_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR(100) NOT NULL UNIQUE,
        template_url TEXT NOT NULL,
        description TEXT,
        style_category VARCHAR(50) DEFAULT 'classic',
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引提高查询效率
    console.log('📈 创建索引...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_poster_templates_active 
      ON poster_templates(is_active)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_poster_templates_category 
      ON poster_templates(style_category)
    `);

    // 验证表创建成功
    console.log('✅ 验证表结构...');
    const tableInfo = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'poster_templates' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 poster_templates 表结构:');
    tableInfo.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

    // 插入初始模板数据（临时使用占位符URL）
    console.log('\n🎨 插入初始海报模板数据...');
    
    const initialTemplates = [
      {
        name: 'vintage_magazine_01',
        url: 'https://placeholder-url/vintage-magazine-01.jpg',
        description: '昭和时代经典杂志封面风格',
        category: 'vintage'
      },
      {
        name: 'retro_poster_01',
        url: 'https://placeholder-url/retro-poster-01.jpg',
        description: '复古电影海报风格',
        category: 'retro'
      },
      {
        name: 'classic_photo_01',
        url: 'https://placeholder-url/classic-photo-01.jpg',
        description: '经典人像摄影风格',
        category: 'classic'
      },
      {
        name: 'japanese_style_01',
        url: 'https://placeholder-url/japanese-style-01.jpg',
        description: '日式传统海报设计',
        category: 'japanese'
      }
    ];

    for (let i = 0; i < initialTemplates.length; i++) {
      const template = initialTemplates[i];
      
      try {
        await db.query(`
          INSERT INTO poster_templates (
            template_name, template_url, description, style_category, sort_order
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (template_name) DO UPDATE SET
            template_url = EXCLUDED.template_url,
            description = EXCLUDED.description,
            style_category = EXCLUDED.style_category,
            updated_at = CURRENT_TIMESTAMP
        `, [template.name, template.url, template.description, template.category, i + 1]);
        
        console.log(`  ✅ 已添加模板: ${template.name} (${template.category})`);
      } catch (error) {
        console.warn(`  ⚠️ 添加模板 ${template.name} 时出错:`, error.message);
      }
    }

    // 统计结果
    const templateCount = await db.query('SELECT COUNT(*) FROM poster_templates WHERE is_active = true');
    const categoryStats = await db.query(`
      SELECT style_category, COUNT(*) as count 
      FROM poster_templates 
      WHERE is_active = true 
      GROUP BY style_category 
      ORDER BY count DESC
    `);

    console.log(`\n📊 海报模板统计:`);
    console.log(`- 总模板数: ${templateCount.rows[0].count} 个`);
    console.log(`- 分类统计:`);
    categoryStats.rows.forEach(stat => {
      console.log(`  - ${stat.style_category}: ${stat.count} 个`);
    });

    console.log('\n🎉 海报模板表创建完成！');
    console.log('\n📝 后续步骤:');
    console.log('1. 准备真实的海报模板图片');
    console.log('2. 使用 PosterImageService.uploadTemplateImage() 上传模板');
    console.log('3. 更新数据库中的 template_url 字段');
    console.log('4. 实现随机模板选择功能');

    return {
      success: true,
      templateCount: parseInt(templateCount.rows[0].count),
      categories: categoryStats.rows
    };

  } catch (error) {
    console.error('❌ 创建海报模板表失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  createPosterTemplatesTable()
    .then((result) => {
      console.log('✅ 海报模板表创建脚本执行完成');
      console.log('📊 结果:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 海报模板表创建脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = createPosterTemplatesTable;
