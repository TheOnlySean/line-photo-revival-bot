const axios = require('axios');
const lineConfig = require('../config/line-config');

class VideoGenerator {
  constructor(db, lineBot = null) {
    this.db = db;
    this.lineBot = lineBot;
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
          console.log('💾 保存taskId到数据库:', result.taskId);
          // 保存taskId到数据库
          await this.db.updateVideoGeneration(videoRecordId, {
            task_id: result.taskId
          });

          console.log('🚀 启动轮询任务状态检查...');
          // 开始轮询任务状态
          this.pollVideoStatus(lineUserId, result.taskId, videoRecordId);
        } else if (result.videoUrl) {
          // 直接返回了视频URL（同步模式）
          console.log('✅ 同步模式：直接返回视频URL');
          await this.handleVideoSuccess(lineUserId, videoRecordId, result);
        } else {
          console.error('⚠️ API返回成功但无taskId或videoUrl');
          await this.handleVideoFailure(lineUserId, videoRecordId, '任务提交成功但缺少关键信息');
        }

        console.log('✅ 视频生成任务提交成功:', result.taskId || result.videoUrl);
      } else {
        // 生成失败
        console.error('❌ 任务提交失败:', result.error);
        await this.handleVideoFailure(lineUserId, videoRecordId, result.error);
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

  // 轮询视频生成状态 (增强监控版本)
  async pollVideoStatus(lineUserId, taskId, videoRecordId) {
    const maxAttempts = 40; // 最多轮询40次 (约10分钟)
    const pollInterval = 15000; // 每15秒轮询一次
    let attempts = 0;
    let lastStatus = null;

    console.log('🚀 启动增强轮询监控系统');
    console.log('📋 轮询参数:', { lineUserId, taskId, videoRecordId, maxAttempts, pollInterval });

    const poll = async () => {
      try {
        attempts++;
        const progressPercent = Math.min(Math.round((attempts / maxAttempts) * 100), 95);
        
        console.log(`\n🔍 ===== 轮询第 ${attempts}/${maxAttempts} 次 (${progressPercent}%) =====`);
        console.log(`📋 任务ID: ${taskId}`);
        console.log(`👤 用户ID: ${lineUserId}`);
        console.log(`🎬 视频记录ID: ${videoRecordId}`);

        const statusResult = await this.getVideoStatus(taskId);
        console.log('📡 API响应结果:', JSON.stringify(statusResult, null, 2));

        if (statusResult.success) {
          const status = statusResult.status;
          console.log(`📊 当前状态: "${status}" (上次: "${lastStatus}")`);
          
          // 状态变化通知用户
          if (status !== lastStatus && attempts > 1) {
            console.log('🔄 状态发生变化，通知用户...');
            await this.notifyStatusChange(lineUserId, status, attempts, maxAttempts);
          }
          lastStatus = status;

          switch (status) {
            case 'wait':
            case 'queueing':
            case 'generating':
            case 'processing':
              // 继续轮询
              console.log(`⏳ 视频仍在处理中 (${status})，${pollInterval/1000}秒后继续轮询...`);
              if (attempts < maxAttempts) {
                setTimeout(poll, pollInterval);
              } else {
                // 超时
                console.log('⏰ 轮询达到最大次数，视频生成超时');
                await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成超时，请稍后再试');
              }
              break;

            case 'success':
            case 'completed':
              // 生成成功
              console.log('🎉 视频生成成功！开始处理完成流程...');
              if (statusResult.videoUrl) {
                console.log('✅ 找到视频URL，准备发送给用户');
                await this.handleVideoSuccess(lineUserId, videoRecordId, {
                  videoUrl: statusResult.videoUrl,
                  thumbnailUrl: statusResult.thumbnailUrl || statusResult.imageUrl
                });
              } else {
                console.error('⚠️ 生成成功但缺少视频URL:', statusResult);
                await this.handleVideoFailure(lineUserId, videoRecordId, '生成成功但无法获取视频URL');
              }
              break;

            case 'fail':
            case 'failed':
            case 'error':
              // 生成失败
              console.error('❌ 视频生成失败:', statusResult.error);
              console.error('❌ 完整状态信息:', statusResult);
              await this.handleVideoFailure(lineUserId, videoRecordId, statusResult.error || '视频生成失败');
              break;

            default:
              console.log('⚠️ 未知状态:', status, '将继续轮询...');
              console.log('⚠️ 完整响应:', statusResult);
              if (attempts < maxAttempts) {
                setTimeout(poll, pollInterval);
              } else {
                await this.handleVideoFailure(lineUserId, videoRecordId, `视频生成状态异常: ${status}`);
              }
          }
        } else {
          // 查询状态失败
          console.error('❌ 查询状态失败:', statusResult.error);
          if (attempts < maxAttempts) {
            console.log(`🔁 ${pollInterval * 2 / 1000}秒后重试查询...`);
            setTimeout(poll, pollInterval * 2); // 失败时延长间隔
          } else {
            console.error('❌ 达到最大重试次数，无法获取状态');
            await this.handleVideoFailure(lineUserId, videoRecordId, '无法获取视频生成状态');
          }
        }

        console.log(`===== 轮询第 ${attempts} 次完成 =====\n`);

      } catch (error) {
        console.error('❌ 轮询过程中发生异常:', error);
        console.error('❌ 错误堆栈:', error.stack);
        if (attempts < maxAttempts) {
          console.log(`🔁 ${pollInterval * 2 / 1000}秒后重试轮询...`);
          setTimeout(poll, pollInterval * 2);
        } else {
          console.error('❌ 轮询异常达到最大次数，终止轮询');
          await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成监控过程异常');
        }
      }
    };

    // 立即开始第一次轮询
    console.log('🚀 开始轮询视频生成状态...');
    setTimeout(poll, 3000); // 3秒后第一次轮询
  }

  // 通知用户状态变化
  async notifyStatusChange(lineUserId, status, attempts, maxAttempts) {
    try {
      const progressPercent = Math.min(Math.round((attempts / maxAttempts) * 100), 95);
      let message = '';

      switch (status) {
        case 'queueing':
          message = `⏳ 動画がキューに追加されました (${progressPercent}%)\n\n順番をお待ちください...`;
          break;
        case 'generating':
        case 'processing':
          message = `🎬 動画生成中です (${progressPercent}%)\n\n処理を継続しています...`;
          break;
        default:
          return; // 其他状态不通知
      }

      if (message) {
        const line = require('@line/bot-sdk');
        const client = new line.Client({
          channelSecret: lineConfig.channelSecret,
          channelAccessToken: lineConfig.channelAccessToken
        });

        await client.pushMessage(lineUserId, {
          type: 'text',
          text: message
        });
        console.log('📤 状态变化通知已发送给用户');
      }

    } catch (error) {
      console.error('❌ 发送状态变化通知失败:', error.message);
      // 不抛出错误，避免影响轮询主流程
    }
  }

  // 获取视频生成状态
  async getVideoStatus(taskId) {
    try {
      console.log('📡 请求视频状态 API:', `${this.kieAiConfig.baseUrl}${this.kieAiConfig.detailEndpoint}?taskId=${taskId}`);
      
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

      console.log('📡 状态API响应:', response.status, response.data);

      if (response.data && response.data.code === 200) {
        const data = response.data.data;
        
        // KIE.ai API 实际返回格式适配
        const status = data.state; // 使用 'state' 而不是 'status'
        const videoInfo = data.videoInfo;
        const videoUrl = videoInfo?.videoUrl || videoInfo?.url;
        const thumbnailUrl = videoInfo?.thumbnailUrl || videoInfo?.thumbnail;
        
        console.log('✅ 状态解析成功:', {
          originalState: data.state,
          mappedStatus: status,
          hasVideoInfo: !!videoInfo,
          hasVideoUrl: !!videoUrl,
          videoInfo: videoInfo
        });
        
        return {
          success: true,
          status: status,
          videoUrl: videoUrl,
          thumbnailUrl: thumbnailUrl,
          imageUrl: data.generateParam?.imageUrl,
          error: data.failMsg || data.error
        };
      } else {
        console.error('❌ 状态API返回错误:', response.data);
        return {
          success: false,
          error: response.data?.message || '获取状态失败'
        };
      }

    } catch (error) {
      console.error('❌ 获取视频状态API调用失败:', error.message);
      if (error.response) {
        console.error('❌ API错误详情:', error.response.status, error.response.data);
      }
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
      
      // 切换回主要Rich Menu
      if (this.lineBot) {
        await this.lineBot.switchToMainMenu(lineUserId);
        console.log('🔄 已切换回主要Rich Menu:', lineUserId);
      }

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
      
      // 切换回主要Rich Menu
      if (this.lineBot) {
        await this.lineBot.switchToMainMenu(lineUserId);
        console.log('🔄 已切换回主要Rich Menu:', lineUserId);
      }

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

      console.log('📤 开始发送视频给用户:', lineUserId);
      console.log('🎬 视频URL:', result.videoUrl);
      console.log('🖼️ 缩略图URL:', result.thumbnailUrl);

      await client.pushMessage(lineUserId, [
        {
          type: 'text',
          text: '🎉 動画生成が完了いたしました！\n\n✨ 素敵な動画をお楽しみください！'
        },
        {
          type: 'video',
          originalContentUrl: result.videoUrl,
          previewImageUrl: result.thumbnailUrl || result.videoUrl
        },
        {
          type: 'text',
          text: '💡 更に動画を作成されたい場合は、下部メニューをご利用ください！'
        }
      ]);

      console.log('✅ 视频消息已成功发送给用户:', lineUserId);

    } catch (error) {
      console.error('❌ 发送视频消息失败:', error);
      console.error('❌ 错误详情:', error.response?.data || error.message);
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

      console.log('📤 发送错误消息给用户:', lineUserId);
      console.log('❌ 错误内容:', errorMessage);

      await client.pushMessage(lineUserId, {
        type: 'text',
        text: `❌ 動画生成に失敗いたしました\n\n💰 ポイントを自動返却いたしました。\n\n🔄 しばらくお待ちいただいてから再度お試しください。`
      });

      console.log('✅ 错误消息已发送给用户:', lineUserId);

    } catch (error) {
      console.error('❌ 发送错误消息失败:', error);
      console.error('❌ 发送错误详情:', error.response?.data || error.message);
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