# 写真復活 LINE Bot 系統設計文檔

## 📋 目錄
1. [核心流程設計](#核心流程設計)
2. [LINE Message API 規範](#line-message-api-規範)
3. [Rich Menu 設計](#rich-menu-設計)
4. [數據庫結構](#數據庫結構)
5. [函數架構](#函數架構)
6. [錯誤處理策略](#錯誤處理策略)
7. [用戶體驗優化](#用戶體驗優化)

---

## 🎯 核心流程設計

### 1. 用戶首次進入流程
```
用戶加好友 
→ 發送歡迎消息 
→ 展示3個測試視頻選項（Carousel）
→ 用戶選擇一個
→ 切換到Processing Rich Menu
→ 模擬生成（10-20秒延遲）
→ 發送預設測試視頻
→ 切換回Main Rich Menu
→ 引導消息："如果想生成自己的照片，請使用下方菜單"
```

### 2. 手振り/寄り添い 標準流程
```
點擊Rich Menu按鈕（手振り/寄り添い）
→ 發送上傳提示 + Quick Reply（相機/相冊）
→ 用戶上傳照片
→ 顯示確認Flex Message（照片預覽 + 動作確認 + 生成按鈕）
→ 點擊生成按鈕
→ 檢查用戶subscription狀態
   ├── 有配額 → 發送到KIE.ai → Processing Menu → 輪詢結果 → 發回視頻
   └── 無配額 → 顯示付費選項Carousel（300円/3000円）
```

### 3. 個性化（Custom）流程
```
點擊個性化按鈕
→ 發送Prompt選擇Flex Message
   ├── 隨機Prompt按鈕
   │   → 生成隨機prompt
   │   → 以用戶消息形式發送prompt
   │   → 系統確認prompt
   │   → 繼續到照片上傳
   └── 自定義Prompt按鈕（inputOption: openKeyboard）
       → 自動打開輸入框
       → 用戶輸入prompt
       → 系統確認prompt
       → 繼續到照片上傳

→ 照片上傳提示："參考圖可選，可上傳可跳過"
→ Quick Reply（相機/相冊/跳過）
→ 用戶選擇
   ├── 上傳照片 → 確認卡片
   └── 跳過 → 直接確認卡片（僅prompt）
→ 點擊生成 → 後續流程同標準流程
```

### 4. 付費流程
```
觸發付費（配額不足時）
→ 發送付費Carousel（兩個plan卡片）
   ├── Trial Plan: ¥300/月, 8視頻
   └── Standard Plan: ¥2,980/月, 100視頻
→ 點擊卡片 → 跳轉Stripe Checkout
→ 完成付費 → Webhook更新用戶subscription
→ 發送付費成功通知
```

### 5. 月度配額管理流程
```
生成視頻前 → 檢查當月剩餘配額
→ 顯示配額信息："本月剩餘: X/Y 個視頻"
→ 配額充足 → 正常生成流程
→ 配額不足但為Trial用戶 → 顯示升級到Standard的選項
→ 配額不足且為Standard用戶 → 提示等待下月重置或聯繫客服
```

### 6. 輔助功能流程
```
優惠券+充值按鈕 → 顯示當前優惠活動 + 付費選項
官網連結按鈕 → 跳轉官網高級人工服務頁面
好友分享按鈕 → 生成LINE公眾號分享卡片 → 用戶轉發給朋友
```

---

## 📱 LINE Message API 規範

### Rich Menu 規範
```yaml
尺寸選項:
  - Full: 2500x1686 (6個按鈕需要用Full模式)
  - Compact: 2500x843 (僅3個按鈕時可用)
  
文件要求:
  - 格式: PNG/JPEG
  - 大小: ≤1MB
  - 所有Rich Menu必須相同尺寸
  
按鈕配置:
  - type: "postback" (推薦，不顯示用戶消息)
  - data: "action=ACTION_NAME" (簡潔格式)
  - 避免使用displayText
  
按鈕區域 (Full模式):
  - 上排3個: 833x843 每個
  - 下排3個: 833x843 每個
```

### Message Types 使用規範
```yaml
文字消息:
  - type: "text"
  - quickReply: 最多13個選項
  
Flex Message:
  - type: "flex"
  - 用於: 確認卡片、付費選項、複雜布局
  - 限制: JSON大小限制
  
Carousel:
  - type: "template", template.type: "carousel"
  - 用於: 測試視頻選擇、付費plan選擇
  - 限制: 最多10個column
  
Quick Reply:
  - 用於: 快速選項（相機/相冊/跳過等）
  - 限制: 最多13個item
```

### Postback 規範
```yaml
格式: "action=ACTION_NAME&param=value"
推薦Actions:
  # 核心功能
  - WAVE_VIDEO: 手振り動作
  - GROUP_VIDEO: 寄り添い動作  
  - PERSONALIZE: 個性化動作
  - RANDOM_PROMPT: 隨機prompt
  - INPUT_CUSTOM_PROMPT: 自定義prompt
  - confirm_generate: 確認生成
  
  # 輔助功能
  - COUPON: 優惠券+充值
  - WEBSITE: 官網客服
  - SHARE: 好友分享
  - UPGRADE_PLAN: 套餐升級
  - NO_PHOTO: 跳過照片上傳
  
特殊屬性:
  - inputOption: "openKeyboard" (自動打開輸入)
```

---

## 🎨 Rich Menu 設計

### Main Menu (Full: 2500x1686)
```
┌─────────────┬─────────────┬─────────────┐
│             │             │             │
│  👋 手振り   │  🤝 寄り添い  │  🎨 個性化   │
│             │             │             │
│ WAVE_VIDEO  │ GROUP_VIDEO │ PERSONALIZE │
├─────────────┼─────────────┼─────────────┤
│  🎟️ 優惠券   │  🌐 官網     │  👥 分享    │
│   +充值      │   客服       │   好友      │
│             │             │             │
│  COUPON     │  WEBSITE    │   SHARE     │
└─────────────┴─────────────┴─────────────┘
```

### Processing Menu (Full: 2500x1686)
```
┌───────────────────────────────────────────┐
│                                           │
│        🎬 動画生成中...                    │
│          お待ちください                      │
│                                           │
│                                           │
│          本月剩餘: X/Y 個視頻               │
│                                           │
└───────────────────────────────────────────┘
```

### Quick Reply 配置
```yaml
照片上傳:
  - 📷 カメラで撮影 (type: camera)
  - 📁 アルバムから選択 (type: cameraRoll)

個性化可選:
  - 📷 カメラで撮影 (type: camera)  
  - 📁 アルバムから選択 (type: cameraRoll)
  - ⏭️ 画像なしで生成 (type: postback, data: action=NO_PHOTO)

套餐升級:
  - ⬆️ スタンダードプランに升級 (type: postback, data: action=UPGRADE_PLAN)
  - ❌ 今はしない (type: postback, data: action=CANCEL)

分享確認:
  - 👥 友達に送信 (type: postback, data: action=CONFIRM_SHARE)
  - ❌ キャンセル (type: postback, data: action=CANCEL)
```

---

## 🗄️ 數據庫結構

### users 表
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  line_user_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  current_state VARCHAR(50) DEFAULT 'idle',
  current_prompt TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### subscriptions 表  
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan_type VARCHAR(50), -- 'trial' or 'standard'
  status VARCHAR(50),
  monthly_video_quota INTEGER,
  videos_used_this_month INTEGER DEFAULT 0,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### videos 表
```sql
CREATE TABLE videos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  task_id VARCHAR(255),
  prompt_text TEXT,
  image_url TEXT,
  video_url TEXT,
  status VARCHAR(50), -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### demo_videos 表 (測試視頻)
```sql
CREATE TABLE demo_videos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  image_url TEXT,
  video_url TEXT,
  is_active BOOLEAN DEFAULT true
);
```

### coupons 表 (優惠券)
```sql
CREATE TABLE coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255),
  description TEXT,
  discount_type VARCHAR(20), -- 'percentage' or 'fixed'
  discount_value INTEGER,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0
);
```

### user_coupons 表 (用戶優惠券使用記錄)
```sql
CREATE TABLE user_coupons (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  coupon_id INTEGER REFERENCES coupons(id),
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  stripe_session_id VARCHAR(255)
);
```

---

## ⚙️ 函數架構

### 1. 核心處理類
```javascript
class MessageHandler {
  // 主要事件處理
  async handleFollow(event)           // 用戶加好友
  async handleTextMessage(event)      // 文字消息
  async handleImageMessage(event)     // 圖片消息  
  async handlePostback(event)         // 按鈕點擊
  
  // Rich Menu Actions
  async handleWaveVideoPostback(event, user)
  async handleGroupVideoPostback(event, user)  
  async handlePersonalizePostback(event, user)
  
  // 輔助功能
  async handleCouponAction(event, user)         // 優惠券+充值
  async handleWebsiteAction(event, user)        // 官網客服
  async handleShareAction(event, user)          // 好友分享
  async handleUpgradePlan(event, user)          // 套餐升級
  
  // Prompt 處理
  async handleRandomPromptPostback(event, user, data)
  async handleCustomPromptInput(event, user, promptText)
  
  // 生成流程
  async showGenerationConfirmation(event, user, imageUrl, prompt)
  async handleConfirmGenerate(event, user, data)
  async startVideoGeneration(event, user, imageUrl, prompt)
  
  // 輔助功能
  async sendDemoVideos(event, user)
  async sendPhotoUploadOptions(event, user)
  async handleInsufficientQuota(event, user)
  async sendPaymentOptions(event, user)
}
```

### 2. Rich Menu 管理
```javascript
class LineBot {
  async setupRichMenu()              // 初始化Rich Menu
  async switchToProcessingMenu(userId)
  async switchToMainMenu(userId)
  async uploadRichMenuImage(richMenuId, imageType)
  
  // 消息發送
  async sendMessage(userId, message)
  async replyMessage(replyToken, message)
  async pushMessage(userId, message)
}
```

### 3. 視頻生成服務
```javascript
class VideoGenerator {
  async generateVideo(userId, imageUrl, prompt, videoRecordId)
  async pollVideoStatus(userId, taskId, videoRecordId)
  async handleVideoSuccess(userId, videoUrl, videoRecordId)
  async handleVideoError(userId, error, videoRecordId)
}
```

### 4. 數據庫操作
```javascript
class Database {
  // 用戶管理
  async ensureUserExists(lineUserId)
  async setUserState(userId, state, prompt)
  async getUserState(userId)
  
  // 訂閱管理  
  async getUserSubscription(userId)
  async checkVideoQuota(userId)
  async useVideoQuota(userId)
  async resetMonthlyQuota(userId)
  
  // 視頻記錄
  async createVideoRecord(userId, data)
  async updateVideoStatus(taskId, status, videoUrl)
  async getUserPendingTasks(userId)
  
  // 測試視頻
  async getDemoVideos()
  
  // 優惠券管理
  async getActiveCoupons()
  async validateCoupon(couponCode)
  async useCoupon(userId, couponId, stripeSessionId)
  
  // 配額顯示
  async getUserQuotaInfo(userId)     // 返回 "剩餘X/總Y個視頻"
  async checkUpgradeEligibility(userId)
}
```

---

## 🚨 錯誤處理策略

### 1. API 錯誤處理
```javascript
// Rich Menu 錯誤
- 圖片上傳失敗 → 記錄錯誤，繼續使用（功能不受影響）
- 切換菜單失敗 → 重試一次，失敗則記錄

// KIE.ai API 錯誤  
- 生成失敗 → 通知用戶，恢復配額，切回主菜單
- 超時 → 繼續輪詢，設置最大輪詢次數

// Stripe 錯誤
- 付費失敗 → 顯示錯誤信息，提供重試選項
```

### 2. 用戶狀態管理
```javascript
// 狀態同步
- 每次操作後異步更新狀態
- 關鍵操作前檢查狀態一致性
- 超時自動重置到idle狀態

// 防重複操作
- 生成中禁用相同操作
- 使用replyToken防重複回復
```

### 3. 數據一致性
```javascript
// 事務處理
- 視頻生成使用事務
- 配額扣除使用原子操作
- 訂閱更新使用事務

// 數據恢復
- 定期檢查異常狀態記錄
- 失敗任務自動清理
```

---

## 🎨 用戶體驗優化

### 1. 響應速度優化
```javascript
// 立即回復策略
1. 收到postback → 立即replyMessage
2. 數據庫操作 → setImmediate異步執行  
3. 避免用戶等待

// Rich Menu優化
1. 使用Compact模式（節省空間）
2. 圖片大小控制在30KB以下
3. 簡化按鈕區域
```

### 2. 消息設計優化
```javascript
// 文字消息
- 使用emoji增加友好度
- 保持簡潔明了
- 提供明確指引

// Flex Message
- 統一視覺風格
- 重要按鈕突出顯示
- 適配手機屏幕
```

### 3. 流程引導優化
```javascript
// 新用戶引導
1. 測試視頻體驗 → 建立信任
2. 成功體驗後 → 引導付費使用
3. 清晰的步驟指示

// 操作反饋
1. 每個操作都有確認
2. 生成過程有進度提示  
3. 錯誤有友好的解釋

// 配額管理
1. 生成前顯示剩餘配額
2. 適時提醒升級套餐
3. 配額不足時友好提示

// 社交功能
1. 分享卡片簡潔美觀
2. 優惠券信息清晰展示
3. 官網連結明確標示
```

---

## 🔄 實現優先級

### Phase 1: 核心流程 (必須)
- [ ] 用戶加好友歡迎流程
- [ ] 測試視頻展示和選擇
- [ ] Rich Menu基本功能 (6個按鈕)
- [ ] 手振り/寄り添い標準流程
- [ ] 照片上傳和確認卡片
- [ ] 基本的視頻生成流程
- [ ] 月度配額顯示功能

### Phase 2: 個性化功能
- [ ] 個性化prompt輸入
- [ ] 隨機prompt生成
- [ ] 可選照片上傳
- [ ] Custom流程完整實現

### Phase 3: 付費集成
- [ ] Subscription檢查
- [ ] 付費選項展示
- [ ] Stripe集成
- [ ] Webhook處理
- [ ] 套餐升級提醒功能

### Phase 4: 輔助功能
- [ ] 優惠券系統
- [ ] 官網客服連結
- [ ] 好友分享功能
- [ ] 分享卡片生成

### Phase 5: 優化和完善
- [ ] 錯誤處理完善
- [ ] 用戶體驗細節優化
- [ ] 性能優化
- [ ] 監控和日誌

---

## 📝 開發檢查清單

### LINE API 合規檢查
- [ ] Rich Menu尺寸符合規範
- [ ] 圖片文件大小 < 1MB
- [ ] Postback data格式正確
- [ ] Quick Reply數量 ≤ 13
- [ ] Flex Message JSON有效

### 功能測試檢查  
- [ ] 所有Rich Menu按鈕響應正常 (6個按鈕)
- [ ] 照片上傳和處理正常
- [ ] 確認卡片顯示正確
- [ ] 付費流程完整可用
- [ ] 視頻生成和輪詢正常
- [ ] 月度配額顯示準確
- [ ] 套餐升級提醒正常觸發
- [ ] 優惠券功能正常
- [ ] 官網連結可正常跳轉
- [ ] 好友分享卡片生成正常

### 用戶體驗檢查
- [ ] 響應速度 < 2秒
- [ ] 錯誤消息友好易懂
- [ ] 流程引導清晰
- [ ] 視覺設計統一

---

---

## 🔧 新功能詳細實現指南

### 1. 月度配額顯示
```javascript
// 在視頻生成前調用
const quotaInfo = await db.getUserQuotaInfo(userId);
const message = {
  type: 'text',
  text: `📹 動画生成準備完了！\n本月剩餘: ${quotaInfo.remaining}/${quotaInfo.total} 個視頻\n\n生成を開始しますか？`,
  quickReply: {
    items: [
      { type: 'postback', label: '✅ はい', data: 'action=confirm_generate' },
      { type: 'postback', label: '❌ いいえ', data: 'action=cancel' }
    ]
  }
};
```

### 2. 套餐升級提醒
```javascript
// Trial用戶配額用完時
if (user.plan_type === 'trial' && quotaInfo.remaining === 0) {
  const upgradeMessage = {
    type: 'template',
    template: {
      type: 'buttons',
      thumbnailImageUrl: 'https://example.com/upgrade-banner.jpg',
      title: '⬆️ プラン升級のご案内',
      text: 'トライアルプランの動画生成上限に達しました。スタンダードプランで100本/月の動画をお楽しみください！',
      actions: [
        { type: 'postback', label: '💎 スタンダードプランに升級', data: 'action=UPGRADE_PLAN&plan=standard' },
        { type: 'postback', label: '⏳ 来月まで待つ', data: 'action=wait_next_month' }
      ]
    }
  };
}
```

### 3. 優惠券+充值功能
```javascript
async handleCouponAction(event, user) {
  const activeCoupons = await db.getActiveCoupons();
  const message = {
    type: 'flex',
    contents: {
      type: 'carousel',
      contents: [
        // 優惠券卡片
        {
          type: 'bubble',
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🎟️ 限時優惠', weight: 'bold' }] },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: activeCoupons.map(coupon => ({
              type: 'text',
              text: `${coupon.title}: ${coupon.discount_value}${coupon.discount_type === 'percentage' ? '%' : '円'} OFF`,
              size: 'sm'
            }))
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'button', action: { type: 'postback', label: '💳 充值する', data: 'action=payment_with_coupon' } }]
          }
        },
        // 普通充值卡片  
        {
          type: 'bubble',
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '💳 プラン購入', weight: 'bold' }] },
          body: {
            type: 'box',
            layout: 'vertical', 
            contents: [
              { type: 'text', text: 'トライアル: ¥300/月', size: 'sm' },
              { type: 'text', text: 'スタンダード: ¥2,980/月', size: 'sm' }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'button', action: { type: 'postback', label: '選択する', data: 'action=select_plan' } }]
          }
        }
      ]
    }
  };
  await this.lineBot.replyMessage(event.replyToken, message);
}
```

### 4. 官網客服連結  
```javascript
async handleWebsiteAction(event, user) {
  const message = {
    type: 'template',
    template: {
      type: 'buttons',
      thumbnailImageUrl: 'https://example.com/customer-service.jpg',
      title: '🌐 カスタマーサポート',
      text: 'より詳しいサポートが必要でしたら、公式サイトをご覧ください。',
      actions: [
        { type: 'uri', label: '🌐 公式サイトへ', uri: 'https://your-website.com/support' },
        { type: 'postback', label: '📞 電話サポート', data: 'action=phone_support' },
        { type: 'postback', label: '💬 チャットサポート', data: 'action=chat_support' }
      ]
    }
  };
  await this.lineBot.replyMessage(event.replyToken, message);
}
```

### 5. 好友分享功能
```javascript
async handleShareAction(event, user) {
  // 生成分享卡片
  const shareCard = {
    type: 'flex',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://example.com/share-banner.jpg',
        size: 'full',
        aspectRatio: '20:13'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📸✨ 写真復活 AI', weight: 'bold', size: 'xl' },
          { type: 'text', text: 'あなたの写真が動き出す！', size: 'md', color: '#666666' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '友達限定特典:', weight: 'bold', margin: 'md' },
          { type: 'text', text: '• 初回トライアル50%OFF', size: 'sm' },
          { type: 'text', text: '• 3本無料生成', size: 'sm' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', action: { type: 'uri', label: '今すぐ試す', uri: 'https://line.me/R/ti/p/@your-bot-id' } }
        ]
      }
    }
  };
  
  const confirmMessage = {
    type: 'text',
    text: '👥 以下のカードを友達にシェアしますか？',
    quickReply: {
      items: [
        { type: 'postback', label: '✅ シェアする', data: 'action=CONFIRM_SHARE' },
        { type: 'postback', label: '❌ キャンセル', data: 'action=CANCEL' }
      ]
    }
  };
  
  await this.lineBot.replyMessage(event.replyToken, [confirmMessage, shareCard]);
}
```

### 6. Processing Menu 配額顯示
```javascript
// Processing Rich Menu 切換時加入配額信息
async switchToProcessingMenuWithQuota(userId) {
  const quotaInfo = await db.getUserQuotaInfo(userId);
  
  // 創建帶配額信息的Processing Rich Menu圖片
  const processingImage = await this.generateProcessingImageWithQuota(
    quotaInfo.remaining, 
    quotaInfo.total
  );
  
  // 上傳圖片並切換Rich Menu
  await this.uploadRichMenuImage(this.processingRichMenuId, processingImage);
  await this.linkRichMenuToUser(userId, this.processingRichMenuId);
}
```

---

**總結：更新後的設計文檔現在包含了完整的6按鈕Rich Menu、月度配額管理、套餐升級提醒、優惠券系統、官網客服連結和好友分享功能。所有功能都嚴格遵循LINE Message API規範，並提供了詳細的實現指南。接下來我們可以按照這個完整規劃逐步開發，確保每個功能都能正常運作。** 