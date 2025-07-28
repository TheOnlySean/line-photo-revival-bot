/**
 * Webhook健康检查端点
 * 用于测试Webhook连通性
 */

export default function handler(req, res) {
  const timestamp = new Date().toISOString();
  
  console.log(`🔍 Webhook健康检查 - ${req.method} 请求于 ${timestamp}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'healthy',
      service: 'LINE Bot Webhook',
      timestamp: timestamp,
      environment: process.env.NODE_ENV || 'development',
      message: 'Webhook端点正常运行'
    });
  }
  
  if (req.method === 'POST') {
    console.log('POST Body:', JSON.stringify(req.body, null, 2));
    
    return res.status(200).json({
      status: 'received',
      timestamp: timestamp,
      received_data: req.body,
      message: 'POST请求已收到'
    });
  }
  
  return res.status(405).json({
    error: 'Method not allowed',
    allowed_methods: ['GET', 'POST']
  });
} 