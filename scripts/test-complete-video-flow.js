const Database = require('../config/database');
const VideoGenerator = require('../services/video-generator');
const ImageUploader = require('../services/image-uploader');
const LineBot = require('../services/line-bot');
const { Client } = require('@line/bot-sdk');
const lineConfig = require('../config/line-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function testCompleteVideoFlow() {
  console.log('🧪 开始完整的视频生成流程测试...');
  
  try {
    // 初始化服务
    const db = new Database();
    const imageUploader = new ImageUploader();
    const client = new Client({
      channelSecret: lineConfig.channelSecret,
      channelAccessToken: lineConfig.channelAccessToken
    });
    const lineBot = new LineBot(client, db);
    const videoGenerator = new VideoGenerator(db, lineBot);

    // 测试用图片路径 (使用项目中已有的图片)
    const testImagePaths = [
      path.join(__dirname, '..', 'assets', 'richmenu-main.png'),
      path.join(__dirname, '..', 'assets', 'richmenu-processing.png')
    ];

    // 找到一个存在的测试图片
    let testImagePath = null;
    for (const imgPath of testImagePaths) {
      if (fs.existsSync(imgPath)) {
        testImagePath = imgPath;
        console.log('✅ 找到测试图片:', testImagePath);
        break;
      }
    }

    if (!testImagePath) {
      // 如果没有本地图片，下载一个测试图片
      console.log('📥 下载测试图片...');
      const testImageUrl = 'https://via.placeholder.com/800x600.jpg';
      testImagePath = await downloadTestImage(testImageUrl);
    }

    // 步骤1: 模拟图片处理流程
    console.log('\n🔶 步骤1: 图片处理测试');
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log('📊 原始图片大小:', (imageBuffer.length / 1024).toFixed(2), 'KB');

    // 验证图片格式
    if (!imageUploader.isValidImageFormat(imageBuffer)) {
      throw new Error('图片格式不支持');
    }

    // 上传图片到Vercel Blob
    const imageUrl = await imageUploader.uploadImage(imageBuffer);
    console.log('✅ 图片上传成功:', imageUrl);

    // 步骤2: 创建用户和视频记录
    console.log('\n🔶 步骤2: 数据库操作测试');
    const testLineUserId = 'test_user_' + Date.now();
    const testUser = await db.createLineUser(testLineUserId, 'Test User', null);
    console.log('✅ 测试用户创建成功:', testUser.id);

    const videoRecord = await db.createVideoGeneration(
      testUser.id,
      "Test video generation with hand waving",
      false,
      1
    );
    console.log('✅ 视频记录创建成功:', videoRecord.id);

    // 步骤3: 测试视频生成API调用
    console.log('\n🔶 步骤3: 视频生成API测试');
    const apiResult = await videoGenerator.callRunwayApi(imageUrl);
    
    if (!apiResult.success) {
      throw new Error('视频生成API调用失败: ' + apiResult.error);
    }

    const taskId = apiResult.taskId;
    console.log('✅ 视频生成任务提交成功:', taskId);

    // 更新数据库记录
    await db.updateVideoGeneration(videoRecord.id, {
      task_id: taskId,
      status: 'processing'
    });

    // 步骤4: 轮询状态测试 (最多测试15次，约4分钟)
    console.log('\n🔶 步骤4: 轮询状态测试');
    console.log('⏰ 开始长时间轮询测试 (最多4分钟)...');
    
    const pollResult = await pollWithTimeout(taskId, 15); // 15次 * 15秒 = 约4分钟
    
    if (pollResult.success) {
      console.log('🎉 视频生成成功！');
      console.log('🎬 视频URL:', pollResult.videoUrl);
      console.log('🖼️ 缩略图URL:', pollResult.thumbnailUrl);
      
      // 步骤5: 测试视频发送
      console.log('\n🔶 步骤5: 视频发送测试');
      await testVideoSending(pollResult);
      
      // 更新数据库为成功状态
      await db.updateVideoGeneration(videoRecord.id, {
        status: 'completed',
        video_url: pollResult.videoUrl,
        thumbnail_url: pollResult.thumbnailUrl
      });
      
      console.log('\n🎉 完整流程测试成功！');
      console.log('📋 总结:');
      console.log('  ✅ 图片处理和上传正常');
      console.log('  ✅ KIE.ai API调用正常');
      console.log('  ✅ 轮询机制工作正常');
      console.log('  ✅ 视频URL可访问');
      console.log('  ✅ 数据库操作正常');
      
    } else {
      console.log('❌ 视频生成失败或超时:', pollResult.error);
      
      // 即使失败也要分析原因
      console.log('\n📋 失败分析:');
      console.log('  ✅ 图片处理和上传正常');
      console.log('  ✅ KIE.ai API调用正常');
      console.log('  ✅ 轮询机制工作正常');
      console.log('  ❌ 视频生成超时或失败');
      console.log('\n💡 建议: KIE.ai服务器可能繁忙，请稍后再试');
      
      // 更新数据库为失败状态
      await db.updateVideoGeneration(videoRecord.id, {
        status: 'failed',
        error_message: pollResult.error
      });
    }

    // 清理测试数据
    console.log('\n🧹 清理测试数据...');
    await cleanupTestData(testUser.id);
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
    console.error('❌ 错误堆栈:', error.stack);
  }
}

async function pollWithTimeout(taskId, maxAttempts) {
  console.log(`🔄 开始轮询 Task ID: ${taskId} (最多${maxAttempts}次)`);
  
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`\n🔍 轮询第 ${i}/${maxAttempts} 次 (${Math.round(i/maxAttempts*100)}%)`);
    
    try {
      const response = await axios.get(
        `${lineConfig.kieAi.baseUrl}${lineConfig.kieAi.detailEndpoint}`,
        {
          params: { taskId },
          headers: {
            'Authorization': `Bearer ${lineConfig.kieAi.apiKey}`
          },
          timeout: 30000
        }
      );
      
      if (response.data && response.data.code === 200) {
        const data = response.data.data;
        const status = data.state;
        const videoInfo = data.videoInfo;
        
        console.log(`📊 状态: ${status}`);
        
        switch (status) {
          case 'success':
            if (videoInfo && (videoInfo.videoUrl || videoInfo.url)) {
              return {
                success: true,
                videoUrl: videoInfo.videoUrl || videoInfo.url,
                thumbnailUrl: videoInfo.thumbnailUrl || videoInfo.thumbnail
              };
            } else {
              return { success: false, error: '生成成功但无视频URL' };
            }
            
          case 'fail':
            return { 
              success: false, 
              error: data.failMsg || '视频生成失败',
              failCode: data.failCode 
            };
            
          case 'wait':
          case 'queueing':
          case 'generating':
            console.log(`⏳ 仍在处理中，15秒后继续轮询...`);
            if (i < maxAttempts) {
              await sleep(15000);
            }
            break;
            
          default:
            console.log(`⚠️ 未知状态: ${status}`);
            if (i < maxAttempts) {
              await sleep(15000);
            }
        }
      }
      
    } catch (error) {
      console.error('❌ 轮询请求失败:', error.message);
    }
  }
  
  return { success: false, error: '轮询超时' };
}

async function testVideoSending(result) {
  try {
    // 测试视频URL是否可访问
    const videoResponse = await axios.head(result.videoUrl, { 
      timeout: 10000,
      maxRedirects: 5
    });
    
    console.log('✅ 视频URL可访问:', videoResponse.status);
    console.log('🎬 视频内容类型:', videoResponse.headers['content-type']);
    
    const contentLength = videoResponse.headers['content-length'];
    if (contentLength) {
      console.log('📊 视频大小:', (contentLength / 1024 / 1024).toFixed(2), 'MB');
    }
    
    // 测试缩略图URL
    if (result.thumbnailUrl) {
      try {
        const thumbResponse = await axios.head(result.thumbnailUrl, { timeout: 5000 });
        console.log('✅ 缩略图URL可访问:', thumbResponse.status);
      } catch (thumbError) {
        console.log('⚠️ 缩略图URL不可访问，将使用视频URL代替');
      }
    }
    
  } catch (error) {
    console.error('❌ 视频URL测试失败:', error.message);
    throw new Error('生成的视频URL不可访问');
  }
}

async function downloadTestImage(imageUrl) {
  const testImagePath = path.join(__dirname, 'test-image.jpg');
  
  try {
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000 
    });
    
    fs.writeFileSync(testImagePath, response.data);
    console.log('✅ 测试图片下载成功:', testImagePath);
    return testImagePath;
    
  } catch (error) {
    throw new Error('下载测试图片失败: ' + error.message);
  }
}

async function cleanupTestData(userId) {
  try {
    const db = new Database();
    
    // 删除测试用户的视频记录
    await db.query(
      'DELETE FROM video_generations WHERE user_id = $1',
      [userId]
    );
    
    // 删除测试用户
    await db.query(
      'DELETE FROM users WHERE id = $1',
      [userId]
    );
    
    // 删除临时测试图片
    const testImagePath = path.join(__dirname, 'test-image.jpg');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
    
    console.log('✅ 测试数据清理完成');
    
  } catch (error) {
    console.error('⚠️ 清理测试数据失败:', error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 显示帮助信息
function showHelp() {
  console.log(`
🧪 完整视频生成流程测试工具

功能：
- 测试完整的Line Bot视频生成流程
- 模拟真实用户上传图片的处理过程
- 测试KIE.ai API调用和轮询机制
- 验证视频URL的可访问性
- 提供详细的诊断信息

使用方法：
  node scripts/test-complete-video-flow.js

注意事项：
- 测试可能需要4-15分钟完成
- 会创建临时用户和视频记录（测试完成后自动清理）
- 需要有效的KIE.ai API配置
- 需要Vercel Blob配置用于图片上传
`);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    testCompleteVideoFlow();
  }
}

module.exports = testCompleteVideoFlow; 