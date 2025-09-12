/**
 * 生产环境错误诊断脚本
 * 检查海报生成功能在生产环境的问题
 */

const db = require('../config/database');

async function diagnoseProductionError() {
  console.log('🔍 诊断生产环境海报功能错误...\n');
  
  try {
    // 1. 检查数据库连接
    console.log('1️⃣ 检查数据库连接...');
    const dbTest = await db.query('SELECT NOW() as current_time');
    console.log('✅ 数据库连接正常:', dbTest.rows[0].current_time);

    // 2. 检查海报配额字段是否存在
    console.log('\n2️⃣ 检查海报配额字段...');
    const posterFields = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name IN ('monthly_poster_quota', 'posters_used_this_month')
    `);
    
    console.log(`📊 找到海报配额字段: ${posterFields.rows.length}/2`);
    posterFields.rows.forEach(field => {
      console.log(`   ✅ ${field.column_name}`);
    });
    
    if (posterFields.rows.length < 2) {
      console.log('❌ 海报配额字段缺失！需要运行迁移脚本');
      return { error: 'missing_poster_quota_fields' };
    }

    // 3. 检查海报模板表是否存在
    console.log('\n3️⃣ 检查海报模板表...');
    const templateTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'poster_templates'
      )
    `);
    
    if (templateTable.rows[0].exists) {
      console.log('✅ poster_templates表存在');
      
      const templateCount = await db.query('SELECT COUNT(*) FROM poster_templates WHERE is_active = true');
      console.log(`📊 活跃模板数量: ${templateCount.rows[0].count}`);
      
      if (parseInt(templateCount.rows[0].count) === 0) {
        console.log('⚠️ 没有活跃的海报模板');
        return { error: 'no_active_templates' };
      }
    } else {
      console.log('❌ poster_templates表不存在！');
      return { error: 'missing_poster_templates_table' };
    }

    // 4. 检查配额管理函数
    console.log('\n4️⃣ 检查配额管理函数...');
    try {
      // 测试配额函数是否可用
      if (typeof db.checkPosterQuota === 'function') {
        console.log('✅ checkPosterQuota函数存在');
      } else {
        console.log('❌ checkPosterQuota函数不存在');
        return { error: 'missing_quota_functions' };
      }
      
      // 找一个测试用户
      const testUser = await db.query(`
        SELECT user_id FROM subscriptions 
        WHERE status = 'active' 
        LIMIT 1
      `);
      
      if (testUser.rows.length > 0) {
        const userId = testUser.rows[0].user_id;
        console.log(`🧪 测试用户ID: ${userId}`);
        
        const quotaResult = await db.checkPosterQuota(userId);
        console.log('✅ 配额检查函数正常工作');
        console.log(`📊 配额状态:`, {
          hasQuota: quotaResult.hasQuota,
          remaining: quotaResult.remaining,
          isUnlimited: quotaResult.isUnlimited
        });
      }
    } catch (funcError) {
      console.log('❌ 配额函数测试失败:', funcError.message);
      return { error: 'quota_function_error', details: funcError.message };
    }

    // 5. 检查服务类是否可用
    console.log('\n5️⃣ 检查服务类...');
    try {
      const PosterGenerator = require('../services/poster-generator');
      const PosterImageService = require('../services/poster-image-service');
      
      console.log('✅ PosterGenerator类可加载');
      console.log('✅ PosterImageService类可加载');
      
      // 测试初始化
      const posterImageService = new PosterImageService();
      const posterGenerator = new PosterGenerator(db, posterImageService);
      
      console.log('✅ 服务类初始化成功');
      
      const status = posterGenerator.getStatus();
      console.log('📊 PosterGenerator状态:', status);
      
    } catch (serviceError) {
      console.log('❌ 服务类加载失败:', serviceError.message);
      return { error: 'service_loading_error', details: serviceError.message };
    }

    // 6. 检查环境变量
    console.log('\n6️⃣ 检查关键环境变量...');
    const envVars = {
      'KIE_AI_API_KEY': process.env.KIE_AI_API_KEY ? '已设置' : '未设置',
      'BLOB_READ_WRITE_TOKEN': process.env.BLOB_READ_WRITE_TOKEN ? '已设置' : '未设置',
      'NODE_ENV': process.env.NODE_ENV || '未设置',
      'VERCEL_ENV': process.env.VERCEL_ENV || '未设置'
    };
    
    Object.entries(envVars).forEach(([key, value]) => {
      const status = value === '已设置' ? '✅' : '❌';
      console.log(`${status} ${key}: ${value}`);
    });

    console.log('\n🎉 诊断完成！系统基础功能正常');
    return { success: true };

  } catch (error) {
    console.error('❌ 诊断过程中出错:', error.message);
    return { error: 'diagnosis_error', details: error.message };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  diagnoseProductionError()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ 诊断完成，系统基础功能正常');
        console.log('💡 如果仍有错误，可能需要检查具体的用户配额或请求参数');
      } else {
        console.log('\n❌ 发现问题:', result.error);
        if (result.details) {
          console.log('详细信息:', result.details);
        }
        
        console.log('\n🔧 建议修复措施:');
        switch (result.error) {
          case 'missing_poster_quota_fields':
            console.log('• 运行: node scripts/add-poster-quota-fields.js');
            break;
          case 'missing_poster_templates_table':
            console.log('• 运行: node scripts/create-poster-templates-table.js');
            break;
          case 'no_active_templates':
            console.log('• 运行: node scripts/upload-poster-templates.js');
            break;
          case 'service_loading_error':
            console.log('• 检查依赖包是否完整部署');
            console.log('• 验证require路径是否正确');
            break;
          default:
            console.log('• 检查错误详情并相应修复');
        }
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 诊断脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = diagnoseProductionError;
