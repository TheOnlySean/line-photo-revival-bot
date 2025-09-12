/**
 * 检查生产环境变量API
 * 验证关键环境变量是否正确配置
 */

export default async function handler(req, res) {
  try {
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      
      // 检查关键API Keys（只显示前几位用于验证）
      KIE_AI_API_KEY: {
        configured: !!process.env.KIE_AI_API_KEY,
        preview: process.env.KIE_AI_API_KEY ? 
          process.env.KIE_AI_API_KEY.substring(0, 8) + '...' : 
          'NOT SET'
      },
      
      BLOB_READ_WRITE_TOKEN: {
        configured: !!process.env.BLOB_READ_WRITE_TOKEN,
        preview: process.env.BLOB_READ_WRITE_TOKEN ? 
          process.env.BLOB_READ_WRITE_TOKEN.substring(0, 12) + '...' : 
          'NOT SET'
      },
      
      // LINE配置
      LINE_CHANNEL_ACCESS_TOKEN: {
        configured: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        preview: process.env.LINE_CHANNEL_ACCESS_TOKEN ? 
          process.env.LINE_CHANNEL_ACCESS_TOKEN.substring(0, 12) + '...' : 
          'NOT SET'
      },
      
      LINE_CHANNEL_ACCESS_TOKEN_PROD: {
        configured: !!process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD,
        preview: process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD ? 
          process.env.LINE_CHANNEL_ACCESS_TOKEN_PROD.substring(0, 12) + '...' : 
          'NOT SET'
      }
    };

    // 分析配置问题
    const issues = [];
    
    if (!envCheck.KIE_AI_API_KEY.configured) {
      issues.push('KIE_AI_API_KEY未配置 - 海报生成无法工作');
    }
    
    if (!envCheck.BLOB_READ_WRITE_TOKEN.configured) {
      issues.push('BLOB_READ_WRITE_TOKEN未配置 - 图片存储无法工作');
    }
    
    if (!envCheck.LINE_CHANNEL_ACCESS_TOKEN.configured && !envCheck.LINE_CHANNEL_ACCESS_TOKEN_PROD.configured) {
      issues.push('LINE Token未配置 - 消息发送无法工作');
    }

    console.log('📊 环境变量检查完成');
    console.log('❌ 发现问题:', issues.length);
    issues.forEach(issue => console.log(`   - ${issue}`));

    return res.json({
      success: issues.length === 0,
      environment: envCheck,
      issues: issues,
      critical: issues.some(issue => issue.includes('KIE_AI_API_KEY')),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 检查环境变量失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
