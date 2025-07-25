# OpenAI API 设置说明

## 环境变量配置

本项目使用OpenAI GPT-4o-mini进行日语到英语的智能翻译。

### Vercel环境变量设置

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 找到您的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加新的环境变量：

```
变量名: OPENAI_API_KEY
变量值: [您的OpenAI API Key]
Environment: Production, Preview, Development (全选)
```

5. 点击 **Save** 保存

### 本地开发设置（可选）

如果需要本地测试翻译功能，创建 `.env` 文件：

```bash
OPENAI_API_KEY=[您的OpenAI API Key]
```

**⚠️ 注意**: `.env` 文件已在 `.gitignore` 中，不会被提交到Git。

## 混合翻译系统

系统采用3层翻译策略：

1. **词典翻译** (0-1ms) - 常用短语快速匹配
2. **OpenAI翻译** (1-2s) - 复杂内容AI处理  
3. **通用模板** (0ms) - 兜底保障

## 成本控制

- 优先使用免费词典翻译
- 仅复杂内容调用OpenAI API
- 预计每月API成本: < $5 USD

## API Key 获取

1. 访问 [OpenAI Platform](https://platform.openai.com/api-keys)
2. 创建新的API Key
3. 复制Key并设置到Vercel环境变量中 