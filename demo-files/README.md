# 📁 演示内容文件夹

这个文件夹用于存放LINE Bot的演示素材。

## 📋 文件要求

请在此文件夹中放置以下6个文件：

### 🖼️ 图片文件 (JPG格式)
- `demo1.jpg` - 复古美女照片
- `demo2.jpg` - 商务男士照片  
- `demo3.jpg` - 青春少女照片

### 🎬 视频文件 (MP4格式)
- `demo1.mp4` - 复古美女对应的AI生成视频
- `demo2.mp4` - 商务男士对应的AI生成视频
- `demo3.mp4` - 青春少女对应的AI生成视频

## 📐 文件规格建议

### 图片规格
- **格式**: JPG
- **尺寸**: 512x512px 或更大（建议正方形）
- **质量**: 高清，光线充足
- **内容**: 清晰的人物肖像，正面或侧面
- **大小**: 建议不超过2MB

### 视频规格  
- **格式**: MP4
- **尺寸**: 1:1 方形比例（如512x512px）
- **时长**: 5-8秒
- **质量**: 720p或更高
- **大小**: 建议不超过10MB

## 🚀 使用方法

准备好文件后，运行以下命令：

```bash
# 查看当前演示内容
npm run demo:view

# 上传演示文件到Vercel Blob并更新数据库
npm run demo:upload

# 或指定其他文件夹路径
node scripts/upload-demo-content.js upload /path/to/your/demo-files
```

## 💡 提示

1. **文件命名**: 必须严格按照上述命名规则
2. **配对关系**: demo1.jpg 对应 demo1.mp4，以此类推
3. **视频生成**: 可以先用KIE.AI Runway API生成视频，然后下载保存
4. **替代方案**: 如果已有其他云存储的URL，也可以直接编辑数据库

## 🔗 其他方式

如果你已经有现成的图片和视频URL，可以：

1. 编辑 `scripts/upload-demo-content.js` 中的 `exampleUrls`
2. 取消注释相关代码
3. 运行 `node scripts/upload-demo-content.js config` 