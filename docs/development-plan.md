# 写真復活 LINE Bot 開発計劃

## 🎯 開発Phase計劃

### ✅ Phase 1.1: 代碼審查和清理 (已完成 🎉)

#### ✅ 已完成任務：
- [x] **重構 `services/line-bot.js`** (2138行 → 200行)
  - 🎯 升級為6按钮Full模式Rich Menu (2500x1686)
  - 🗑️ 删除1900+行复杂代码
  - ✅ 保留测试视频核心功能
  - 🔄 简化Rich Menu切换逻辑

- [x] **重構 `services/message-handler.js`** (978行 → 470行)
  - 🗑️ 删除500+行调试代码
  - 🎯 添加3个新辅助功能：COUPON, WEBSITE, SHARE
  - ⚡ 简化异步操作，提升响应速度
  - ✅ 保留正确的确认流程

- [x] **简化 `services/video-generator.js`** (396行 → 280行)
  - 🗑️ 删除100+行过多调试日志
  - ⚡ 保留核心视频生成功能
  - 🔄 维持轮询机制和错误处理

- [x] **审查 `config/database.js`** ✅
  - 确认使用新subscription数据库架构
  - 保持现有稳定配置

- [x] **创建Rich Menu图片** 📸
  - 生成6按钮Full模式图片 (2500x1686)
  - 文件大小优化 (<20KB)
  - 支持新的辅助功能按钮

#### 📊 重构成果总结：
- **代码行数减少**: ~2,900行
- **代码清理率**: 60%+
- **新功能添加**: 3个辅助功能
- **性能提升**: 简化异步操作
- **维护性**: 大幅提升

---

### 🚀 Phase 1.2: 用戶歡迎流程測試 (下一步)

#### 1.2.1 測試視頻功能驗證
- [ ] `handleFollow()` - 用戶加好友處理
- [ ] `sendDemoVideos()` - 測試視頻展示
- [ ] 测试视频选择和模拟生成
- [ ] 确保Rich Menu正确显示

#### 1.2.2 Rich Menu 功能測試
- [ ] 6个按钮响应测试
  - 核心功能: WAVE_VIDEO, GROUP_VIDEO, PERSONALIZE
  - 辅助功能: COUPON, WEBSITE, SHARE
- [ ] Rich Menu切换测试 (主要 ↔ 处理中)
- [ ] 按钮响应速度测试 (目标: <2秒)

#### 1.2.3 数据库集成测试
- [ ] 用户创建和状态管理
- [ ] 视频配额检查功能
- [ ] 订阅状态验证

---

### Phase 2: 個性化功能完善 (優先級: 🔥🔥)

#### 2.1 Prompt 處理
- [ ] `handlePersonalizePostback()` - 個性化入口
- [ ] `handleRandomPromptPostback()` - 隨機 prompt
- [ ] `handleInputCustomPromptPostback()` - 自定義輸入
- [ ] Custom prompt 流程測試

#### 2.2 照片處理流程
- [ ] 照片上傳 Quick Reply 功能
- [ ] 確認卡片顯示和互動
- [ ] 圖片處理和存儲

---

### Phase 3: 付費功能集成 (優先級: 🔥🔥)

#### 3.1 輔助功能開發
- [ ] **優惠券+充值功能** (`handleCouponAction`)
  - 優惠券列表顯示
  - 付費套餐選擇
  - Stripe集成測試
  
- [ ] **官網客服功能** (`handleWebsiteAction`)
  - 官網連結配置
  - 客服聯絡方式

- [ ] **好友分享功能** (`handleShareAction`)
  - 分享卡片生成
  - LINE推薦功能

#### 3.2 Subscription 檢查和集成
- [ ] 視頻配額檢查 (`checkVideoQuota`)
- [ ] 付費流程重新測試
- [ ] Stripe Webhook 處理
- [ ] 套餐升級提醒功能

---

### Phase 4: 測試和優化 (優先級: 🔥)

#### 4.1 端到端測試
- [ ] 完整用戶流程測試
- [ ] 錯誤處理機制驗證
- [ ] 性能瓶頸識別和優化

#### 4.2 生產環境準備
- [ ] 環境變數確認
- [ ] Rich Menu 部署腳本
- [ ] 監控和日誌優化

---

## 🛠️ 開發工具和腳本

### Rich Menu 管理
```bash
# 重置Rich Menu (建議在代碼更改後執行)
node scripts/reset-richmenu.js

# 上傳Rich Menu圖片
node scripts/upload-richmenu-images.js

# 檢查Rich Menu狀態  
node scripts/check-richmenu-status.js
```

### 代碼質量
- ✅ 過度調試日誌已清理
- ✅ 異步操作已優化
- ✅ 錯誤處理已簡化
- ✅ 文件結構已精簡

---

## 📋 下一步執行建議

### 立即執行 (Phase 1.2)
1. 測試用戶歡迎流程和Rich Menu顯示
2. 驗證6按钮功能是否正常響應
3. 確認測試視頻功能運作

### 命令序列 (建議執行順序)
```bash
# 1. 推送代碼更改
git add .
git commit -m "feat: 重構核心模組，升級6按钮Rich Menu"
git push

# 2. 等待Vercel部署完成後，重置Rich Menu
node scripts/reset-richmenu.js

# 3. 測試LINE Bot功能
# (在LINE應用中測試用戶添加好友流程)
```

### 測試檢查表 ☑️
- [ ] 用戶加好友後收到歡迎消息
- [ ] 測試視頻展示正常
- [ ] 6個Rich Menu按钮正確顯示和響應
- [ ] 按钮點擊速度 < 2秒
- [ ] Rich Menu切換 (主要 ↔ 處理中) 正常
- [ ] 數據庫用戶創建成功

---

**🎯 當前重點**: Phase 1.2 - 驗證重構後的核心功能穩定性 