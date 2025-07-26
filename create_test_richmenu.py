#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

def create_richmenu_image(filename, text, bg_color, text_color):
    # LINE Rich Menu標準尺寸
    width, height = 2500, 1686
    
    # 創建圖像
    img = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(img)
    
    # 嘗試加載字體，如果失敗則使用默認字體
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 120)
    except:
        try:
            font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 120)  
        except:
            font = ImageFont.load_default()
    
    # 計算文字位置
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    # 繪製文字
    draw.text((x, y), text, fill=text_color, font=font)
    
    # 保存圖像
    img.save(filename, 'PNG', optimize=True)
    print(f'✅ 創建圖片: {filename} ({width}x{height})')

# 創建主菜單圖片
create_richmenu_image(
    'assets/richmenu-main-test.png',
    '写真復活\n\n👋 手振り　🤝 寄り添い　🎨 個性化\n\n💳 購入　🌐 Website　📤 共享',
    '#42C76A',
    'white'
)

# 創建處理中菜單圖片  
create_richmenu_image(
    'assets/richmenu-processing-test.png',
    '写真復活\n\n🎬 動画生成中...\n\nお待ちください',
    '#FF6B6B', 
    'white'
)

print('🎉 測試Rich Menu圖片創建完成!') 