import db from '../../config/database.js';

export default async function handler(req, res) {
  try {
    console.log('🔍 检查海报模板数据...');

    // 获取所有模板
    const templates = await db.query(`
      SELECT 
        id,
        template_name,
        style_category,
        template_url,
        is_active,
        created_at,
        updated_at
      FROM poster_templates 
      ORDER BY template_name
    `);

    console.log(`📊 找到 ${templates.rows.length} 个模板`);

    // 特别检查 vintage_magazine_01
    const vintage01 = templates.rows.find(t => t.template_name === 'vintage_magazine_01');

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      allTemplates: templates.rows,
      vintage01Template: vintage01 ? {
        name: vintage01.template_name,
        category: vintage01.style_category,
        url: vintage01.template_url,
        isActive: vintage01.is_active,
        urlValid: vintage01.template_url && vintage01.template_url.startsWith('http')
      } : null,
      summary: {
        totalTemplates: templates.rows.length,
        activeTemplates: templates.rows.filter(t => t.is_active).length,
        hasValidUrls: templates.rows.filter(t => t.template_url && t.template_url.startsWith('http')).length
      }
    };

    console.log('✅ 模板检查完成');
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ 检查模板失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
