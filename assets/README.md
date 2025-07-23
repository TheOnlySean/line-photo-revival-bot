# Rich Menu 图片要求

## 文件位置
- `richmenu-main.png` - 主菜单图片 (2500x1686px)
- `richmenu-processing.png` - 处理中菜单图片 (2500x1686px)

## 图片规格
- **格式**: JPEG 或 PNG
- **尺寸**: 2500x1686 像素
- **文件大小**: 最大 1MB
- **色彩模式**: RGB

## 布局设计 (6个区域)

```
区域1: 手振り動画生成    区域2: 寄り添い動画生成    区域3: パーソナライズ動画
(0,0 - 833,843)        (833,0 - 1667,843)       (1667,0 - 2500,843)

区域4: ポイント購入      区域5: 公式サイト         区域6: 友達にシェア  
(0,843 - 833,1686)     (833,843 - 1667,1686)    (1667,843 - 2500,1686)
```

## Postback Action设置
- 区域1: `action=wave&mode=video_generation`
- 区域2: `action=group&mode=video_generation`  
- 区域3: `action=custom&mode=video_generation`
- 区域4: `action=credits&mode=purchase`
- 区域5: URI - `https://angelsphoto.ai`
- 区域6: `action=share&mode=referral` 