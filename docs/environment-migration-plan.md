# LINE Bot 环境分离迁移计划

## 📋 概述

将现有的 LINE Bot 项目分离为开发环境和生产环境，确保新功能可以在开发环境充分测试后再部署到生产环境。

### 🎯 目标
- **Development Environment**: 保留现有 LINE 账号用于开发测试
- **Production Environment**: 创建新的 LINE 账号作为正式服务

---

## 🚀 迁移步骤

### Phase 1: 创建生产环境 LINE 账号

#### 1.1 创建新的 LINE Developer 账号
1. 登录 [LINE Developer Console](https://developers.line.biz/console/)
2. 创建新的 Provider（建议命名：`Angels Photo Production`）
3. 在新 Provider 下创建新的 Messaging API Channel
   - Channel Name: `写真復活 - 正式服务`
   - Channel Description: `AI写真復活服务正式版`
   - Category: `Entertainment`
   - Subcategory: `Photography`

#### 1.2 配置生产环境 Channel 设置
```yaml
Channel Settings:
  - Use webhooks: ✅ Enabled
  - Webhook URL: https://line-photo-revival-bot.vercel.app/webhook
  - Allow bot to join group chats: ❌ Disabled
  - Auto-reply messages: ❌ Disabled
  - Greeting messages: ❌ Disabled
```

#### 1.3 获取生产环境密钥
记录以下信息：
```
Channel ID: [新的Channel ID]
Channel Secret: [新的Channel Secret]  
Channel Access Token: [新的Long-lived Access Token]
```

---

### Phase 2: 数据库环境标识配置 (共用数据库)

#### 2.1 添加环境标识字段
为了区分开发和生产环境的数据，在相关表中添加 `environment` 字段：

```sql
-- 为 users 表添加环境标识
ALTER TABLE users ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'development';

-- 为 videos 表添加环境标识  
ALTER TABLE videos ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'development';

-- 为 subscriptions 表添加环境标识
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'development';

-- 创建索引提高查询效率
CREATE INDEX IF NOT EXISTS idx_users_environment ON users(environment);
CREATE INDEX IF NOT EXISTS idx_videos_environment ON videos(environment);  
CREATE INDEX IF NOT EXISTS idx_subscriptions_environment ON subscriptions(environment);
```

#### 2.2 更新数据库查询逻辑
所有数据库查询都需要加上环境过滤条件：
```javascript
// 示例：获取用户时加上环境过滤
const user = await db.query(
  'SELECT * FROM users WHERE line_user_id = $1 AND environment = $2',
  [lineUserId, process.env.NODE_ENV || 'development']
);
```

---

### Phase 3: Stripe 环境标识配置 (共用 API)

#### 3.1 通过 Stripe Metadata 区分环境
使用 Stripe 的 `metadata` 字段来标识环境：

```javascript
// 创建 Checkout Session 时添加环境标识  
const session = await stripe.checkout.sessions.create({
  // ...其他配置
  metadata: {
    environment: process.env.NODE_ENV || 'development',
    line_user_id: userId
  }
});
```

#### 3.2 Webhook 处理环境区分
在 Stripe Webhook 中根据 metadata 处理不同环境的数据：
```javascript
const environment = event.data.object.metadata?.environment || 'development';
if (environment !== process.env.NODE_ENV) {
  console.log(`跳过 ${environment} 环境的事件`);
  return;
}
```

---

### Phase 4: 设置 Vercel 环境变量

#### 4.1 开发环境变量 (现有项目)
保持现有配置不变：
```env
# LINE 配置 (开发环境)
LINE_CHANNEL_SECRET=e9bd551af7f1c36500d0764a3edb6562
LINE_CHANNEL_ACCESS_TOKEN=7uB4UmaonelwPyjgnngdA0OQRCugGweLYP5jLYRhkCUh6C4HS8ugK7DbyxyDDgQxo0PK9+GljmxVPW3EHv+QPsrzToEmrz12ERPNEimHmV6rIIwNWj6Qpo8yep6NyMmWyYfLtAbvvdvBMnU2EjpmZQdB04t89/1O/w1cDnyilFU=
LINE_CHANNEL_ID=2005541661

# 数据库 (共用)
DATABASE_URL=postgresql://neondb_owner:npg_5BVRk8NOJIFf@ep-square-haze-afdewteo-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require

# KIE.AI (共用)
KIE_AI_API_KEY=77b10ad6945bf20dc236bad15de1e6b3

# Stripe (共用)
STRIPE_SECRET_KEY=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
STRIPE_WEBHOOK_SECRET=[Webhook密钥]

# Vercel Blob (共用)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod

# 环境标识
NODE_ENV=development
```

#### 4.2 生产环境变量 (新项目)
创建新的 Vercel 项目，只需要修改 LINE 配置：
```env
# LINE 配置 (新的生产环境密钥)
LINE_CHANNEL_SECRET=[新的Production Channel Secret]
LINE_CHANNEL_ACCESS_TOKEN=[新的Production Access Token]  
LINE_CHANNEL_ID=[新的Production Channel ID]

# 数据库 (共用 - 相同配置)
DATABASE_URL=postgresql://neondb_owner:npg_5BVRk8NOJIFf@ep-square-haze-afdewteo-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require

# KIE.AI (共用 - 相同配置)
KIE_AI_API_KEY=77b10ad6945bf20dc236bad15de1e6b3

# Stripe (共用 - 相同配置)
STRIPE_SECRET_KEY=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
STRIPE_WEBHOOK_SECRET=[相同的Webhook密钥]

# Vercel Blob (共用 - 相同配置)  
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_GvZacS1zhqBA8QZQ_9dxdeLTVNP4jIpjhP7HhXPyQbWfPod

# 环境标识 (关键区别)
NODE_ENV=production
```

---

### Phase 5: 代码适配环境分离

#### 5.1 修改配置文件支持环境区分
更新 `config/line-config.js`：
```javascript
const lineConfig = {
  // 根据环境变量动态选择配置
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelId: process.env.LINE_CHANNEL_ID,
  
  // 环境标识
  environment: process.env.NODE_ENV || 'development',
  
  // 其他配置...
};
```

#### 5.2 添加环境标识显示
在日志和错误信息中显示当前环境：
```javascript
console.log(`🚀 启动 ${process.env.NODE_ENV} 环境`);
```

---

### Phase 6: Rich Menu 分离配置

#### 6.1 为生产环境创建独立的 Rich Menu
1. 复制现有的 Rich Menu 图片资源
2. 上传到新的 LINE 账号
3. 更新 `config/richmenu-ids.json` 支持环境区分：

```json
{
  "development": {
    "main": "richmenu-xxx-dev",
    "processing": "richmenu-yyy-dev"
  },
  "production": {
    "main": "richmenu-xxx-prod", 
    "processing": "richmenu-yyy-prod"
  }
}
```

#### 6.2 更新 Rich Menu 管理脚本
修改脚本支持环境参数：
```bash
# 开发环境
node scripts/upload-richmenu-images.js --env=development

# 生产环境  
node scripts/upload-richmenu-images.js --env=production
```

---

### Phase 7: 部署和测试

#### 7.1 域名和项目配置
**推荐配置方案：**
```yaml
生产环境:
  Vercel Project: line-photo-revival-bot
  Domain: line-photo-revival-bot.vercel.app
  Branch: main (或 production)
  
开发环境:  
  Vercel Project: line-photo-revival-bot-dev
  Domain: line-photo-revival-bot-dev.vercel.app
  Branch: development (或 main)
```

**实施步骤：**
1. 创建新的 Vercel 项目：`line-photo-revival-bot` (生产环境)
2. 将现有项目重命名为：`line-photo-revival-bot-dev` (开发环境)
3. 配置对应的环境变量
4. 更新 LINE Channel 的 Webhook URL

#### 7.2 测试流程
1. **开发环境测试**：
   - 在开发 LINE 账号测试新功能
   - 确保所有功能正常运行
   - 验证数据库操作正确

2. **生产环境部署**：
   - 合并代码到 `production` 分支
   - 自动部署到生产环境
   - 在生产 LINE 账号进行最终验证

---

### Phase 8: 运维和监控

#### 8.1 环境区分策略
```
开发环境用途：
✅ 新功能开发测试
✅ Bug 修复验证  
✅ API 集成测试
✅ Rich Menu 调整测试

生产环境用途：
✅ 正式用户服务
✅ 稳定版本运行
✅ 性能监控
✅ 用户数据管理
```

#### 8.2 代码发布流程
```
1. 在 development 分支开发新功能
2. 在开发环境充分测试
3. 代码审查通过后合并到 main 分支  
4. 从 main 分支合并到 production 分支
5. 生产环境自动部署
6. 生产环境验证测试
```

---

## 📋 迁移检查清单

### 准备阶段
- [ ] 创建新的 LINE Developer Channel (生产环境)
- [ ] 数据库添加环境标识字段 (共用现有数据库)
- [ ] 更新 Stripe Metadata 支持环境区分 (共用现有API)
- [ ] ~~申请新的 Vercel Blob Token~~ (共用现有Token)

### 配置阶段  
- [ ] 设置生产环境变量
- [ ] 修改代码支持环境区分
- [ ] 配置生产环境 Rich Menu
- [ ] 更新部署脚本

### 测试阶段
- [ ] 开发环境功能测试
- [ ] 生产环境部署测试
- [ ] 用户流程端到端测试
- [ ] 付费流程测试

### 上线阶段
- [ ] 生产环境正式发布
- [ ] 用户迁移通知
- [ ] 监控系统正常运行
- [ ] 建立运维文档

---

## 🎯 预期收益

### 开发效率提升
- ✅ 安全的功能测试环境
- ✅ 降低线上故障风险  
- ✅ 加快新功能迭代速度
- ✅ **简化配置管理**：共用数据库和API减少重复配置

### 用户体验改善
- ✅ 稳定的生产服务
- ✅ 减少服务中断时间
- ✅ 更好的服务质量保障
- ✅ **数据一致性**：统一的用户数据和订单管理

### 团队协作优化
- ✅ 清晰的环境职责分工
- ✅ 标准化的发布流程
- ✅ 可控的风险管理
- ✅ **维护成本降低**：减少数据库和API的管理复杂度

---

*📅 预计迁移时间：1-2个工作日* (共用配置大幅简化)
*👥 需要参与人员：开发团队* 