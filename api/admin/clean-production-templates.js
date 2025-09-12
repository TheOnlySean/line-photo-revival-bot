/**
 * 生产环境模板清理API
 * 清理生产环境数据库中的无效测试模板
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  // 只允许POST请求和管理密钥
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== 'clean-production-templates-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🧹 开始清理生产环境测试模板...');
    
    // 1. 查看当前所有模板
    console.log('1️⃣ 查看当前所有模板...');
    const allTemplates = await db.query(`
      SELECT id, template_name, template_url, style_category, is_active
      FROM poster_templates 
      ORDER BY id
    `);
    
    console.log(`📊 找到 ${allTemplates.rows.length} 个模板`);
    
    const templateStatus = allTemplates.rows.map(template => {
      const isValid = template.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
      return {
        name: template.template_name,
        category: template.style_category,
        isActive: template.is_active,
        isValid: isValid,
        url: template.template_url
      };
    });

    // 2. 禁用无效的测试模板
    console.log('2️⃣ 禁用无效的测试模板...');
    const disableResult = await db.query(`
      UPDATE poster_templates 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE (template_url LIKE '%example.com%' 
         OR template_url LIKE '%test-%'
         OR template_url LIKE '%placeholder%')
      AND is_active = true
      RETURNING template_name, template_url
    `);
    
    console.log(`🗑️ 禁用了 ${disableResult.rowCount} 个无效模板`);

    // 3. 激活所有有效模板
    console.log('3️⃣ 激活所有有效模板...');
    const activateResult = await db.query(`
      UPDATE poster_templates 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE template_url LIKE 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/%'
      AND is_active = false
      RETURNING template_name
    `);
    
    console.log(`✅ 激活了 ${activateResult.rowCount} 个有效模板`);

    // 4. 检查最终状态
    console.log('4️⃣ 检查最终状态...');
    const finalValidTemplates = await db.query(`
      SELECT template_name, template_url, style_category
      FROM poster_templates 
      WHERE is_active = true
      ORDER BY template_name
    `);
    
    console.log(`✅ 最终有效模板: ${finalValidTemplates.rows.length} 个`);

    // 5. 测试随机选择
    console.log('5️⃣ 测试随机模板选择...');
    const testResults = [];
    
    for (let i = 0; i < 3; i++) {
      try {
        const randomTemplate = await db.getRandomPosterTemplate();
        if (randomTemplate) {
          const isValid = randomTemplate.template_url.startsWith('https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/');
          testResults.push({
            test: i + 1,
            templateName: randomTemplate.template_name,
            category: randomTemplate.style_category,
            isValid: isValid,
            status: isValid ? 'success' : 'error'
          });
          console.log(`🎲 测试 ${i + 1}: ${randomTemplate.template_name} - ${isValid ? '✅ 有效' : '❌ 无效'}`);
        } else {
          testResults.push({
            test: i + 1,
            status: 'error',
            error: 'No template found'
          });
          console.log(`🎲 测试 ${i + 1}: 没有找到模板`);
        }
      } catch (testError) {
        testResults.push({
          test: i + 1,
          status: 'error',
          error: testError.message
        });
        console.log(`🎲 测试 ${i + 1}: 错误 - ${testError.message}`);
      }
    }

    const allTestsValid = testResults.every(t => t.status === 'success' && t.isValid);
    
    return res.json({
      success: true,
      message: '生产环境模板清理完成',
      before: templateStatus,
      after: {
        disabledCount: disableResult.rowCount,
        activatedCount: activateResult.rowCount,
        finalValidCount: finalValidTemplates.rows.length,
        validTemplates: finalValidTemplates.rows
      },
      randomSelectionTests: testResults,
      readyForProduction: allTestsValid && finalValidTemplates.rows.length >= 4,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 清理生产环境模板失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
