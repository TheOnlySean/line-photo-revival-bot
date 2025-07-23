#!/usr/bin/env python3
"""
创建简单的Rich Menu测试图片
符合LINE要求：2500x1686px, <1MB
"""

import os
from PIL import Image, ImageDraw, ImageFont
import sys

def create_simple_richmenu(output_path, menu_type='main'):
    """创建简单的Rich Menu图片"""
    
    # 创建2500x1686的白色背景图片
    img = Image.new('RGB', (2500, 1686), color='white')
    draw = ImageDraw.Draw(img)
    
    # 定义6个区域的边界和颜色
    areas = [
        {'bounds': (0, 0, 833, 843), 'color': '#FF6B6B', 'text': '手振り\n動画生成'},
        {'bounds': (833, 0, 1667, 843), 'color': '#4ECDC4', 'text': '寄り添い\n動画生成'},
        {'bounds': (1667, 0, 2500, 843), 'color': '#45B7D1', 'text': 'パーソナライズ\n動画生成'},
        {'bounds': (0, 843, 833, 1686), 'color': '#96CEB4', 'text': 'ポイント\n購入'},
        {'bounds': (833, 843, 1667, 1686), 'color': '#FFEAA7', 'text': '公式\nサイト'},
        {'bounds': (1667, 843, 2500, 1686), 'color': '#DDA0DD', 'text': '友達に\nシェア'}
    ]
    
    if menu_type == 'processing':
        # 处理中菜单：整个区域显示"生成中"
        draw.rectangle([0, 0, 2500, 1686], fill='#FFE4B5')
        
        # 添加大文字
        try:
            font = ImageFont.truetype("Arial.ttc", 120)
        except:
            font = ImageFont.load_default()
        
        text = "🎬 動画生成中...\n\nタップして進捗確認"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (2500 - text_width) // 2
        y = (1686 - text_height) // 2
        
        draw.text((x, y), text, fill='#8B4513', font=font, align='center')
        
    else:
        # 主菜单：6个彩色区域
        for area in areas:
            x1, y1, x2, y2 = area['bounds']
            
            # 填充颜色
            draw.rectangle([x1, y1, x2, y2], fill=area['color'])
            
            # 添加边框
            draw.rectangle([x1, y1, x2, y2], outline='#333333', width=8)
            
            # 添加文字
            try:
                font = ImageFont.truetype("Arial.ttc", 72)
            except:
                font = ImageFont.load_default()
            
            text = area['text']
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # 文字居中
            text_x = x1 + (x2 - x1 - text_width) // 2
            text_y = y1 + (y2 - y1 - text_height) // 2
            
            draw.text((text_x, text_y), text, fill='white', font=font, align='center')
    
    # 保存为PNG，使用优化设置
    img.save(output_path, 'PNG', optimize=True, compress_level=9)
    
    # 检查文件大小
    file_size = os.path.getsize(output_path)
    print(f"✅ 创建{menu_type}菜单: {os.path.basename(output_path)}")
    print(f"📊 文件大小: {file_size / 1024:.2f}KB")
    
    return file_size < 1024 * 1024  # 检查是否小于1MB

def main():
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets')
    
    print("🎨 创建简单的Rich Menu测试图片...")
    print(f"📁 保存目录: {assets_dir}")
    
    # 备份现有文件
    for filename in ['richmenu-main.png', 'richmenu-processing.png']:
        original_path = os.path.join(assets_dir, filename)
        if os.path.exists(original_path):
            backup_path = original_path + '.original'
            if not os.path.exists(backup_path):
                os.rename(original_path, backup_path)
                print(f"📦 备份原文件: {filename} → {filename}.original")
    
    success_count = 0
    
    # 创建主菜单
    main_path = os.path.join(assets_dir, 'richmenu-main.png')
    if create_simple_richmenu(main_path, 'main'):
        success_count += 1
    
    # 创建处理中菜单
    processing_path = os.path.join(assets_dir, 'richmenu-processing.png')
    if create_simple_richmenu(processing_path, 'processing'):
        success_count += 1
    
    print(f"\n🎯 创建完成: {success_count}/2 个文件")
    
    if success_count == 2:
        print("✅ Rich Menu图片创建成功，可以测试功能了！")
        print("🔄 如需使用原图片，请重命名.original文件")
        return 0
    else:
        print("❌ 部分图片创建失败")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 