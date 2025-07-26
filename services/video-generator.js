const axios = require('axios');
const lineConfig = require('../config/line-config');

class VideoGenerator {
  constructor(db, lineBot = null) {
    this.db = db;
    this.lineBot = lineBot;
    this.kieAiConfig = lineConfig.kieAi;
  }

  // 生成视频（主要方法）- 支持自定义prompt
  async generateVideo(lineUserId, imageUrl, videoRecordId, customPrompt = null) {
    try {
      console.log('🎬 开始生成视频:', { lineUserId, videoRecordId, hasCustomPrompt: !!customPrompt });

      // 通过videoRecordId获取视频记录
      const videoRecord = await this.db.query(
        'SELECT * FROM videos WHERE id = $1',
        [videoRecordId]
      );

      if (!videoRecord.rows.length) {
        throw new Error('Video record not found');
      }

      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 更新状态为处理中并保存taskId
      await this.db.updateVideoStatus(taskId, 'processing');
      await this.db.query(
        'UPDATE videos SET task_id = $1, status = $2 WHERE id = $3',
        [taskId, 'processing', videoRecordId]
      );

      // 调用KIE.AI Runway API生成视频（传递自定义prompt）
      const result = await this.callRunwayApi(imageUrl, customPrompt);

      if (result.success && result.taskId) {
        // 更新真实的taskId
        await this.db.query(
          'UPDATE videos SET task_id = $1 WHERE id = $2',
          [result.taskId, videoRecordId]
        );

        console.log('🚀 启动轮询任务状态检查:', result.taskId);
        // 开始轮询任务状态
        this.pollVideoStatus(lineUserId, result.taskId, videoRecordId);
      } else if (result.success && result.videoUrl) {
        // 直接返回了视频URL（同步模式）
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
      // 如果没有提供自定义prompt，使用默认的
      const prompt = customPrompt || 'natural breathing with gentle eye movement, warm lighting';

      console.log('📡 调用Runway API:', { imageUrl, prompt });

      const apiUrl = `${this.kieAiConfig.baseUrl}/api/v1/video/runway/gen`;
      
      const requestData = {
        image_url: imageUrl,
        prompt: prompt,
        duration: 10, // 10秒视频
        model: 'runway-gen3'
      };

      console.log('📤 API请求数据:', requestData);

      const response = await axios.post(apiUrl, requestData, {
        headers: {
          'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log('📡 API响应状态:', response.status);

      if (response.status === 200 && response.data) {
        const result = response.data;
        console.log('✅ Runway API响应成功:', result);

        return {
          success: true,
          taskId: result.task_id || result.taskId,
          videoUrl: result.video_url,
          thumbnailUrl: result.thumbnail_url,
          message: result.message
        };
      } else {
        console.error('❌ API响应异常:', response.status, response.data);
        return {
          success: false,
          error: `API响应异常: ${response.status}`
        };
      }

    } catch (error) {
      console.error('❌ 调用Runway API失败:', error.message);
      
      if (error.response) {
        console.error('❌ API错误响应:', error.response.status, error.response.data);
        return {
          success: false,
          error: `API错误: ${error.response.status} - ${error.response.data?.message || error.message}`
        };
      } else if (error.request) {
        console.error('❌ 网络请求失败');
        return {
          success: false,
          error: '网络连接失败，请检查网络'
        };
      } else {
        console.error('❌ 其他错误:', error.message);
        return {
          success: false,
          error: '视频生成服务暂时不可用'
        };
      }
    }
  }

  // 轮询任务状态
  async pollVideoStatus(lineUserId, taskId, videoRecordId) {
    console.log('🔄 开始轮询任务状态:', { taskId, videoRecordId });
    
    const maxAttempts = 30; // 最多轮询30次
    const pollInterval = 10000; // 每10秒轮询一次
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔍 轮询第 ${attempts} 次 - TaskID: ${taskId}`);

        // 调用状态查询API
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
          console.log(`⏳ 视频正在生成中... (${attempts}/${maxAttempts})`);
          
          if (attempts >= maxAttempts) {
            console.log('⏰ 轮询超时');
            await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成超时，请稍后再试');
            return;
          }

          // 继续轮询
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

    // 开始轮询
    setTimeout(poll, pollInterval);
  }

  // 检查任务状态
  async checkTaskStatus(taskId) {
    try {
      const apiUrl = `${this.kieAiConfig.baseUrl}/api/v1/video/runway/status/${taskId}`;
      
      console.log('📡 查询任务状态:', apiUrl);

      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      console.log('📡 状态API响应:', response.status, response.data);

      if (response.status === 200 && response.data) {
        return {
          state: response.data.state || response.data.status,
          videoUrl: response.data.video_url,
          thumbnailUrl: response.data.thumbnail_url,
          message: response.data.message,
          progress: response.data.progress
        };
      } else {
        throw new Error(`状态查询失败: ${response.status}`);
      }

    } catch (error) {
      console.error('❌ 查询任务状态失败:', error.message);
      throw error;
    }
  }

  // 处理视频生成成功
  async handleVideoSuccess(lineUserId, videoRecordId, result) {
    try {
      // 防重複處理：先檢查當前狀態
      const currentRecord = await this.db.query(
        'SELECT status FROM videos WHERE id = $1',
        [videoRecordId]
      );
      
      if (currentRecord.rows.length > 0 && currentRecord.rows[0].status === 'completed') {
        console.log('⚠️ 視頻已處理完成，跳過重複處理:', videoRecordId);
        return;
      }
      
      // 更新数据库记录
      await this.db.query(
        `UPDATE videos 
         SET status = $1, video_url = $2, generated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        ['completed', result.videoUrl, videoRecordId]
      );
      console.log('✅ 数据库记录已更新为完成状态');

      // 发送视频给用户
      try {
        await this.sendVideoToUser(lineUserId, result);
        console.log('✅ 视频发送成功');
      } catch (sendError) {
        console.error('❌ 视频发送失败:', sendError.message);
        
        // 检查是否因为用户取消关注导致的发送失败
        if (sendError.message.includes('User not found') || 
            sendError.message.includes('Invalid user') ||
            sendError.response?.status === 400) {
          console.warn('⚠️ 用户已取消关注，视频已保存到数据库');
        }
      }
      
      // 切换回主要Rich Menu
      if (this.lineBot) {
        try {
          await this.lineBot.switchToMainMenu(lineUserId);
          console.log('✅ 已切换回主要Rich Menu');
        } catch (menuError) {
          console.warn('⚠️ 切换菜单失败:', menuError.message);
        }
      }

      console.log('✅ 视频生成成功处理完成:', result.videoUrl);

    } catch (error) {
      console.error('❌ 处理视频成功时出错:', error);
    }
  }

  // 处理视频生成失败
  async handleVideoFailure(lineUserId, videoRecordId, errorMessage) {
    try {
      console.log('❌ 处理视频生成失败:', { videoRecordId, errorMessage });

      // 更新数据库状态为失败
      await this.db.query(
        'UPDATE videos SET status = $1 WHERE id = $2',
        ['failed', videoRecordId]
      );

      // 发送失败消息给用户
      if (this.lineBot) {
        try {
          await this.lineBot.client.pushMessage(lineUserId, {
            type: 'text',
            text: `❌ 申し訳ございません。動画生成に失敗しました。\n\n${errorMessage}\n\n再度お試しください。`
          });

          // 切换回主要Rich Menu
          await this.lineBot.switchToMainMenu(lineUserId);
          console.log('✅ 失败消息已发送，切换回主菜单');

        } catch (sendError) {
          console.error('❌ 发送失败消息出错:', sendError.message);
        }
      }

    } catch (error) {
      console.error('❌ 处理视频失败时出错:', error);
    }
  }

  // 发送视频给用户
  async sendVideoToUser(lineUserId, result) {
    try {
      console.log('📤 发送视频给用户:', lineUserId);

      if (!result.videoUrl) {
        throw new Error('视频URL不存在');
      }

      const messages = [
        {
          type: 'text',
          text: '🎉 **動画生成完了！**\n\nあなたの写真が美しい動画になりました：'
        },
        {
          type: 'video',
          originalContentUrl: result.videoUrl,
          previewImageUrl: result.thumbnailUrl || result.videoUrl
        },
        {
          type: 'text',
          text: '✨ いかがでしょうか？\n\n他の写真でも試してみたい場合は、下部メニューからどうぞ！'
        }
      ];

      if (this.lineBot) {
        await this.lineBot.client.pushMessage(lineUserId, messages);
      }

      console.log('✅ 视频发送完成');

    } catch (error) {
      console.error('❌ 发送视频失败:', error);
      throw error;
    }
  }

  // 检查用户的待处理任务
  async checkPendingTasks(lineUserId) {
    try {
      console.log('🔍 检查用户待完成任务:', lineUserId);

      // 获取用户的待处理任务
      const pendingTasks = await this.db.getUserPendingTasks(lineUserId);

      if (pendingTasks.length === 0) {
        console.log('✅ 用户没有待处理任务');
        return;
      }

      console.log(`📋 发现 ${pendingTasks.length} 个待处理任务`);

      for (const task of pendingTasks) {
        try {
          if (task.task_id) {
            console.log('🔄 检查任务状态:', task.task_id);
            
            // 查询任务状态
            const status = await this.checkTaskStatus(task.task_id);
            
            if (status.state === 'success') {
              console.log('✅ 发现已完成的任务:', task.task_id);
              await this.handleVideoSuccess(lineUserId, task.id, status);
            } else if (status.state === 'failed' || status.state === 'error') {
              console.log('❌ 发现失败的任务:', task.task_id);
              await this.handleVideoFailure(lineUserId, task.id, status.message);
            } else {
              console.log('⏳ 任务仍在处理中:', task.task_id);
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