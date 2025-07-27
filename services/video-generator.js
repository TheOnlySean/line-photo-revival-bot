const axios = require('axios');
const lineConfig = require('../config/line-config');

class VideoGenerator {
  constructor(db, messageCallback = null) {
    this.db = db;
    this.messageCallback = messageCallback; // 回调函数，用于发送消息
    this.kieAiConfig = lineConfig.kieAi;
  }

  // 生成视频（主要方法）
  async generateVideo(lineUserId, imageUrl, videoRecordId, customPrompt = null) {
    try {
      console.log('🎬 开始生成视频:', videoRecordId);

      const videoRecord = await this.db.query(
        'SELECT * FROM videos WHERE id = $1',
        [videoRecordId]
      );

      if (!videoRecord.rows.length) {
        throw new Error('Video record not found');
      }

      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 更新状态为处理中
      await this.db.updateVideoStatus(taskId, 'processing');
      await this.db.query(
        'UPDATE videos SET task_id = $1, status = $2 WHERE id = $3',
        [taskId, 'processing', videoRecordId]
      );

      // 调用KIE.AI API
      const result = await this.callRunwayApi(imageUrl, customPrompt);

      if (result.success && result.taskId) {
        await this.db.query(
          'UPDATE videos SET task_id = $1 WHERE id = $2',
          [result.taskId, videoRecordId]
        );

        console.log('🚀 启动轮询任务状态检查:', result.taskId);
        this.pollVideoStatus(lineUserId, result.taskId, videoRecordId);
      } else if (result.success && result.videoUrl) {
        console.log('✅ 同步模式：直接返回视频URL');
        await this.handleVideoSuccess(lineUserId, videoRecordId, result);
      } else {
        console.error('❌ 任务提交失败:', result.error);
        await this.handleVideoFailure(lineUserId, videoRecordId, result.error || '视频生成失败');
      }

    } catch (error) {
      console.error('❌ 视频生成过程出错:', error);
      await this.handleVideoFailure(lineUserId, videoRecordId, '系统错误，请稍后再试');
    }
  }

  // 调用Runway API生成视频
  async callRunwayApi(imageUrl, customPrompt = null) {
    try {
      const prompt = customPrompt || 'natural breathing with gentle eye movement, warm lighting';

      const apiUrl = `${this.kieAiConfig.baseUrl}${this.kieAiConfig.generateEndpoint}`;
      
      const requestData = {
        prompt: prompt,
        duration: 5,              // 修复：只能是5或8，使用5秒
        model: 'runway-gen3',
        quality: '720p',          // 修复：添加必需的quality参数
        aspect_ratio: '1:1'       // 添加宽高比参数
      };
      
      // 只有當 imageUrl 不為 null 時才添加 image_url 參數
      if (imageUrl !== null) {
        requestData.image_url = imageUrl;
      }

      const response = await axios.post(apiUrl, requestData, {
        headers: {
          'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.status === 200 && response.data) {
        const result = response.data.data || response.data; // 處理嵌套data結構
        console.log('✅ Runway API响应成功');

        return {
          success: true,
          taskId: result.videoInfo?.taskId || result.task_id || result.taskId,
          videoUrl: result.video_url,
          thumbnailUrl: result.thumbnail_url,
          message: result.message
        };
      } else {
        console.error('❌ API响应异常:', response.status);
        return {
          success: false,
          error: `API响应异常: ${response.status}`
        };
      }

    } catch (error) {
      console.error('❌ 调用Runway API失败:', error.message);
      
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 400) {
          // 400错误通常是敏感内容或参数错误
          const errorMsg = errorData?.message || errorData?.error || '内容不符合生成要求，请尝试使用其他描述或图片';
          console.error('❌ 400错误 - 敏感内容或参数错误:', errorMsg);
          return {
            success: false,
            error: errorMsg,
            isContentError: true // 标记为内容错误
          };
        } else if (status === 401) {
          return {
            success: false,
            error: 'API认证失败，请联系客服'
          };
        } else if (status === 429) {
          return {
            success: false,
            error: 'API调用频率过高，请稍后再试'
          };
        } else {
          return {
            success: false,
            error: `API错误: ${status} - ${errorData?.message || errorData?.error || error.message}`
          };
        }
      } else if (error.request) {
        return {
          success: false,
          error: '网络连接失败，请检查网络'
        };
      } else {
        return {
          success: false,
          error: '视频生成服务暂时不可用'
        };
      }
    }
  }

  // 轮询任务状态
  async pollVideoStatus(lineUserId, taskId, videoRecordId) {
    console.log('🔄 开始轮询任务状态:', taskId);
    
    const maxAttempts = 30;
    const pollInterval = 10000;
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        const status = await this.checkTaskStatus(taskId);

        if (status.state === 'success') {
          console.log('✅ 视频生成成功');
          await this.handleVideoSuccess(lineUserId, videoRecordId, status);
          return;
        } else if (status.state === 'failed' || status.state === 'error') {
          console.log('❌ 视频生成失败:', status.message);
          await this.handleVideoFailure(lineUserId, videoRecordId, status.message || '视频生成失败');
          return;
        } else if (status.state === 'processing' || status.state === 'pending') {
          if (attempts >= maxAttempts) {
            console.log('⏰ 轮询超时');
            await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成超时，请稍后再试');
            return;
          }

          setTimeout(poll, pollInterval);
        } else {
          console.log('⚠️ 未知状态:', status.state);
          setTimeout(poll, pollInterval);
        }

      } catch (error) {
        console.error('❌ 轮询过程出错:', error.message);
        
        if (attempts >= maxAttempts) {
          await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成状态检查失败');
        } else {
          setTimeout(poll, pollInterval);
        }
      }
    };

    setTimeout(poll, pollInterval);
  }

  // 检查任务状态
  async checkTaskStatus(taskId) {
    try {
      const apiUrl = `${this.kieAiConfig.baseUrl}${this.kieAiConfig.detailEndpoint}?taskId=${taskId}`;

      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data) {
        const result = response.data.data || response.data; // 處理嵌套data結構
        return {
          state: result.state || result.status,
          videoUrl: result.videoInfo?.videoUrl || result.video_url,
          thumbnailUrl: result.videoInfo?.imageUrl || result.thumbnail_url,
          message: result.message,
          progress: result.progress
        };
      } else {
        throw new Error(`状态查询失败: ${response.status}`);
      }

    } catch (error) {
      console.error('❌ 查询任务状态失败:', error.message);
      
      // 如果是400错误，说明任务ID无效或任务已失败
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        const errorMsg = errorData?.message || errorData?.error || '任务查询失败，可能是内容不符合要求';
        return {
          state: 'failed',
          message: errorMsg,
          isContentError: true
        };
      }
      
      throw error;
    }
  }

  // 处理视频生成成功
  async handleVideoSuccess(lineUserId, videoRecordId, result) {
    try {
      // 防重複處理
      const currentRecord = await this.db.query(
        'SELECT status FROM videos WHERE id = $1',
        [videoRecordId]
      );
      
      const isAlreadyCompleted = currentRecord.rows.length > 0 && currentRecord.rows[0].status === 'completed';
       
      if (!isAlreadyCompleted) {
        // 更新数据库记录
        await this.db.query(
          `UPDATE videos 
           SET status = $1, video_url = $2, generated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          ['completed', result.videoUrl, videoRecordId]
        );
        console.log('✅ 数据库记录已更新为完成状态');
      } else {
        console.log('⚠️ 視頻已處理完成，但仍發送通知:', videoRecordId);
      }

      // 通过回调函数发送视频完成通知
      if (this.messageCallback) {
        try {
          await this.messageCallback('video_completed', {
            lineUserId,
            videoRecordId,
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
            message: result.message
          });
          console.log('✅ 视频完成通知发送成功');
        } catch (callbackError) {
          console.error('❌ 视频完成通知发送失败:', callbackError.message);
        }
      } else {
        console.log('⚠️ 没有设置消息回调，跳过通知发送');
      }

    } catch (error) {
      console.error('❌ 处理视频成功时出错:', error);
    }
  }

  // 处理视频生成失败
  async handleVideoFailure(lineUserId, videoRecordId, errorMessage) {
    try {
      console.log('❌ 处理视频生成失败:', errorMessage);
      console.log('🔍 videoRecordId:', videoRecordId);

      // 获取视频记录以恢复用户配额
      const videoRecord = await this.db.query(
        'SELECT user_id FROM videos WHERE id = $1',
        [videoRecordId]
      );

      console.log('📋 视频记录查询结果:', videoRecord.rows);

      // 更新数据库状态为失败
      await this.db.query(
        'UPDATE videos SET status = $1 WHERE id = $2',
        ['failed', videoRecordId]
      );
      console.log('✅ 视频状态已更新为失败');

      // 恢复用户配额
      if (videoRecord.rows.length > 0) {
        const userId = videoRecord.rows[0].user_id;
        console.log(`💰 开始恢复用户 ${userId} 的配额...`);
        
        try {
          // 先查询当前配额状态
          const quotaBefore = await this.db.checkVideoQuota(userId);
          console.log('📊 恢复前配额状态:', quotaBefore);
          
          // 恢复配额
          const restoreResult = await this.db.restoreVideoQuota(userId);
          console.log('🔄 配额恢复操作结果:', restoreResult);
          
          // 再次查询确认配额已恢复
          const quotaAfter = await this.db.checkVideoQuota(userId);
          console.log('📊 恢复后配额状态:', quotaAfter);
          
          console.log(`✅ 已成功恢复用户 ${userId} 的视频配额`);
        } catch (quotaError) {
          console.error('❌ 恢复配额失败:', quotaError);
          // 即使配额恢复失败，也要继续发送通知
        }
      } else {
        console.error('❌ 未找到视频记录，无法恢复配额');
      }

      // 通过回调函数发送失败通知
      if (this.messageCallback) {
        try {
          await this.messageCallback('video_failed', {
            lineUserId,
            videoRecordId,
            errorMessage,
            quotaRestored: true // 标记配额已恢复
          });
          console.log('✅ 视频失败通知发送成功');
        } catch (callbackError) {
          console.error('❌ 视频失败通知发送失败:', callbackError.message);
        }
      } else {
        console.log('⚠️ 没有设置消息回调，跳过失败通知发送');
      }

    } catch (error) {
      console.error('❌ 处理视频失败时出错:', error);
      // 即使处理失败，也要尝试发送通知
      if (this.messageCallback) {
        try {
          await this.messageCallback('video_failed', {
            lineUserId,
            videoRecordId,
            errorMessage: '系统处理错误，请联系客服',
            quotaRestored: false // 标记配额恢复状态不确定
          });
        } catch (notifyError) {
          console.error('❌ 发送错误通知失败:', notifyError);
        }
      }
    }
  }



  // 检查用户的待处理任务
  async checkPendingTasks(lineUserId) {
    try {
      console.log('🔍 检查用户待完成任务:', lineUserId);

      const pendingTasks = await this.db.getUserPendingTasks(lineUserId);

      if (pendingTasks.length === 0) {
        console.log('✅ 用户没有待处理任务');
        return;
      }

      for (const task of pendingTasks) {
        try {
          if (task.task_id) {
            const status = await this.checkTaskStatus(task.task_id);
            
            if (status.state === 'success') {
              console.log('✅ 发现已完成的任务:', task.task_id);
              await this.handleVideoSuccess(lineUserId, task.id, status);
            } else if (status.state === 'failed' || status.state === 'error') {
              console.log('❌ 发现失败的任务:', task.task_id);
              await this.handleVideoFailure(lineUserId, task.id, status.message);
            }
          }
        } catch (taskError) {
          console.error('❌ 检查单个任务失败:', taskError.message);
        }
      }

    } catch (error) {
      console.error('❌ 检查用户待处理任务失败:', error);
      throw error;
    }
  }
}

module.exports = VideoGenerator; 