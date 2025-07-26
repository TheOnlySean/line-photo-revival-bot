const VideoGenerator = require('../services/video-generator');
const VideoNotificationHandler = require('./video-notification-handler');

/**
 * 视频生成业务服务 - 纯业务逻辑，不依赖LINE API
 * 职责：视频生成流程管理、状态追踪、任务调度
 */
class VideoService {
  constructor(database) {
    this.db = database;
    
    // 创建视频通知处理器
    this.notificationHandler = new VideoNotificationHandler();
    
    // 创建VideoGenerator，传入回调函数
    this.videoGenerator = new VideoGenerator(
      database, 
      this.notificationHandler.handleVideoCallback.bind(this.notificationHandler)
    );
  }

  /**
   * 检查用户是否有视频生成配额
   */
  async checkVideoQuota(userId) {
    try {
      return await this.db.checkVideoQuota(userId);
    } catch (error) {
      console.error('❌ 检查视频配额失败:', error);
      throw error;
    }
  }

  /**
   * 创建视频生成任务
   */
  async createVideoTask(userId, taskData) {
    try {
      const { imageUrl, prompt, subscriptionId } = taskData;
      
      // 创建视频记录
      const videoRecord = await this.db.createVideoRecord(userId, {
        subscriptionId,
        taskId: null,
        promptText: prompt,
        imageUrl: imageUrl,
        status: 'pending'
      });

      return {
        success: true,
        videoRecordId: videoRecord.id,
        message: '视频任务创建成功'
      };
    } catch (error) {
      console.error('❌ 创建视频任务失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 开始视频生成
   */
  async startVideoGeneration(videoRecordId, lineUserId, imageUrl, prompt) {
    try {
      // 使用视频配额
      const videoRecord = await this.db.query(
        'SELECT user_id FROM videos WHERE id = $1',
        [videoRecordId]
      );
      
      if (!videoRecord.rows.length) {
        throw new Error('视频记录不存在');
      }

      await this.db.useVideoQuota(videoRecord.rows[0].user_id);

      // 启动异步视频生成
      await this.videoGenerator.generateVideo(lineUserId, imageUrl, videoRecordId, prompt);

      return {
        success: true,
        message: '视频生成已启动'
      };
    } catch (error) {
      console.error('❌ 启动视频生成失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 生成演示视频
   */
  async generateDemoVideo(demoPhotoId) {
    try {
      const { trialPhotos } = require('../config/demo-trial-photos');
      const selectedPhoto = trialPhotos.find(photo => photo.id === demoPhotoId);
      
      if (!selectedPhoto) {
        return {
          success: false,
          error: '演示照片不存在'
        };
      }

      // 模拟等待时间
      await new Promise(resolve => setTimeout(resolve, 15000));

      return {
        success: true,
        videoUrl: selectedPhoto.demo_video_url,
        thumbnailUrl: selectedPhoto.image_url,
        message: '演示视频生成完成'
      };
    } catch (error) {
      console.error('❌ 生成演示视频失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 检查待处理的视频任务
   */
  async checkPendingVideoTasks(lineUserId) {
    try {
      return await this.videoGenerator.checkPendingTasks(lineUserId);
    } catch (error) {
      console.error('❌ 检查待处理任务失败:', error);
      throw error;
    }
  }

  /**
   * 获取预设的视频提示词
   */
  getPresetPrompts() {
    return {
      wave: '自然な手振りとほほ笑み、温かい雰囲気で',
      group: '優しく寄り添うような動き、温かい表情で',
      gentle: 'gentle breathing with soft eye movement, natural lighting',
      warm: 'warm family gathering with gentle smiles and natural movement'
    };
  }

  /**
   * 生成随机提示词
   */
  generateRandomPrompt() {
    const prompts = [
      '自然な微笑みと温かい表情で',
      'ゆっくりと手を振る優しい動作',
      '懐かしい雰囲気の中で穏やかに',
      '映画のようなドラマチックな効果で',
      '夕日に照らされた温かい場面',
      '春の桜と共に優しく微笑んで'
    ];
    
    const randomIndex = Math.floor(Math.random() * prompts.length);
    return prompts[randomIndex];
  }

  /**
   * 验证视频生成参数
   */
  validateVideoParams(imageUrl, prompt) {
    const errors = [];

    if (!imageUrl || typeof imageUrl !== 'string') {
      errors.push('图片URL无效');
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      errors.push('提示词不能为空');
    }

    if (prompt && prompt.length > 500) {
      errors.push('提示词长度不能超过500字符');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取视频生成统计
   */
  async getVideoStats(userId) {
    try {
      const stats = await this.db.query(`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_videos,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_videos,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_videos
        FROM videos 
        WHERE user_id = $1
      `, [userId]);

      return stats.rows[0];
    } catch (error) {
      console.error('❌ 获取视频统计失败:', error);
      throw error;
    }
  }
}

module.exports = VideoService; 