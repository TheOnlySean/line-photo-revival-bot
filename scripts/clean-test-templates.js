/**
 * 清理测试模板脚本
 * 移除无效的测试模板，确保只使用真实的海报模板
 */

const db = require('../config/database');

async function cleanTestTemplates() {
  console.log('🧹 开始清理测试模板...');
  
  try {
    // 1. 查看当前所有模板
    console.log('1️⃣ 查看当前所有模板...');
    const allTemplates = await db.query(`
      SELECT id, template_name, template_url, style_category, is_active
      FROM poster_templates 
      ORDER BY id
    `);
    
    console.log(`📊 找到 ${allTemplates.rows.length} 个模板:`);
    allTemplates.rows.forEach((template, index) => {
      const isValid = template.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
      const status = isValid ? '✅ 有效' : '❌ 无效';
      console.log(`${index + 1}. ${template.template_name} (${template.style_category}) - ${status}`);
      console.log(`   URL: ${template.template_url}`);
    });

    // 2. 禁用无效的测试模板
    console.log('\n2️⃣ 禁用无效的测试模板...');
    const disableResult = await db.query(`
      UPDATE poster_templates 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE (template_url LIKE '%example.com%' 
         OR template_url LIKE '%test-%'
         OR template_url LIKE '%placeholder%')
      AND is_active = true
      RETURNING template_name, template_url
    `);
    
    console.log(`🗑️ 禁用了 ${disableResult.rowCount} 个无效模板:`);
    disableResult.rows.forEach(template => {
      console.log(`   - ${template.template_name}`);
    });

    // 3. 检查剩余有效模板
    console.log('\n3️⃣ 检查剩余有效模板...');
    const validTemplates = await db.query(`
      SELECT template_name, template_url, style_category
      FROM poster_templates 
      WHERE is_active = true
      ORDER BY template_name
    `);
    
    console.log(`✅ 剩余有效模板: ${validTemplates.rows.length} 个`);
    validTemplates.rows.forEach((template, index) => {
      console.log(`${index + 1}. ${template.template_name} (${template.style_category})`);
      console.log(`   URL: ${template.template_url.substring(0, 80)}...`);
    });

    // 4. 测试随机选择
    console.log('\n4️⃣ 测试随机模板选择...');
    for (let i = 0; i < 3; i++) {
      const randomTemplate = await db.getRandomPosterTemplate();
      if (randomTemplate) {
        const isValid = randomTemplate.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
        console.log(`🎲 测试 ${i + 1}: ${randomTemplate.template_name} - ${isValid ? '✅ 有效' : '❌ 无效'}`);
      } else {
        console.log(`🎲 测试 ${i + 1}: 没有找到模板`);
      }
    }

    if (validTemplates.rows.length >= 4) {
      console.log('\n🎉 清理完成！海报生成应该现在可以正常工作了');
    } else {
      console.log('\n⚠️ 警告: 有效模板不足，可能影响海报生成');
    }

    return {
      success: true,
      disabledCount: disableResult.rowCount,
      validCount: validTemplates.rows.length,
      validTemplates: validTemplates.rows
    };

  } catch (error) {
    console.error('❌ 清理测试模板失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  cleanTestTemplates()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = cleanTestTemplates;
