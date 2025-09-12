/**
 * 海报生成器服务
 * 使用 KIE.AI nano-banana-edit 模型实现两步海报生成流程
 * Step 1: 用户图片 → 昭和风转换
 * Step 2: 昭和风图片 + 海报模板 → 最终海报
 */

const axios = require('axios');
const lineConfig = require('../config/line-config');

class PosterGenerator {
  constructor(db, posterImageService) {
    this.db = db; // 确保数据库引用可用
    this.posterImageService = posterImageService;
    
    // KIE.AI API 配置
    this.kieAi = {
      apiKey: lineConfig.kieAi.apiKey,
      baseUrl: 'https://api.kie.ai',
      createTaskEndpoint: '/api/v1/jobs/createTask',
      queryTaskEndpoint: '/api/v1/jobs/recordInfo',
      model: 'google/nano-banana-edit'
    };
    
    // 生成参数
    this.defaultParams = {
      output_format: 'png',
      image_size: 'auto' // 始终使用auto，采用第一张图片的尺寸
    };
    
    console.log('🎨 海报生成器初始化完成');
  }

  /**
   * 完整的海报生成流程
   * 两步异步生成 + 同步轮询（简化版本）
   */
  async generatePoster(userId, userImageUrl) {
    const startTime = Date.now();
    console.log(`🚀 开始海报生成流程 - 用户: ${userId}`);

    try {
      // 第一步：生成昭和风图片
      console.log('📸 第一步：转换为昭和风格...');
      const showaImageUrl = await this.generateShowaStyle(userImageUrl, userId);
      
      // 第二步：选择随机模板并生成最终海报
      console.log('🎨 第二步：合成海报...');
      const finalPosterUrl = await this.generateFinalPoster(showaImageUrl, userId);
      
      const totalTime = (Date.now() - startTime) / 1000;
      console.log(`✅ 海报生成完成 - 用户: ${userId}, 总耗时: ${totalTime}秒`);
      
      return {
        success: true,
        posterUrl: finalPosterUrl,
        showaImageUrl: showaImageUrl,
        totalTime: totalTime
      };

    } catch (error) {
      console.error(`❌ 海报生成失败 - 用户: ${userId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 第一步：将用户图片转换为昭和风格
   */
  async generateShowaStyle(userImageUrl, userId) {
    try {
      console.log(`📸 开始昭和风转换 - 用户: ${userId}`);

      // 昭和风转换的Prompt
      const showaPrompt = `将角色的风格改为[1970]年代的经典[昭和高中生]风格

将背景改为标志性的[昭和高校风景]

将服饰改为标志性的[昭和高中生服饰]

增加1970年老照片的风格和元素和老照片滤镜

重要！保持原图中的人物数量完全不变，不要增加或减少任何人物！

注意！不要改变角色的面部长相表情！`;

      // 调用 KIE.AI API 生成昭和风图片
      const taskId = await this.createKieAiTask({
        prompt: showaPrompt,
        image_urls: [userImageUrl]
      });

      console.log(`⏳ 昭和风生成任务已提交 - TaskID: ${taskId}`);

      // 同步轮询等待结果
      const result = await this.pollTaskResult(taskId, 120000); // 增加到120秒超时
      
      if (!result.success) {
        throw new Error(`昭和風変換が失敗しました: ${result.error}`);
      }

      // 下载并存储昭和风图片到我们的存储
      const showaImageUrl = await this.posterImageService.downloadAndStoreShowaImage(
        result.imageUrl, 
        userId
      );

      console.log(`✅ 昭和风转换完成 - 图片URL: ${showaImageUrl}`);
      return showaImageUrl;

    } catch (error) {
      console.error('❌ 昭和风转换失败:', error);
      throw error;
    }
  }

  /**
   * 第二步：使用昭和风图片和随机模板生成最终海报
   */
  async generateFinalPoster(showaImageUrl, userId) {
    try {
      console.log(`🎨 开始海报合成 - 用户: ${userId}`);

      // 随机选择一个海报模板
      const template = await this.db.getRandomPosterTemplate();
      if (!template) {
        throw new Error('利用可能なポスターテンプレートがありません');
      }

      console.log(`🎭 选中模板: ${template.template_name} (${template.style_category})`);

      // 海报合成的Prompt（强化尺寸要求：明确使用模板的尺寸和构图）
      const posterPrompt = `将[image2]的人物融入[image1]的海报布局中，严格保持[image1]的尺寸、构图比例和设计框架，增加老照片老书本的滤镜效果。

重要要求：
1. 必须使用[image1]的完整尺寸和构图比例
2. 保持[image1]的布局结构和设计框架  
3. 不要改变角色的面部长相表情`;

      // 调用 KIE.AI API 进行海报合成
      // 交换图片顺序：模板在前，人物在后，这样auto尺寸会采用模板尺寸
      const taskId = await this.createKieAiTask({
        prompt: posterPrompt,
        image_urls: [template.template_url, showaImageUrl] // 模板优先，auto会采用模板尺寸
      });

      console.log(`⏳ 海报合成任务已提交 - TaskID: ${taskId}`);

      // 同步轮询等待结果
      const result = await this.pollTaskResult(taskId, 150000); // 增加到150秒超时
      
      if (!result.success) {
        throw new Error(`ポスター合成が失敗しました: ${result.error}`);
      }

      // 下载并存储最终海报到我们的存储
      const finalPosterUrl = await this.posterImageService.downloadAndStoreFinalPoster(
        result.imageUrl, 
        userId
      );

      console.log(`✅ 海报合成完成 - 图片URL: ${finalPosterUrl}`);
      console.log(`📊 使用模板: ${template.template_name}`);
      
      return finalPosterUrl;

    } catch (error) {
      console.error('❌ 海报合成失败:', error);
      throw error;
    }
  }

  /**
   * 创建 KIE.AI 任务
   */
  async createKieAiTask(params) {
    try {
      const requestData = {
        model: this.kieAi.model,
        // callBackUrl 可选，我们使用轮询方式
        input: {
          prompt: params.prompt,
          image_urls: params.image_urls,
          output_format: this.defaultParams.output_format,
          image_size: this.defaultParams.image_size // 始终使用auto
        }
      };

      console.log('📡 调用 KIE.AI API:', {
        model: requestData.model,
        prompt: params.prompt.substring(0, 100) + '...',
        imageCount: params.image_urls.length,
        imageSize: this.defaultParams.image_size,
        imageOrder: params.image_urls.length === 2 ? 'template_first' : 'single_image'
      });

      const response = await axios.post(
        `${this.kieAi.baseUrl}${this.kieAi.createTaskEndpoint}`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.kieAi.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30秒超时
        }
      );

      if (response.data.code === 200 && response.data.data.taskId) {
        console.log(`✅ KIE.AI 任务创建成功 - TaskID: ${response.data.data.taskId}`);
        return response.data.data.taskId;
      } else {
        throw new Error(`タスク作成が失敗しました: ${response.data.message || '不明なエラー'}`);
      }

    } catch (error) {
      console.error('❌ KIE.AI 任务创建失败:', error.message);
      
      if (error.response) {
        console.error('API 响应:', error.response.status, error.response.data);
      }
      
      throw new Error(`KIE.AI API呼び出しが失敗しました: ${error.message}`);
    }
  }

  /**
   * 轮询任务结果
   */
  async pollTaskResult(taskId, maxWaitTime = 120000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 缩短到2秒轮询一次，更及时
    
    console.log(`🔍 开始轮询任务状态 - TaskID: ${taskId}, 最大等待: ${maxWaitTime/1000}秒`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(
          `${this.kieAi.baseUrl}${this.kieAi.queryTaskEndpoint}?taskId=${taskId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.kieAi.apiKey}`
            },
            timeout: 10000
          }
        );

        if (response.data.code === 200) {
          const taskData = response.data.data;
          const elapsedTime = (Date.now() - startTime) / 1000;
          
          console.log(`📊 任务状态: ${taskData.state} (${elapsedTime}秒)`);

          if (taskData.state === 'success') {
            // 解析结果JSON获取图片URL
            const resultJson = JSON.parse(taskData.resultJson);
            const imageUrl = resultJson.resultUrls?.[0];
            
            if (!imageUrl) {
              throw new Error('生成結果に画像URLが含まれていません');
            }

            console.log(`✅ 任务完成 - 耗时: ${elapsedTime}秒`);
            return {
              success: true,
              imageUrl: imageUrl,
              taskData: taskData
            };
          } 
          else if (taskData.state === 'fail') {
            throw new Error(`生成が失敗しました: ${taskData.failMsg || '不明なエラー'}`);
          }
          // 其他状态 (waiting, queuing, generating) 继续轮询
        } else {
          console.warn(`⚠️ 查询任务状态异常: ${response.data.message}`);
        }

      } catch (error) {
        console.warn(`⚠️ 轮询错误: ${error.message}`);
        // 轮询错误不中断，继续尝试
      }

      // 等待下次轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // 超时 - 提供更详细的错误信息（日语）
    const elapsedTime = (Date.now() - startTime) / 1000;
    console.error(`❌ 任务轮询超时 - TaskID: ${taskId}, 实际等待: ${elapsedTime}秒, 预期: ${maxWaitTime/1000}秒`);
    throw new Error(`処理時間が予想より長くかかっています。${elapsedTime.toFixed(1)}秒経過しました。ネットワークの問題またはタスクの複雑性が原因の可能性があります。`);
  }

  /**
   * 查询任务状态（单次）
   */
  async queryTaskStatus(taskId) {
    try {
      const response = await axios.get(
        `${this.kieAi.baseUrl}${this.kieAi.queryTaskEndpoint}?taskId=${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.kieAi.apiKey}`
          },
          timeout: 10000
        }
      );

      if (response.data.code === 200) {
        return {
          success: true,
          data: response.data.data
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'ステータス確認が失敗しました'
        };
      }

    } catch (error) {
      console.error('❌ 查询任务状态失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取API状态和配置信息
   */
  getStatus() {
    return {
      apiKey: this.kieAi.apiKey ? '已配置' : '未配置',
      model: this.kieAi.model,
      baseUrl: this.kieAi.baseUrl,
      defaultParams: this.defaultParams
    };
  }
}

module.exports = PosterGenerator;
