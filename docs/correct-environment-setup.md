# 正确的环境配置方案

## 🎯 一个项目，两个环境

使用同一个 Vercel 项目，通过环境变量区分开发和生产环境。

## 🔑 Vercel 环境变量配置

在 **同一个 Vercel 项目** 的 Settings → Environment Variables 中设置：

### 🟡 Development 环境变量
```env
# 环境: Development
LINE_CHANNEL_SECRET = e9bd551af7f1c36500d0764a3edb6562
LINE_CHANNEL_ACCESS_TOKEN = 7uB4UmaonelwPyjgnngdA0OQRCugGweLYP5jLYRhkCUh6C4HS8ugK7DbyxyDDgQxo0PK9+GljmxVPW3EHv+QPsrzToEmrz12ERPNEimHmV6rIIwNWj6Qpo8yep6NyMmWyYfLtAbvvdvBMnU2EjpmZQdB04t89/1O/w1cDnyilFU=
LINE_CHANNEL_ID = 2005541661
NODE_ENV = development

# 共用变量（所有环境）
DATABASE_URL = postgresql://neondb_owner:npg_5BVRk8NOJIFf@ep-square-haze-afdewteo-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
KIE_AI_API_KEY = 77b10ad6945bf20dc236bad15de1e6b3
STRIPE_SECRET_KEY = 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
STRIPE_WEBHOOK_SECRET = [您的Webhook密钥]
BLOB_READ_WRITE_TOKEN = vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod
```

### 🔴 Production 环境变量
```env
# 环境: Production  
LINE_CHANNEL_SECRET = [新的正式账号Secret]
LINE_CHANNEL_ACCESS_TOKEN = [新的正式账号Token]
LINE_CHANNEL_ID = [新的正式账号ID]
NODE_ENV = production

# 共用变量（与Development相同）
DATABASE_URL = postgresql://neondb_owner:npg_5BVRk8NOJIFf@ep-square-haze-afdewteo-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
KIE_AI_API_KEY = 77b10ad6945bf20dc236bad15de1e6b3
STRIPE_SECRET_KEY = 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
STRIPE_WEBHOOK_SECRET = [相同的Webhook密钥]
BLOB_READ_WRITE_TOKEN = vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod
```

## 📱 LINE Webhook 配置

### 🟡 开发环境 LINE Channel（原有测试账号）
```
Webhook URL: [开发分支的Vercel域名]/webhook
例如: https://line-photo-revival-bot-git-main-yourname.vercel.app/webhook
```

### 🔴 生产环境 LINE Channel（新的正式账号）
```
Webhook URL: https://line-photo-revival-bot.vercel.app/webhook
```

## 🚀 工作流程

```
开发流程:
1. 在本地或开发分支开发新功能
2. 推送到 development 分支 → 触发 Development 环境部署
3. 使用原有 LINE 测试账号测试功能
4. 功能确认无误后合并到 main 分支
5. main 分支 → 触发 Production 环境部署
6. 新的正式 LINE 账号自动使用新功能
```

## ✅ 配置优势

- ✅ **单项目管理**: 只需维护一个 Vercel 项目
- ✅ **自动域名**: Vercel 自动为不同环境分配域名
- ✅ **环境隔离**: 通过数据库 environment 字段完全隔离
- ✅ **简化部署**: 标准的 Git → Vercel 自动部署流程
- ✅ **成本节约**: 不需要额外的项目和资源

## 🔧 立即需要做的

1. 在现有 Vercel 项目中添加 Production 环境变量
2. 在新的 LINE 正式账号设置 Webhook: `https://line-photo-revival-bot.vercel.app/webhook`
3. 测试两个环境的功能隔离 