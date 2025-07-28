const LineAdapter = require('../adapters/line-adapter');
const MessageTemplates = require('../utils/message-templates');

/**
 * 视频通知处理器 - 处理VideoGenerator的回调通知
 * 职责：接收视频生成结果，发送相应的LINE消息和Rich Menu切换
 */
class VideoNotificationHandler {
  constructor() {
    this.lineAdapter = new LineAdapter();
  }

  /**
   * 处理视频相关通知的回调函数
   */
  async handleVideoCallback(eventType, data) {
    try {
      console.log(`📺 处理视频通知: ${eventType}`, data);

      switch (eventType) {
        case 'video_completed':
          return await this.handleVideoCompleted(data);
        case 'video_failed':
          return await this.handleVideoFailed(data);
        default:
          console.warn(`⚠️ 未知的视频通知类型: ${eventType}`);
          return { success: false, error: 'Unknown event type' };
      }
    } catch (error) {
      console.error('❌ 处理视频通知失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理视频生成完成
   */
  async handleVideoCompleted(data) {
    try {
      const { lineUserId, videoUrl, thumbnailUrl } = data;

      // 发送视频完成消息
      const completedMessages = MessageTemplates.createVideoStatusMessages('completed', {
        videoUrl,
        thumbnailUrl
      });

      await this.lineAdapter.pushMessage(lineUserId, completedMessages);

      // 切换回主菜单
      await this.lineAdapter.switchToMainMenu(lineUserId);

      console.log('✅ 视频完成通知发送成功');
      return { success: true };
    } catch (error) {
      console.error('❌ 处理视频完成通知失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理视频生成失败
   */
  async handleVideoFailed(data) {
    try {
      const { lineUserId, errorMessage, quotaRestored } = data;

      // 创建包含配额信息的失败消息
      let failedText = '❌ 申し訳ございません。動画生成に失敗しました。\n\n';
      
      // 添加具体错误信息（如果有的话）
      if (errorMessage && errorMessage !== '動画生成に失敗しました' && errorMessage !== 'システムエラーが発生しました') {
        failedText += `詳細: ${errorMessage}\n\n`;
      }
      
      // 重要：添加配额未扣除的提示
      if (quotaRestored) {
        failedText += '✅ ご安心ください。今回の生成で利用枠は消費されておりません。\n\n';
      }
      
      failedText += '🔄 しばらくしてから再度お試しいただくか、別の写真でお試しください。';

      const failedMessage = {
        type: 'text',
        text: failedText
      };

      await this.lineAdapter.pushMessage(lineUserId, failedMessage);

      // 切换回主菜单
      await this.lineAdapter.switchToMainMenu(lineUserId);

      console.log('✅ 视频失败通知发送成功');
      return { success: true };
    } catch (error) {
      console.error('❌ 处理视频失败通知失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = VideoNotificationHandler; 