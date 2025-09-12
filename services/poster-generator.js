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
    this.db = db;
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
      image_size: 'auto' // 第一步保持auto，第二步会根据模板调整
    };
    
    console.log('🎨 海报生成器初始化完成');
  }

  /**
   * 完整的海报生成流程
   * 两步异步生成 + 同步轮询
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
      const result = await this.pollTaskResult(taskId, 60000); // 60秒超时
      
      if (!result.success) {
        throw new Error(`昭和风转换失败: ${result.error}`);
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
        throw new Error('没有可用的海报模板');
      }

      console.log(`🎭 选中模板: ${template.template_name} (${template.style_category})`);

      // 海报合成的Prompt
      const posterPrompt = `用[image2]的风格为[image1]的人物做一个杂志封面设计，增加老照片老书本的滤镜效果。

最终输出应该采用[image2]模板的尺寸比例和格式。

注意！不要改变角色的面部长相表情！`;

      // 调用 KIE.AI API 进行海报合成
      // 第二步使用海报标准尺寸，而不是auto
      const taskId = await this.createKieAiTask({
        prompt: posterPrompt,
        image_urls: [showaImageUrl, template.template_url], // 昭和风图片 + 模板
        useTemplateSize: true // 标记使用模板尺寸
      });

      console.log(`⏳ 海报合成任务已提交 - TaskID: ${taskId}`);

      // 同步轮询等待结果
      const result = await this.pollTaskResult(taskId, 90000); // 90秒超时
      
      if (!result.success) {
        throw new Error(`海报合成失败: ${result.error}`);
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
      // 根据用途选择合适的尺寸
      let imageSize = this.defaultParams.image_size; // 默认auto
      
      if (params.useTemplateSize) {
        // 第二步海报合成：使用海报标准尺寸 3:4 (适合海报/杂志封面)
        imageSize = '3:4';
        console.log('📐 使用海报标准尺寸: 3:4 (Portrait)');
      } else {
        // 第一步昭和风转换：保持原图尺寸
        console.log('📐 使用原图尺寸: auto');
      }

      const requestData = {
        model: this.kieAi.model,
        // callBackUrl 可选，我们使用轮询方式
        input: {
          prompt: params.prompt,
          image_urls: params.image_urls,
          output_format: this.defaultParams.output_format,
          image_size: imageSize
        }
      };

      console.log('📡 调用 KIE.AI API:', {
        model: requestData.model,
        prompt: params.prompt.substring(0, 100) + '...',
        imageCount: params.image_urls.length,
        imageSize: imageSize
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
        throw new Error(`任务创建失败: ${response.data.message || '未知错误'}`);
      }

    } catch (error) {
      console.error('❌ KIE.AI 任务创建失败:', error.message);
      
      if (error.response) {
        console.error('API 响应:', error.response.status, error.response.data);
      }
      
      throw new Error(`KIE.AI API调用失败: ${error.message}`);
    }
  }

  /**
   * 轮询任务结果
   */
  async pollTaskResult(taskId, maxWaitTime = 120000) {
    const startTime = Date.now();
    const pollInterval = 3000; // 3秒轮询一次
    
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
              throw new Error('生成结果中没有图片URL');
            }

            console.log(`✅ 任务完成 - 耗时: ${elapsedTime}秒`);
            return {
              success: true,
              imageUrl: imageUrl,
              taskData: taskData
            };
          } 
          else if (taskData.state === 'fail') {
            throw new Error(`生成失败: ${taskData.failMsg || '未知错误'}`);
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

    // 超时
    throw new Error(`任务超时 - TaskID: ${taskId}, 等待时间: ${maxWaitTime/1000}秒`);
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
          error: response.data.message || '查询失败'
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
