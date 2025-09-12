# 🖼️ Rich Menu图片更新指南

## ✅ 已完成的配置更新

### 1. Rich Menu按钮配置已更新 ✅
所有相关配置文件已修改：
- ✅ `api/setup/production-richmenu.js` - 生产环境配置
- ✅ `scripts/reset-richmenu.js` - 重置脚本配置  
- ✅ `scripts/update-richmenu-with-new-images.js` - 更新脚本配置
- ✅ `assets/README.md` - 文档更新

**按钮变更**：
- 第一行中间按钮：`寄り添い` → `昭和カバー` 
- Action变更：`action=GROUP_VIDEO` → `action=CREATE_POSTER`

---

## 🔄 需要手动操作：替换Rich Menu图片

### 步骤1: 准备新图片
您提供的新Rich Menu图片需要满足以下规格：
- **尺寸**: 2500 x 1686 像素
- **格式**: JPEG 或 PNG  
- **文件大小**: 最大 1MB
- **文件名**: `richmenu-main-resized.jpg`

### 步骤2: 替换图片文件
请按以下方式替换图片：

**方法A: 直接替换**
```bash
# 将您的新图片文件复制到assets文件夹
cp /path/to/your/new-richmenu-image.jpg assets/richmenu-main-resized.jpg
```

**方法B: 使用终端命令**
```bash
cd /Users/x.sean/Desktop/写真復活Line版/assets/
# 删除现有的无效文件
rm richmenu-main-resized.jpg
# 复制您的新图片到这个位置，并重命名
cp /path/to/your/image.jpg richmenu-main-resized.jpg
```

### 步骤3: 验证图片文件
```bash
# 检查文件大小（应该远大于215字节）
ls -la assets/richmenu-main-resized.jpg
```

### 步骤4: 部署新Rich Menu
替换图片后，运行以下脚本更新LINE平台的Rich Menu：

**生产环境更新**：
```bash
# 调用生产环境Rich Menu设置API
curl -X POST "https://your-domain.vercel.app/api/setup/production-richmenu" \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-admin-secret"}'
```

**开发环境更新**：
```bash
node scripts/reset-richmenu.js
```

---

## 📋 当前状态总结

### ✅ 已完成
1. **数据库架构** - 海报配额字段已添加
2. **配额管理函数** - 完全实现并测试通过
3. **Rich Menu配置** - 所有配置文件已更新
4. **按钮映射** - `CREATE_POSTER` action已设置

### 🔄 待完成
1. **图片文件替换** - 需要手动操作（本文档指导）
2. **KIE.AI API集成** - 海报生成服务
3. **Event Handler** - 处理CREATE_POSTER事件
4. **图片存储服务** - 临时文件存储
5. **海报模板系统** - 模板数据库

---

## 🚨 重要提示

**图片文件路径**：
- 当前位置：`/Users/x.sean/Desktop/写真復活Line版/assets/richmenu-main-resized.jpg`
- 当前状态：**无效文件（215字节）**
- 需要替换：**您的新昭和カバー图片**

**替换完成后，请确认**：
1. 文件大小正常（应该几百KB）
2. 图片可以正常打开
3. 运行更新脚本推送到LINE平台

---

## 🔍 故障排除

如果遇到问题，请检查：
1. 图片文件是否存在且大小正常
2. 文件权限是否正确
3. LINE平台的Rich Menu是否成功更新

完成图片替换后，我们就可以继续下一步：实现海报生成的业务逻辑！
