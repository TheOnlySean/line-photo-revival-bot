#!/usr/bin/env python3
"""
Rich Menu图片压缩脚本
将图片压缩到1MB以下，保持2500x1686分辨率
"""

import os
from PIL import Image
import sys

def compress_image(input_path, output_path, target_size_mb=1.0):
    """
    压缩图片到指定文件大小以下
    
    Args:
        input_path: 输入图片路径
        output_path: 输出图片路径
        target_size_mb: 目标文件大小(MB)
    """
    target_size_bytes = target_size_mb * 1024 * 1024
    
    print(f"📸 压缩图片: {os.path.basename(input_path)}")
    
    # 打开图片
    with Image.open(input_path) as img:
        # 确保尺寸正确 (2500x1686)
        if img.size != (2500, 1686):
            print(f"⚠️  调整尺寸: {img.size} → (2500, 1686)")
            img = img.resize((2500, 1686), Image.Resampling.LANCZOS)
        
        # 转换为RGB模式（如果需要）
        if img.mode in ('RGBA', 'LA', 'P'):
            print("🎨 转换为RGB模式")
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        
        # 尝试不同的质量级别进行压缩
        for quality in range(95, 20, -5):
            img.save(output_path, 'PNG', optimize=True, quality=quality)
            
            # 检查文件大小
            file_size = os.path.getsize(output_path)
            print(f"🎯 质量 {quality}: {file_size / 1024 / 1024:.2f}MB")
            
            if file_size <= target_size_bytes:
                print(f"✅ 压缩成功! 文件大小: {file_size / 1024 / 1024:.2f}MB")
                return True
        
        # 如果PNG压缩不够，尝试JPEG
        print("🔄 尝试JPEG格式...")
        jpeg_output = output_path.replace('.png', '.jpg')
        
        for quality in range(95, 30, -5):
            img.save(jpeg_output, 'JPEG', optimize=True, quality=quality)
            
            file_size = os.path.getsize(jpeg_output)
            print(f"📷 JPEG质量 {quality}: {file_size / 1024 / 1024:.2f}MB")
            
            if file_size <= target_size_bytes:
                # 将JPEG转换回PNG（保持兼容性）
                with Image.open(jpeg_output) as jpeg_img:
                    jpeg_img.save(output_path, 'PNG', optimize=True)
                os.remove(jpeg_output)
                
                final_size = os.path.getsize(output_path)
                print(f"✅ JPEG转PNG压缩成功! 最终大小: {final_size / 1024 / 1024:.2f}MB")
                return True
        
        print("❌ 无法压缩到目标大小")
        return False

def main():
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets')
    
    images_to_compress = [
        ('richmenu-main.png', 'richmenu-main-compressed.png'),
        ('richmenu-processing.png', 'richmenu-processing-compressed.png')
    ]
    
    print("🎨 开始压缩Rich Menu图片...")
    print(f"📁 资源目录: {assets_dir}")
    
    success_count = 0
    
    for original_name, compressed_name in images_to_compress:
        original_path = os.path.join(assets_dir, original_name)
        compressed_path = os.path.join(assets_dir, compressed_name)
        
        if not os.path.exists(original_path):
            print(f"⚠️  文件不存在: {original_name}")
            continue
        
        original_size = os.path.getsize(original_path)
        print(f"\n📊 原始文件: {original_name} ({original_size / 1024 / 1024:.2f}MB)")
        
        if compress_image(original_path, compressed_path):
            success_count += 1
            
            # 替换原文件
            backup_path = original_path + '.backup'
            os.rename(original_path, backup_path)
            os.rename(compressed_path, original_path)
            
            new_size = os.path.getsize(original_path)
            print(f"🔄 已替换原文件 (备份: {os.path.basename(backup_path)})")
            print(f"📈 压缩率: {(1 - new_size/original_size)*100:.1f}%")
        else:
            print(f"❌ {original_name} 压缩失败")
    
    print(f"\n🎯 压缩完成: {success_count}/2 个文件成功")
    
    if success_count == 2:
        print("✅ 所有图片已成功压缩，可以创建Rich Menu了！")
        return 0
    else:
        print("❌ 部分图片压缩失败，请检查图片文件")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 