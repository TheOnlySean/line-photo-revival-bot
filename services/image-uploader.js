const { put } = require('@vercel/blob');
const crypto = require('crypto');
const sharp = require('sharp');
const lineConfig = require('../config/line-config');

class ImageUploader {
  constructor() {
    this.blobToken = lineConfig.blobToken;
  }

  // 上传图片到Vercel Blob
  async uploadImage(imageBuffer) {
    try {
      console.log('📤 开始上传图片...');

      // 生成唯一文件名
      const fileId = crypto.randomUUID();
      const fileName = `line-uploads/${fileId}.jpg`;

      // 图片处理：压缩和格式标准化
      const processedBuffer = await this.processImage(imageBuffer);

      // 上传到Vercel Blob
      const blob = await put(fileName, processedBuffer, {
        access: 'public',
        token: this.blobToken
      });

      console.log('✅ 图片上传成功:', blob.url);
      return blob.url;

    } catch (error) {
      console.error('❌ 图片上传失败:', error);
      throw new Error('图片上传失败');
    }
  }

  // 处理图片：压缩、调整大小、格式转换
  async processImage(buffer) {
    try {
      console.log('🖼️ 开始处理图片...');

      const processedImage = await sharp(buffer)
        .resize(1024, 1024, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();

      console.log('✅ 图片处理完成');
      return processedImage;

    } catch (error) {
      console.error('❌ 图片处理失败:', error);
      throw new Error('图片处理失败');
    }
  }

  // 从URL下载并上传图片（用于演示内容）
  async uploadFromUrl(imageUrl) {
    try {
      console.log('📥 从URL下载图片:', imageUrl);

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return await this.uploadImage(buffer);

    } catch (error) {
      console.error('❌ 从URL上传图片失败:', error);
      throw new Error('从URL上传图片失败');
    }
  }

  // 验证图片格式
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

  // 检查文件签名
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

  // 获取图片信息
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
}

module.exports = ImageUploader; 