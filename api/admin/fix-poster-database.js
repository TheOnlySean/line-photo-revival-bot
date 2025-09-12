/**
 * 生产环境海报功能数据库修复API
 * 确保生产环境数据库有所需的字段和表
 */

const db = require('../../config/database');

export default async function handler(req, res) {
  // 只允许POST请求和管理密钥
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== 'fix-poster-database-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔧 开始修复生产环境海报数据库...');
    
    const results = {};
    
    // 1. 检查并添加海报配额字段
    console.log('1️⃣ 检查海报配额字段...');
    
    const posterFields = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name IN ('monthly_poster_quota', 'posters_used_this_month')
    `);
    
    if (posterFields.rows.length < 2) {
      console.log('🔧 添加海报配额字段...');
      
      await db.query(`
        ALTER TABLE subscriptions 
        ADD COLUMN IF NOT EXISTS monthly_poster_quota INTEGER DEFAULT 0
      `);
      
      await db.query(`
        ALTER TABLE subscriptions 
        ADD COLUMN IF NOT EXISTS posters_used_this_month INTEGER DEFAULT 0
      `);
      
      // 为现有订阅初始化海报配额
      const updateResult = await db.query(`
        UPDATE subscriptions 
        SET monthly_poster_quota = CASE 
          WHEN plan_type = 'trial' THEN 8
          WHEN plan_type = 'standard' THEN -1
          ELSE 0
        END,
        posters_used_this_month = 0
        WHERE status = 'active' 
        AND (monthly_poster_quota IS NULL OR monthly_poster_quota = 0)
      `);
      
      results.posterFields = {
        action: 'created',
        updatedSubscriptions: updateResult.rowCount
      };
      console.log(`✅ 海报配额字段已添加，更新了 ${updateResult.rowCount} 个订阅`);
    } else {
      results.posterFields = { action: 'exists', count: posterFields.rows.length };
      console.log('✅ 海报配额字段已存在');
    }

    // 2. 检查并创建海报模板表
    console.log('2️⃣ 检查海报模板表...');
    
    const templateTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'poster_templates'
      )
    `);
    
    if (!templateTable.rows[0].exists) {
      console.log('🔧 创建海报模板表...');
      
      await db.query(`
        CREATE TABLE poster_templates (
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

      // 创建索引
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_poster_templates_active 
        ON poster_templates(is_active)
      `);
      
      // 插入初始模板
      const initialTemplates = [
        {
          name: 'vintage_magazine_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/vintage_magazine_01-8OCriw0O8bSodvw89WXy2TDKDy7580.jpg',
          description: '昭和时代经典杂志封面风格',
          category: 'vintage'
        },
        {
          name: 'retro_poster_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/retro_poster_01-ud7MN6VN9uDSoI21sjBlQHdOaTJPBs.jpg',
          description: '复古电影海报风格',
          category: 'retro'
        },
        {
          name: 'classic_photo_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/classic_photo_01-G9Maog6VYoSSUxtpLYJc95eiddnTV0.jpg',
          description: '经典人像摄影风格',
          category: 'classic'
        },
        {
          name: 'japanese_style_01',
          url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/poster-generation/templates/japanese_style_01-78rhL3kqbwyYGJdOT3y36So9EaGudx.jpg',
          description: '日式传统海报设计',
          category: 'japanese'
        }
      ];

      for (let i = 0; i < initialTemplates.length; i++) {
        const template = initialTemplates[i];
        await db.query(`
          INSERT INTO poster_templates (template_name, template_url, description, style_category, sort_order)
          VALUES ($1, $2, $3, $4, $5)
        `, [template.name, template.url, template.description, template.category, i + 1]);
      }
      
      results.templateTable = {
        action: 'created',
        templatesAdded: initialTemplates.length
      };
      console.log(`✅ 海报模板表已创建，添加了 ${initialTemplates.length} 个模板`);
    } else {
      const templateCount = await db.query('SELECT COUNT(*) FROM poster_templates WHERE is_active = true');
      results.templateTable = {
        action: 'exists',
        activeCount: parseInt(templateCount.rows[0].count)
      };
      console.log(`✅ 海报模板表已存在，活跃模板: ${templateCount.rows[0].count} 个`);
    }

    // 3. 测试完整功能
    console.log('3️⃣ 测试完整功能...');
    
    // 测试随机模板选择
    const randomTemplate = await db.getRandomPosterTemplate();
    if (randomTemplate) {
      console.log(`✅ 随机模板选择正常: ${randomTemplate.template_name}`);
      results.templateTest = { success: true, template: randomTemplate.template_name };
    } else {
      console.log('❌ 随机模板选择失败');
      results.templateTest = { success: false };
    }

    // 最终状态
    results.status = 'completed';
    results.timestamp = new Date().toISOString();
    
    console.log('🎉 生产环境数据库修复完成！');
    
    return res.status(200).json({
      success: true,
      message: '生产环境海报数据库修复完成',
      results: results
    });

  } catch (error) {
    console.error('❌ 修复生产环境数据库失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
