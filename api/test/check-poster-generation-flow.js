/**
 * 检查生产环境的海报生成流程逻辑
 */

export default async function handler(req, res) {
  try {
    console.log('🔍 检查海报生成流程逻辑...');

    // 检查关键函数和配置
    const PosterGenerator = require('../../services/poster-generator');
    const PosterImageService = require('../../services/poster-image-service');
    
    const response = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // 1. 检查PosterGenerator类
    console.log('🔧 检查PosterGenerator...');
    const posterGenerator = new PosterGenerator();
    
    response.checks.posterGeneratorExists = !!posterGenerator;
    response.checks.hasGeneratePosterMethod = typeof posterGenerator.generatePoster === 'function';
    response.checks.hasGenerateShowaStyleMethod = typeof posterGenerator.generateShowaStyle === 'function';
    response.checks.hasGenerateFinalPosterMethod = typeof posterGenerator.generateFinalPoster === 'function';

    // 2. 检查PosterImageService类
    console.log('🔧 检查PosterImageService...');
    const posterImageService = new PosterImageService();
    
    response.checks.posterImageServiceExists = !!posterImageService;
    response.checks.hasAddWatermarkMethod = typeof posterImageService.addWatermark === 'function';
    response.checks.hasDownloadAndStoreFinalPosterMethod = typeof posterImageService.downloadAndStoreFinalPoster === 'function';

    // 3. 检查生成流程函数体（通过toString检查关键逻辑）
    if (posterGenerator.generatePoster) {
      const generatePosterCode = posterGenerator.generatePoster.toString();
      response.checks.hasTwoStepLogic = generatePosterCode.includes('generateShowaStyle') && generatePosterCode.includes('generateFinalPoster');
      response.checks.hasTaskIdSupport = generatePosterCode.includes('posterTaskId');
    }

    if (posterImageService.downloadAndStoreFinalPoster) {
      const downloadCode = posterImageService.downloadAndStoreFinalPoster.toString();
      response.checks.hasWatermarkCall = downloadCode.includes('addWatermark');
    }

    // 4. 检查数据库函数
    const db = require('../../config/database');
    response.checks.hasCheckPosterQuotaMethod = typeof db.checkPosterQuota === 'function';
    response.checks.hasUsePosterQuotaMethod = typeof db.usePosterQuota === 'function';

    // 5. 模拟检查配额逻辑（不实际调用）
    if (db.checkPosterQuota) {
      const checkQuotaCode = db.checkPosterQuota.toString();
      response.checks.hasFirstFreeLogic = checkQuotaCode.includes('isFirstFree') && checkQuotaCode.includes('first_poster_used');
    }

    console.log('✅ 检查完成');
    res.status(200).json({
      success: true,
      ...response
    });

  } catch (error) {
    console.error('❌ 检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
