// 获取环境特定的LINE账号配置
function getEnvironmentLineChannelId() {
  // 在Vercel中使用VERCEL_ENV，其他环境使用NODE_ENV
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  
  if (environment === 'production') {
    return {
      basicId: '@824unncx',  // 生产环境Basic ID
      channelId: process.env.LINE_CHANNEL_ID_PROD || process.env.LINE_CHANNEL_ID || '2006877928'
    };
  } else {
    return {
      basicId: '@055jelum',  // 开发环境Basic ID
      channelId: process.env.LINE_CHANNEL_ID_DEV || '2005541661'
    };
  }
}

// LINE Bot 配置
const lineConfig = {
  // 测试账号配置 - 优先使用环境变量
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'e9bd551af7f1c36500d0764a3edb6562',
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '7uB4UmaonelwPyjgnngdA0OQRCugGweLYP5jLYRhkCUh6C4HS8ugK7DbyxyDDgQxo0PK9+GljmxVPW3EHv+QPsrzToEmrz12ERPNEimHmV6rIIwNWj6Qpo8yep6NyMmWyYfLtAbvvdvBMnU2EjpmZQdB04t89/1O/w1cDnyilFU=',
  channelId: process.env.LINE_CHANNEL_ID || '2005541661',
  
  // 环境特定配置
  ...getEnvironmentLineChannelId(),
  
  // 服务器配置
  port: process.env.PORT || 3000,
  webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook',
  
  // 应用配置
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  
  // Vercel Blob配置 (复用映像工房)
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod',
  
  // KIE.AI Runway API配置 (高性价比AI视频生成)
  kieAi: {
    apiKey: process.env.KIE_AI_API_KEY || '77b10ad6945bf20dc236bad15de1e6b3',
    baseUrl: 'https://api.kie.ai',
    // 正确的API端点路径
    generateEndpoint: '/api/v1/runway/generate',
    detailEndpoint: '/api/v1/runway/record-detail',
    // Runway API支持的参数
    defaultParams: {
      aspectRatio: '1:1', // 方形视频，适合社交媒体
      duration: 5, // 5秒视频，成本较低
      quality: '720p', // 720p质量，平衡质量和成本
      waterMark: '' // 无水印
    }
  },
  
  // 点数消耗配置
  credits: {
    demoConsumption: 0,  // 演示不消耗点数
    realVideoConsumption: 1  // 真实视频生成消耗1点数
  }
};

module.exports = lineConfig; 