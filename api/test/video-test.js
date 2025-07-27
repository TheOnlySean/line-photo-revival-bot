const LineAdapter = require('../../adapters/line-adapter');

module.exports = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const lineAdapter = new LineAdapter();
    
    // 测试发送这个具体的视频文件
    const videoMessage = {
      type: 'video',
      originalContentUrl: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/2-YqQn4tn1AMrHbOPFJEKsrmxGlKmRxa.mp4',
      previewImageUrl: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/2-lwqPaIWZj0imE9WuqhFsbH8t6TpgZW.png'
    };

    console.log('🧪 测试发送视频:', videoMessage);
    
    await lineAdapter.pushMessage(userId, videoMessage);
    
    res.status(200).json({ 
      success: true, 
      message: '视频发送成功',
      videoUrl: videoMessage.originalContentUrl,
      previewUrl: videoMessage.previewImageUrl
    });
    
  } catch (error) {
    console.error('❌ 视频测试失败:', error);
    res.status(500).json({ 
      error: error.message,
      statusCode: error.statusCode || 500
    });
  }
}; 