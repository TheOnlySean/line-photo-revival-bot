const axios = require('axios');
const lineConfig = require('../config/line-config');

class VideoGenerator {
  constructor(db) {
    this.db = db;
    this.kieAiConfig = lineConfig.kieAi;
  }

  // 生成视频（主要方法）
  async generateVideo(lineUserId, imageUrl, videoRecordId) {
    try {
      console.log('🎬 开始生成视频:', { lineUserId, imageUrl, videoRecordId });

      // 更新状态为处理中
      await this.db.updateVideoGeneration(videoRecordId, {
        status: 'processing'
      });

      // 调用KIE.AI Runway API生成视频
      const result = await this.callRunwayApi(imageUrl);

      if (result.success) {
        // 如果有taskId，需要轮询检查状态
        if (result.taskId) {
          // 保存taskId到数据库
          await this.db.updateVideoGeneration(videoRecordId, {
            task_id: result.taskId
          });

          // 开始轮询任务状态
          this.pollVideoStatus(lineUserId, result.taskId, videoRecordId);
        } else if (result.videoUrl) {
          // 直接返回了视频URL（同步模式）
          await this.handleVideoSuccess(lineUserId, videoRecordId, result);
        }

        console.log('✅ 视频生成任务提交成功:', result.taskId || result.videoUrl);
      } else {
        // 生成失败
        await this.handleVideoFailure(lineUserId, videoRecordId, result.error);
        console.error('❌ 视频生成失败:', result.error);
      }

    } catch (error) {
      console.error('❌ 视频生成过程出错:', error);
      await this.handleVideoFailure(lineUserId, videoRecordId, '系统错误，请稍后再试');
    }
  }

  // 调用KIE.AI Runway API
  async callRunwayApi(imageUrl) {
    try {
      console.log('🤖 调用KIE.AI Runway API:', imageUrl);

      // 检查API配置
      if (!this.kieAiConfig.apiKey) {
        throw new Error('KIE.AI API Key未配置');
      }

      // 准备API请求参数 - 根据Runway API文档
      const requestData = {
        prompt: "Transform this photo into a dynamic video with natural movements and expressions, bringing the person to life with subtle animations and realistic motion",
        imageUrl: imageUrl,
        aspectRatio: this.kieAiConfig.defaultParams.aspectRatio,
        duration: this.kieAiConfig.defaultParams.duration,
        quality: this.kieAiConfig.defaultParams.quality,
        waterMark: this.kieAiConfig.defaultParams.waterMark
      };

      console.log('📤 发送Runway API请求:', requestData);

      // 发送API请求到Runway端点
      const response = await axios.post(
        `${this.kieAiConfig.baseUrl}${this.kieAiConfig.generateEndpoint}`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60秒超时，因为是异步任务
        }
      );

      console.log('📡 Runway API响应:', response.status, response.data);

      if (response.data && response.data.code === 200) {
        return {
          success: true,
          taskId: response.data.data.taskId,
          message: response.data.message || '任务提交成功'
        };
      } else {
        return {
          success: false,
          error: response.data?.message || '视频生成任务提交失败'
        };
      }

    } catch (error) {
      console.error('❌ Runway API调用失败:', error.message);

      // 处理不同类型的错误
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.message;

        if (status === 401) {
          return { success: false, error: 'API认证失败，请检查API Key' };
        } else if (status === 429) {
          return { success: false, error: '请求过于频繁，请稍后再试' };
        } else if (status >= 500) {
          return { success: false, error: 'AI服务暂时不可用，请稍后再试' };
        } else {
          return { success: false, error: `API错误: ${message}` };
        }
      } else if (error.code === 'ECONNABORTED') {
        return { success: false, error: '请求超时，请稍后再试' };
      } else {
        return { success: false, error: '网络连接失败，请检查网络设置' };
      }
    }
  }

  // 轮询视频生成状态
  async pollVideoStatus(lineUserId, taskId, videoRecordId) {
    const maxAttempts = 40; // 最多轮询40次 (约10分钟)
    const pollInterval = 15000; // 每15秒轮询一次
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔍 轮询视频状态 (第${attempts}次):`, taskId);

        const statusResult = await this.getVideoStatus(taskId);

        if (statusResult.success) {
          const status = statusResult.status;
          console.log(`📊 任务状态: ${status}`);

          switch (status) {
            case 'wait':
            case 'queueing':
            case 'generating':
              // 继续轮询
              if (attempts < maxAttempts) {
                setTimeout(poll, pollInterval);
              } else {
                // 超时
                await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成超时，请稍后再试');
              }
              break;

            case 'success':
              // 生成成功
              await this.handleVideoSuccess(lineUserId, videoRecordId, {
                videoUrl: statusResult.videoUrl,
                thumbnailUrl: statusResult.thumbnailUrl || statusResult.imageUrl
              });
              break;

            case 'fail':
              // 生成失败
              await this.handleVideoFailure(lineUserId, videoRecordId, statusResult.error || '视频生成失败');
              break;

            default:
              console.log('⚠️ 未知状态:', status);
              if (attempts < maxAttempts) {
                setTimeout(poll, pollInterval);
              } else {
                await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成状态异常');
              }
          }
        } else {
          // 查询状态失败
          if (attempts < maxAttempts) {
            setTimeout(poll, pollInterval * 2); // 失败时延长间隔
          } else {
            await this.handleVideoFailure(lineUserId, videoRecordId, '无法获取视频生成状态');
          }
        }

      } catch (error) {
        console.error('❌ 轮询状态出错:', error);
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval * 2);
        } else {
          await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成监控失败');
        }
      }
    };

    // 开始轮询
    setTimeout(poll, pollInterval);
  }

  // 获取视频生成状态
  async getVideoStatus(taskId) {
    try {
      const response = await axios.get(
        `${this.kieAiConfig.baseUrl}${this.kieAiConfig.detailEndpoint}`,
        {
          params: { taskId },
          headers: {
            'Authorization': `Bearer ${this.kieAiConfig.apiKey}`
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.code === 200) {
        const data = response.data.data;
        return {
          success: true,
          status: data.status,
          videoUrl: data.videoUrl,
          thumbnailUrl: data.thumbnailUrl,
          imageUrl: data.imageUrl,
          error: data.error
        };
      } else {
        return {
          success: false,
          error: response.data?.message || '获取状态失败'
        };
      }

    } catch (error) {
      console.error('❌ 获取视频状态失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 处理视频生成成功
  async handleVideoSuccess(lineUserId, videoRecordId, result) {
    try {
      // 更新数据库记录
      await this.db.updateVideoGeneration(videoRecordId, {
        status: 'completed',
        video_url: result.videoUrl,
        thumbnail_url: result.thumbnailUrl,
        completed_at: new Date()
      });

      // 发送视频给用户
      await this.sendVideoToUser(lineUserId, result);

      console.log('✅ 视频生成成功并已发送给用户:', result.videoUrl);

    } catch (error) {
      console.error('❌ 处理视频成功时出错:', error);
    }
  }

  // 处理视频生成失败
  async handleVideoFailure(lineUserId, videoRecordId, errorMessage) {
    try {
      // 更新数据库记录
      await this.db.updateVideoGeneration(videoRecordId, {
        status: 'failed',
        error_message: errorMessage
      });

      // 返还用户点数
      const videoRecord = await this.db.query('SELECT user_id, credits_used FROM videos WHERE id = $1', [videoRecordId]);
      if (videoRecord.rows.length > 0) {
        const userId = videoRecord.rows[0].user_id;
        const creditsUsed = videoRecord.rows[0].credits_used;
        
        // 返还点数
        await this.db.updateUserCredits(userId, creditsUsed);
        console.log(`💎 已返还用户 ${creditsUsed} 点数`);
      }

      // 发送失败消息给用户
      await this.sendErrorToUser(lineUserId, errorMessage);

      console.error('❌ 视频生成失败处理完成:', errorMessage);

    } catch (error) {
      console.error('❌ 处理视频失败时出错:', error);
    }
  }

  // 发送生成的视频给用户
  async sendVideoToUser(lineUserId, result) {
    try {
      const line = require('@line/bot-sdk');
      const client = new line.Client({
        channelSecret: lineConfig.channelSecret,
        channelAccessToken: lineConfig.channelAccessToken
      });

      await client.pushMessage(lineUserId, [
        {
          type: 'text',
          text: '🎉 您的AI视频生成完成！\n\n✨ 这是将您的照片转换成生动视频的结果：'
        },
        {
          type: 'video',
          originalContentUrl: result.videoUrl,
          previewImageUrl: result.thumbnailUrl
        },
        {
          type: 'text',
          text: '💡 喜欢这个效果吗？\n\n上传更多照片继续创作，或者分享给朋友体验吧！'
        }
      ]);

      console.log('✅ 视频已发送给用户:', lineUserId);

    } catch (error) {
      console.error('❌ 发送视频失败:', error);
      throw error;
    }
  }

  // 发送错误消息给用户
  async sendErrorToUser(lineUserId, errorMessage) {
    try {
      const line = require('@line/bot-sdk');
      const client = new line.Client({
        channelSecret: lineConfig.channelSecret,
        channelAccessToken: lineConfig.channelAccessToken
      });

      await client.pushMessage(lineUserId, {
        type: 'text',
        text: `❌ 视频生成失败\n\n原因: ${errorMessage}\n\n💎 您的点数已返还，请稍后重试或联系客服`
      });

      console.log('📤 错误消息已发送给用户:', lineUserId);

    } catch (error) {
      console.error('❌ 发送错误消息失败:', error);
    }
  }

  // 批量生成演示视频（用于初始化演示内容）
  async generateDemoVideos(demoImages) {
    const results = [];

    for (const demo of demoImages) {
      try {
        console.log(`🎬 生成演示视频: ${demo.title}`);

        const result = await this.callRunwayApi(demo.imageUrl);
        
        if (result.success && result.taskId) {
          // 等待演示视频生成完成
          const finalResult = await this.waitForVideoCompletion(result.taskId);
          
          if (finalResult.success) {
            // 将演示内容保存到数据库
            const demoContent = await this.db.insertDemoContent(
              demo.title,
              demo.imageUrl,
              finalResult.videoUrl,
              demo.description,
              demo.sortOrder
            );

            results.push({
              success: true,
              demo: demoContent
            });

            console.log(`✅ 演示视频生成完成: ${demo.title}`);
          } else {
            results.push({
              success: false,
              title: demo.title,
              error: finalResult.error
            });
          }
        } else {
          results.push({
            success: false,
            title: demo.title,
            error: result.error
          });
        }

        // 添加延迟，避免API限流
        await this.sleep(3000);

      } catch (error) {
        results.push({
          success: false,
          title: demo.title,
          error: error.message
        });

        console.error(`❌ 演示视频生成异常: ${demo.title}`, error);
      }
    }

    return results;
  }

  // 等待视频生成完成（用于演示视频批量生成）
  async waitForVideoCompletion(taskId, maxWaitTime = 300000) { // 5分钟超时
    const startTime = Date.now();
    const pollInterval = 10000; // 10秒间隔

    while (Date.now() - startTime < maxWaitTime) {
      const statusResult = await this.getVideoStatus(taskId);
      
      if (statusResult.success) {
        const status = statusResult.status;
        
        if (status === 'success') {
          return {
            success: true,
            videoUrl: statusResult.videoUrl,
            thumbnailUrl: statusResult.thumbnailUrl
          };
        } else if (status === 'fail') {
          return {
            success: false,
            error: statusResult.error || '视频生成失败'
          };
        }
        // wait, queueing, generating 状态继续等待
      }

      await this.sleep(pollInterval);
    }

    return {
      success: false, 
      error: '视频生成超时'
    };
  }

  // 检查KIE.AI服务状态
  async checkServiceStatus() {
    try {
      // 简单的API连通性测试
      const response = await axios.get(`${this.kieAiConfig.baseUrl}/api/v1/common/account`, {
        headers: {
          'Authorization': `Bearer ${this.kieAiConfig.apiKey}`
        },
        timeout: 10000
      });

      return {
        available: true,
        status: 'Runway API服务正常'
      };

    } catch (error) {
      console.error('❌ 检查KIE.AI服务状态失败:', error.message);
      return {
        available: false,
        error: error.message
      };
    }
  }

  // 工具方法：睡眠
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取支持的配置选项
  getSupportedOptions() {
    return {
      aspectRatios: ['1:1', '16:9', '9:16'],
      durations: [5, 8],
      qualities: ['720p', '1080p'],
      features: [
        '高性价比AI视频生成',
        '支持图片转视频',
        '多种尺寸比例',
        '无水印输出'
      ]
    };
  }
}

module.exports = VideoGenerator; 