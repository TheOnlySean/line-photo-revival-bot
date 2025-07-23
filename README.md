# 写真復活 LINE Bot

将用户上传的照片转换为生动AI视频的LINE Bot服务。基于KIE.AI高性价比AI技术，提供快速、经济的视频生成体验。

## 🚀 功能特点

- ✨ **免费体验**：预设3张演示照片，用户可免费体验高性价比AI视频生成
- 🎬 **个性化视频**：用户上传照片生成专属AI视频
- 💎 **点数系统**：基于点数的付费模式，灵活计费
- 📱 **Rich Menu**：直观的底部菜单界面
- 🔄 **实时反馈**：生成过程状态实时推送
- 📊 **数据统计**：完整的用户行为和使用统计

## 🏗️ 技术架构

### 后端技术栈
- **Node.js + Express**：Web服务器框架
- **@line/bot-sdk**：LINE Bot SDK
- **PostgreSQL (Neon)**：数据库存储
- **Vercel Blob**：图片/视频文件存储
- **KIE.AI API**：AI视频生成服务

### 数据库设计
- **users**：用户信息和点数管理（复用映像工房数据库）
- **videos**：视频生成记录（复用映像工房数据库）
- **line_demo_contents**：演示内容管理
- **line_interactions**：用户交互日志

## 📦 安装和设置

### 1. 克隆项目
\`\`\`bash
git clone <repository-url>
cd line-photo-revival-bot
\`\`\`

### 2. 安装依赖
\`\`\`bash
npm install
\`\`\`

### 3. 配置环境变量

当前配置状态：
- ✅ **LINE Bot配置**：已配置测试账号
- ✅ **KIE.AI API**：已配置Runway API (高性价比模式)
- ✅ **Vercel Blob**：已配置存储服务
- ✅ **数据库**：已连接到映像工房Neon数据库

如需修改配置，编辑 \`config/line-config.js\` 文件。

### 4. 数据库初始化
\`\`\`bash
npm run init
\`\`\`

### 5. 测试API连接
\`\`\`bash
npm run test-api
\`\`\`

### 6. 启动服务器
\`\`\`bash
# 开发模式
npm run dev

# 生产模式
npm start
\`\`\`

## 🔧 LINE Bot配置

### 1. 创建LINE Channel
1. 登录 [LINE Developer Console](https://developers.line.biz/console/)
2. 创建新的Provider（如果没有）
3. 创建Messaging API Channel
4. 记录Channel Secret和Channel Access Token

### 2. 设置Webhook
在LINE Developer Console中：
- 启用Webhook
- 设置Webhook URL：\`https://your-domain.com/webhook\`
- 验证SSL证书

### 3. 配置Rich Menu
运行以下API来设置Rich Menu：
\`\`\`bash
curl -X GET "http://localhost:3000/api/rich-menu/setup"
\`\`\`

然后在LINE Developer Console手动上传Rich Menu图片。

## 🎯 用户交互流程

### 免费体验流程
1. 用户添加LINE Bot好友
2. 收到欢迎消息和使用指南
3. 点击"免费体验"查看演示照片
4. 选择照片，立即获得对应的AI视频
5. 引导用户注册购买点数

### 付费生成流程
1. 用户充值获得点数
2. 点击"生成视频"或直接上传照片
3. 系统检查点数并确认生成
4. 扣除点数，调用KIE.AI API
5. 生成完成后推送视频给用户

## 📊 API端点

### 核心端点
- \`POST /webhook\` - LINE Bot Webhook处理器
- \`GET /health\` - 服务健康检查

### 管理端点
- \`GET /api/rich-menu/setup\` - 设置Rich Menu
- \`GET /api/demo-contents\` - 获取演示内容
- \`POST /api/demo-contents\` - 添加演示内容
- \`GET /api/stats\` - 获取使用统计

## 🔨 开发和测试

### 本地开发
\`\`\`bash
# 安装nodemon用于热重载
npm install -g nodemon

# 启动开发服务器
npm run dev
\`\`\`

### 测试数据库连接
\`\`\`bash
npm run test-api
\`\`\`

### 查看日志
服务器会输出详细的运行日志，包括：
- 用户交互事件
- API调用状态
- 错误信息
- 数据库操作

## 📁 项目结构

\`\`\`
line-photo-revival-bot/
├── config/
│   ├── line-config.js          # LINE Bot配置
│   └── database.js             # 数据库连接和查询
├── services/
│   ├── line-bot.js             # LINE Bot核心服务
│   ├── message-handler.js      # 消息处理器
│   ├── video-generator.js      # 视频生成服务
│   └── image-uploader.js       # 图片上传服务
├── scripts/
│   └── init-demo-content.js    # 初始化脚本
├── server.js                   # 主服务器文件
├── package.json
└── README.md
\`\`\`

## 🚀 部署

### 使用Vercel部署
1. 连接GitHub仓库到Vercel
2. 配置环境变量
3. 部署后获得HTTPS域名
4. 更新LINE Bot的Webhook URL

### 使用其他云服务
确保：
- 支持Node.js运行环境
- 提供HTTPS访问
- 配置正确的环境变量

## 💡 使用建议

### 演示内容准备
1. 准备3张高质量的演示照片
2. 使用KIE.AI预先生成对应的视频
3. 上传到Vercel Blob或其他CDN
4. 更新数据库中的URL地址

### 成本控制
- 使用KIE.AI Runway API高性价比模式
- 演示功能不消耗API调用，直接返回预设视频
- 5秒720p视频生成，平衡质量与成本
- 合理设置点数价格和充值套餐

### 用户体验优化
- 提供清晰的使用指南
- 及时的状态反馈
- 友好的错误提示
- 快速的响应时间

## 📞 支持和反馈

如有问题或建议，请：
1. 查看服务器日志排查问题
2. 检查LINE Developer Console设置
3. 验证KIE.AI API状态
4. 联系技术支持团队

## 📄 许可证

MIT License - 详见LICENSE文件 