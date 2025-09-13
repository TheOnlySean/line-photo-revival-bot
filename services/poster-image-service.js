/**
 * 海报图片存储服务
 * 专门处理海报生成过程中的图片存储需求：
 * 1. 用户上传的原始图片
 * 2. 第一步生成的昭和风图片
 * 3. 最终生成的海报图片
 */

const { put } = require('@vercel/blob');
const crypto = require('crypto');
const sharp = require('sharp');
const lineConfig = require('../config/line-config');

class PosterImageService {
  constructor() {
    this.blobToken = lineConfig.blobToken;
    
    // 定义不同用途的文件夹路径
    this.paths = {
      original: 'poster-generation/original',     // 用户原图
      showa: 'poster-generation/showa',         // 昭和风转换后
      final: 'poster-generation/final',         // 最终海报
      templates: 'poster-generation/templates'  // 海报模板
    };
  }

  /**
   * 上传用户原始图片
   * 用于海报生成的第一步输入
   */
  async uploadUserOriginalImage(imageBuffer, userId) {
    try {
      console.log(`📤 上传用户原始图片 - 用户: ${userId}`);

      // 生成唯一文件名，包含用户ID和时间戳
      const timestamp = Date.now();
      const fileId = crypto.randomUUID();
      const fileName = `${this.paths.original}/${userId}_${timestamp}_${fileId}.jpg`;

      // 图片处理：保持较高质量用于AI生成
      const processedBuffer = await this.processImageForAI(imageBuffer);

      // 上传到Vercel Blob
      const blob = await put(fileName, processedBuffer, {
        access: 'public',
        token: this.blobToken
      });

      console.log('✅ 用户原始图片上传成功:', blob.url);
      return blob.url;

    } catch (error) {
      console.error('❌ 用户原始图片上传失败:', error);
      throw new Error('用户图片上传失败');
    }
  }

  /**
   * 从KIE.AI API结果URL下载并存储昭和风图片
   * 用于第二步处理
   */
  async downloadAndStoreShowaImage(kieApiImageUrl, userId) {
    try {
      console.log(`📥 下载并存储昭和风图片 - 用户: ${userId}`);

      // 从KIE.AI URL下载图片
      const response = await fetch(kieApiImageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 生成文件名
      const timestamp = Date.now();
      const fileId = crypto.randomUUID();
      const fileName = `${this.paths.showa}/${userId}_${timestamp}_${fileId}.jpg`;

      // 上传到我们的存储
      const blob = await put(fileName, buffer, {
        access: 'public',
        token: this.blobToken
      });

      console.log('✅ 昭和风图片存储成功:', blob.url);
      return blob.url;

    } catch (error) {
      console.error('❌ 昭和风图片存储失败:', error);
      throw new Error('昭和风图片处理失败');
    }
  }

  /**
   * 从KIE.AI API结果URL下载并存储最终海报
   */
  async downloadAndStoreFinalPoster(kieApiImageUrl, userId) {
    try {
      console.log(`📥 下载并存储最终海报 - 用户: ${userId}`);

      // 从KIE.AI URL下载图片
      const response = await fetch(kieApiImageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      // ✨ 添加水印处理
      console.log('🔖 开始添加水印...');
      console.log(`🔖 原图Buffer大小: ${(originalBuffer.length / 1024).toFixed(2)} KB`);
      const watermarkedBuffer = await this.addWatermark(originalBuffer);
      console.log(`🔖 水印处理后Buffer大小: ${(watermarkedBuffer.length / 1024).toFixed(2)} KB`);
      console.log('🔖 水印处理完成，准备上传...');

      // 生成文件名
      const timestamp = Date.now();
      const fileId = crypto.randomUUID();
      const fileName = `${this.paths.final}/${userId}_${timestamp}_${fileId}.jpg`;

      // 上传带水印的图片到我们的存储
      const blob = await put(fileName, watermarkedBuffer, {
        access: 'public',
        token: this.blobToken
      });

      console.log('✅ 最终海报存储成功:', blob.url);
      return blob.url;

    } catch (error) {
      console.error('❌ 最终海报存储失败:', error);
      throw new Error('最终海报存储失败');
    }
  }

  /**
   * 上传海报模板图片
   * 用于管理海报模板
   */
  async uploadTemplateImage(imageBuffer, templateName) {
    try {
      console.log(`📤 上传海报模板 - 模板: ${templateName}`);

      const fileName = `${this.paths.templates}/${templateName}.jpg`;

      // 模板图片处理：标准化尺寸和格式
      const processedBuffer = await this.processTemplateImage(imageBuffer);

      // 上传到Vercel Blob
      const blob = await put(fileName, processedBuffer, {
        access: 'public',
        token: this.blobToken
      });

      console.log('✅ 海报模板上传成功:', blob.url);
      return blob.url;

    } catch (error) {
      console.error('❌ 海报模板上传失败:', error);
      throw new Error('海报模板上传失败');
    }
  }

  /**
   * 处理用户图片用于AI生成
   * 保持较高质量，调整合适尺寸
   */
  async processImageForAI(buffer) {
    try {
      console.log('🖼️ 处理图片用于AI生成...');

      const processedImage = await sharp(buffer)
        .resize(1024, 1024, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 90, // 较高质量用于AI处理
          progressive: true
        })
        .toBuffer();

      console.log('✅ AI用图片处理完成');
      return processedImage;

    } catch (error) {
      console.error('❌ AI用图片处理失败:', error);
      throw new Error('图片处理失败');
    }
  }

  /**
   * 处理海报模板图片
   */
  async processTemplateImage(buffer) {
    try {
      console.log('🖼️ 处理海报模板图片...');

      const processedImage = await sharp(buffer)
        .resize(1024, 1024, {
          fit: 'cover', // 覆盖模式确保尺寸一致
          position: 'center'
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();

      console.log('✅ 海报模板处理完成');
      return processedImage;

    } catch (error) {
      console.error('❌ 海报模板处理失败:', error);
      throw new Error('模板图片处理失败');
    }
  }

  /**
   * 验证图片格式（复用原有逻辑）
   */
  isValidImageFormat(buffer) {
    // 检查常见图片格式的魔数
    const signatures = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46],
      webp: [0x52, 0x49, 0x46, 0x46]
    };

    for (const [format, signature] of Object.entries(signatures)) {
      if (this.checkSignature(buffer, signature)) {
        console.log('✅ 检测到图片格式:', format);
        return true;
      }
    }

    console.log('❌ 不支持的图片格式');
    return false;
  }

  /**
   * 检查文件签名
   */
  checkSignature(buffer, signature) {
    if (buffer.length < signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取图片信息
   */
  async getImageInfo(buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: buffer.length,
        hasAlpha: metadata.hasAlpha
      };
    } catch (error) {
      console.error('❌ 获取图片信息失败:', error);
      return null;
    }
  }

  /**
   * 添加水印到图片
   * @param {Buffer} imageBuffer - 原始图片Buffer
   * @returns {Buffer} - 带水印的图片Buffer
   */
  async addWatermark(imageBuffer) {
    try {
      console.log('🔖 开始添加水印...');
      const image = sharp(imageBuffer);
      const { width, height } = await image.metadata();
      
      console.log(`🔖 图片尺寸: ${width}x${height}`);
      
      // 🚨 简化版本：直接在右下角画一个红色矩形（确保在生产环境可见）
      const rectSize = Math.max(100, Math.floor(Math.min(width, height) / 15));
      const rectX = width - rectSize - 20;
      const rectY = height - rectSize - 20;
      
      console.log(`🔖 红色矩形测试: 大小=${rectSize}x${rectSize}, 位置=(${rectX}, ${rectY})`);
      
      // 创建红色矩形水印
      const rectSvg = `
        <svg width="${width}" height="${height}">
          <rect
            x="${rectX}"
            y="${rectY}"
            width="${rectSize}"
            height="${rectSize}"
            fill="red"
            fill-opacity="0.8"/>
          <text
            x="${rectX + rectSize/2}"
            y="${rectY + rectSize/2}"
            font-family="Arial, sans-serif"
            font-size="20"
            fill="white"
            text-anchor="middle"
            dominant-baseline="central">
            TEST
          </text>
        </svg>
      `;
      
      console.log('🔧 合成红色矩形水印...');
      const watermarkedImage = await image
        .composite([{
          input: Buffer.from(rectSvg),
          top: 0,
          left: 0
        }])
        .jpeg({ quality: 95 })
        .toBuffer();
      
      console.log(`✅ 红色矩形水印添加成功！原图: ${(imageBuffer.length / 1024).toFixed(2)}KB → 水印图: ${(watermarkedImage.length / 1024).toFixed(2)}KB`);
      return watermarkedImage;
      
    } catch (error) {
      console.error('❌ 添加水印失败:', error);
      console.log('⚠️ 水印添加失败，返回原图');
      return imageBuffer;
    }
  }

  /**
   * 清理过期的临时图片（可选，用于定期清理）
   */
  async cleanupExpiredImages(daysToKeep = 7) {
    // TODO: 实现清理逻辑，删除超过指定天数的图片
    // 注意：需要Vercel Blob的删除API支持
    console.log(`🧹 清理 ${daysToKeep} 天前的图片...`);
    console.log('⏳ 清理功能待实现（需要Vercel Blob删除API支持）');
  }
}

module.exports = PosterImageService;
