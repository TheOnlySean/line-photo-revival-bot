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
      console.log('🎬 开始生成视频:', { lineUserId, videoRecordId });

      // 更新状态为处理中
      await this.db.updateVideoGeneration(videoRecordId, {
        status: 'processing'
      });

      // 调用KIE.AI Runway API生成视频
      const result = await this.callRunwayApi(imageUrl);

      if (result.success && result.taskId) {
        // 保存taskId到数据库
        await this.db.updateVideoGeneration(videoRecordId, {
          task_id: result.taskId
        });

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

  // 调用KIE.AI Runway API
  async callRunwayApi(imageUrl) {
    try {
      console.log('🤖 调用KIE.AI Runway API:', imageUrl);

      if (!this.kieAiConfig.apiKey) {
        throw new Error('KIE.AI API Key未配置');
      }

      const requestData = {
        prompt: "Transform this photo into a dynamic video with natural movements and expressions, bringing the person to life with subtle animations and realistic motion",
        imageUrl: imageUrl,
        aspectRatio: this.kieAiConfig.defaultParams.aspectRatio,
        duration: this.kieAiConfig.defaultParams.duration,
        quality: this.kieAiConfig.defaultParams.quality,
        waterMark: this.kieAiConfig.defaultParams.waterMark
      };

      const response = await axios.post(
        `${this.kieAiConfig.baseUrl}${this.kieAiConfig.generateEndpoint}`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.kieAiConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      console.log('📡 API响应状态:', response.status);

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
      return this.handleApiError(error);
    }
  }

  // 简化的API错误处理
  handleApiError(error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) return { success: false, error: 'API认证失败，请检查API Key' };
      if (status === 429) return { success: false, error: '请求过于频繁，请稍后再试' };
      if (status >= 500) return { success: false, error: 'AI服务暂时不可用，请稍后再试' };
      return { success: false, error: `API错误: ${error.response.data?.message || error.message}` };
    }
    if (error.code === 'ECONNABORTED') return { success: false, error: '请求超时，请稍后再试' };
    return { success: false, error: '网络连接失败，请检查网络设置' };
  }

  // 优化的轮询逻辑（减少日志，增强稳定性）
  async pollVideoStatus(lineUserId, taskId, videoRecordId) {
    const maxAttempts = 40; // 减少到40次 (约10分钟)
    const pollInterval = 15000; // 15秒间隔
    let attempts = 0;
    let lastStatus = null;
    let consecutiveTimeouts = 0; // 连续超时计数

    console.log('🚀 开始轮询:', { taskId, maxAttempts });

    const poll = async () => {
      try {
        attempts++;
        console.log(`🔍 轮询 ${attempts}/${maxAttempts}`);

        const statusResult = await this.getVideoStatus(taskId);

        if (statusResult.success) {
          consecutiveTimeouts = 0; // 重置超时计数
          const status = statusResult.status;
          
          // 只在状态变化时通知用户
          if (status !== lastStatus && attempts > 2) {
            await this.notifyStatusChange(lineUserId, status, attempts, maxAttempts);
          }
          lastStatus = status;

          switch (status) {
            case 'wait':
            case 'queueing':
            case 'generating':
            case 'processing':
              if (attempts < maxAttempts) {
                setTimeout(poll, pollInterval);
              } else {
                console.error('⏰ 轮询超时');
                await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成超时，请稍后再试');
              }
              break;

            case 'success':
            case 'completed':
              console.log('🎉 视频生成成功');
              if (statusResult.videoUrl) {
                await this.handleVideoSuccess(lineUserId, videoRecordId, {
                  videoUrl: statusResult.videoUrl,
                  thumbnailUrl: statusResult.thumbnailUrl || statusResult.imageUrl
                });
              } else {
                console.error('⚠️ 生成成功但缺少视频URL');
                await this.handleVideoFailure(lineUserId, videoRecordId, '生成成功但无法获取视频URL');
              }
              break;

            case 'fail':
            case 'failed':
            case 'error':
              console.error('❌ 视频生成失败:', statusResult.error);
              await this.handleVideoFailure(lineUserId, videoRecordId, statusResult.error || '视频生成失败');
              break;

            default:
              console.log('⚠️ 未知状态:', status);
              if (attempts < maxAttempts) {
                setTimeout(poll, pollInterval);
              } else {
                await this.handleVideoFailure(lineUserId, videoRecordId, `视频生成状态异常: ${status}`);
              }
          }
        } else {
          // 🔧 智能处理查询失败
          if (statusResult.isTimeout) {
            consecutiveTimeouts++;
            console.warn(`⏰ 连续超时 ${consecutiveTimeouts} 次`);
            
            // 连续超时3次后，延长轮询间隔
            const nextInterval = consecutiveTimeouts >= 3 ? pollInterval * 2 : pollInterval;
            
            if (attempts < maxAttempts) {
              console.log(`🔁 API超时重试，延长间隔到 ${nextInterval/1000}秒`);
              setTimeout(poll, nextInterval);
            } else {
              await this.handleVideoFailure(lineUserId, videoRecordId, 'API响应超时，请稍后再试');
            }
          } else if (statusResult.isRateLimit) {
            // API限流，延长重试间隔
            if (attempts < maxAttempts) {
              console.log('🔁 API限流，延长重试间隔到60秒');
              setTimeout(poll, 60000); // 等待1分钟
            } else {
              await this.handleVideoFailure(lineUserId, videoRecordId, 'API服务繁忙，请稍后再试');
            }
          } else {
            // 其他错误，正常重试
            if (attempts < maxAttempts) {
              console.log('🔁 查询状态失败，重试中...');
              setTimeout(poll, pollInterval * 2);
            } else {
              await this.handleVideoFailure(lineUserId, videoRecordId, '无法获取视频生成状态');
            }
          }
        }

      } catch (error) {
        console.error('❌ 轮询异常:', error.message);
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval * 2);
        } else {
          await this.handleVideoFailure(lineUserId, videoRecordId, '视频生成监控过程异常');
        }
      }
    };

    // 3秒后开始第一次轮询
    setTimeout(poll, 3000);
  }

  // 通知用户状态变化
  async notifyStatusChange(lineUserId, status, attempts, maxAttempts) {
    try {
      const progressPercent = Math.min(Math.round((attempts / maxAttempts) * 100), 95);
      const estimatedMinutes = Math.ceil((maxAttempts - attempts) * 15 / 60); // 预计剩余分钟
      let message = '';

      switch (status) {
        case 'queueing':
          message = `⏳ 動画生成がキューに追加されました\n\n📊 進行状況: ${progressPercent}%\n⏱️ 予想待ち時間: 約${estimatedMinutes}分\n\n✨ 高品質な動画を生成中です、少々お待ちください`;
          break;
        case 'generating':
        case 'processing':
          message = `🎬 AI動画生成中です\n\n📊 進行状況: ${progressPercent}%\n⏱️ 完成まで: 約${estimatedMinutes}分\n\n🚀 もうしばらくで完了いたします！`;
          break;
        case 'wait':
          // 初期等待状态，给用户更多信心
          message = `🔄 動画生成準備中...\n\n📸 お写真を解析し、最適な動画パラメータを設定しています\n⏱️ 予想時間: 約${estimatedMinutes}分\n\n💡 完成次第すぐにお送りいたします！`;
          break;
        default:
          return; // 其他状态不通知
      }

      if (message) {
        const line = require('@line/bot-sdk');
        const lineConfig = require('../config/line-config');
        const client = new line.Client({
          channelSecret: lineConfig.channelSecret,
          channelAccessToken: lineConfig.channelAccessToken
        });

        await client.pushMessage(lineUserId, {
          type: 'text',
          text: message
        });
        console.log(`📤 状态变化通知已发送: ${status} (${progressPercent}%)`);
      }

    } catch (error) {
      console.error('❌ 发送状态变化通知失败:', error.message);
      // 🔧 检查是否用户取消关注导致的失败
      if (error.message.includes('User not found') || 
          error.message.includes('Invalid user') ||
          error.response?.status === 400) {
        console.warn('⚠️ 用户可能已取消关注，但轮询继续进行');
        // 不抛出错误，让轮询继续，以防用户重新关注
      }
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
          timeout: 60000 // 🔧 增加到60秒，处理慢速API
        }
      );

      console.log('📡 状态API响应:', response.status, response.data);

      if (response.data && response.data.code === 200) {
        const data = response.data.data;
        
        // KIE.ai API 实际返回格式适配
        const status = data.state; // 使用 'state' 而不是 'status'
        const videoInfo = data.videoInfo;
        const videoUrl = videoInfo?.videoUrl || videoInfo?.url;
        const thumbnailUrl = videoInfo?.imageUrl || videoInfo?.thumbnailUrl || videoInfo?.thumbnail; // 🔧 修复：imageUrl是缩略图
        
        console.log('✅ 状态解析成功:', {
          originalState: data.state,
          mappedStatus: status,
          hasVideoInfo: !!videoInfo,
          hasVideoUrl: !!videoUrl,
          hasThumbnailUrl: !!thumbnailUrl, // 🔧 添加缩略图检查
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
      
      // 🔧 详细的超时错误处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.warn('⏰ API查询超时，这可能是正常的（API响应慢）');
        return {
          success: false,
          error: '查询超时，正在重试...',
          isTimeout: true // 标记为超时，区别于其他错误
        };
      }
      
      if (error.response) {
        console.error('❌ API错误详情:', error.response.status, error.response.data);
        // 区分不同类型的API错误
        if (error.response.status === 429) {
          return {
            success: false,
            error: 'API调用频率限制，正在重试...',
            isRateLimit: true
          };
        }
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
      console.log('✅ 数据库记录已更新为完成状态');

      // 🔧 增强的视频发送逻辑
      try {
        await this.sendVideoToUser(lineUserId, result);
        console.log('✅ 视频发送成功');
      } catch (sendError) {
        console.error('❌ 视频发送失败:', sendError.message);
        
        // 检查是否因为用户取消关注导致的发送失败
        if (sendError.message.includes('User not found') || 
            sendError.message.includes('Invalid user') ||
            sendError.response?.status === 400) {
          console.warn('⚠️ 用户已取消关注，视频已保存到数据库，用户重新关注后可获取');
          
          // 更新数据库记录，标记为"已生成但未发送"
          await this.db.updateVideoGeneration(videoRecordId, {
            status: 'completed_pending_delivery',
            error_message: '用户已取消关注，视频等待发送'
          });
        } else {
          // 其他发送错误，但视频已生成，不算失败
          console.warn('⚠️ 视频发送遇到其他问题，但生成成功:', sendError.message);
        }
      }
      
      // 切换回主要Rich Menu (如果用户还在线)
      if (this.lineBot) {
        try {
          await this.lineBot.switchToMainMenu(lineUserId);
          console.log('✅ 已切换回主要Rich Menu');
        } catch (menuError) {
          console.warn('⚠️ 切换菜单失败，用户可能已取消关注:', menuError.message);
        }
      }

      console.log('✅ 视频生成成功处理完成:', result.videoUrl);

    } catch (error) {
      console.error('❌ 处理视频成功时出错:', error);
      // 即使处理出错，也要确保数据库状态正确
      try {
        await this.db.updateVideoGeneration(videoRecordId, {
          status: 'completed',
          video_url: result.videoUrl,
          thumbnail_url: result.thumbnailUrl,
          completed_at: new Date(),
          error_message: `处理成功时出错: ${error.message}`
        });
      } catch (dbError) {
        console.error('❌ 紧急数据库更新也失败:', dbError.message);
      }
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

  // 检查并发送用户的待发送视频（用户重新关注时调用）
  async checkAndSendPendingVideos(lineUserId) {
    try {
      console.log('🔍 检查用户的待发送视频:', lineUserId);
      
      // 查询状态为"已生成但未发送"的视频
      const pendingVideos = await this.db.query(`
        SELECT v.*, u.id as user_id
        FROM videos v 
        JOIN users u ON v.user_id = u.id 
        WHERE u.line_id = $1 
        AND v.status = 'completed_pending_delivery'
        AND v.video_url IS NOT NULL
        ORDER BY v.created_at DESC
        LIMIT 3
      `, [lineUserId]);

      if (pendingVideos.rows.length === 0) {
        console.log('✅ 没有待发送的视频');
        return;
      }

      console.log(`📤 发现 ${pendingVideos.rows.length} 个待发送视频`);

      for (const video of pendingVideos.rows) {
        try {
          await this.sendVideoToUser(lineUserId, {
            videoUrl: video.video_url,
            thumbnailUrl: video.thumbnail_url
          });

          // 更新状态为已发送
          await this.db.updateVideoGeneration(video.id, {
            status: 'completed',
            error_message: null
          });

          console.log(`✅ 待发送视频已发送: ${video.id}`);

        } catch (sendError) {
          console.error(`❌ 发送待发送视频失败: ${video.id}`, sendError.message);
        }
      }

      // 发送一条汇总消息
      await this.sendPendingVideosSummary(lineUserId, pendingVideos.rows.length);

    } catch (error) {
      console.error('❌ 检查待发送视频失败:', error.message);
    }
  }

  // 发送待发送视频汇总消息
  async sendPendingVideosSummary(lineUserId, count) {
    try {
      const line = require('@line/bot-sdk');
      const lineConfig = require('../config/line-config');
      const client = new line.Client({
        channelSecret: lineConfig.channelSecret,
        channelAccessToken: lineConfig.channelAccessToken
      });

      await client.pushMessage(lineUserId, {
        type: 'text',
        text: `🎉 お帰りなさい！\n\n📱 あなたが不在の間に${count}つの動画が生成完了しておりました。上記の動画をお楽しみください！\n\n💡 引き続き素敵な動画作成をお楽しみください。`
      });

      console.log(`✅ 待发送视频汇总消息已发送: ${count}个视频`);

    } catch (error) {
      console.error('❌ 发送汇总消息失败:', error.message);
    }
  }
}

module.exports = VideoGenerator; 