# Stripe 支付系統設置指南

## 1. Stripe 帳戶設置

### 1.1 獲取 API 密鑰
1. 登入 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 前往 **Developers > API keys**
3. 複製以下密鑰：
   - **Publishable key** (pk_live_... 或 pk_test_...)
   - **Secret key** (sk_live_... 或 sk_test_...)

### 1.2 創建訂閱產品和價格

#### Trial Plan (トライアルプラン)
1. 前往 **Products > Add product**
2. 設置：
   - **Name**: トライアルプラン
   - **Description**: 月間8本の動画生成が可能
   - **Pricing model**: Recurring
   - **Price**: ¥300
   - **Billing period**: Monthly
3. 保存並複製 **Price ID** (price_...)

#### Standard Plan (スタンダードプラン)  
1. 創建另一個產品
2. 設置：
   - **Name**: スタンダードプラン
   - **Description**: 月間100本の動画生成が可能
   - **Pricing model**: Recurring
   - **Price**: ¥2,980
   - **Billing period**: Monthly
3. 保存並複製 **Price ID** (price_...)

### 1.3 設置 Webhook
1. 前往 **Developers > Webhooks**
2. 點擊 **Add endpoint**
3. 設置：
   - **Endpoint URL**: `https://your-domain.vercel.app/api/payment/webhook`
   - **Events to send**:
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
4. 保存並複製 **Webhook secret** (whsec_...)

## 2. Vercel 環境變量設置

在 Vercel Dashboard 中設置以下環境變量：

```
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_TRIAL_PRICE_ID=price_your_trial_price_id
STRIPE_STANDARD_PRICE_ID=price_your_standard_price_id
PAYMENT_SUCCESS_URL=https://your-domain.vercel.app/payment/success
PAYMENT_CANCEL_URL=https://your-domain.vercel.app/payment/cancel
```

## 3. 支付流程

### 3.1 用戶點擊支付按鈕
1. 用戶在 LINE Bot 中點擊 "ポイント購入" 按鈕
2. 顯示料金プラン的 Flex Message
3. 用戶點擊 "料金プランを選択" 按鈕

### 3.2 支付頁面
1. 打開 `/payment.html` 頁面
2. 顯示兩個訂閱方案
3. 支持的支付方式：
   - 💳 クレジットカード
   - 🍎 Apple Pay
   - 🟢 Google Pay
   - 🏪 コンビニ払い
   - 🏦 銀行振込

### 3.3 支付處理
1. 用戶選擇方案後跳轉到 Stripe Checkout
2. 完成支付後跳轉到成功頁面
3. Webhook 自動更新用戶訂閱狀態
4. 用戶可以立即開始使用新的配額

## 4. 日本用戶支付方式

### 4.1 已集成的支付方式
- **クレジットカード**: Visa, Mastercard, JCB, American Express
- **Apple Pay**: iPhone/iPad 用戶
- **Google Pay**: Android 用戶  
- **コンビニ払い**: セブンイレブン、ローソン、ファミリーマート等
- **銀行振込**: 日本國內銀行

### 4.2 本地化設置
- 界面語言：日語 (`locale: 'ja'`)
- 貨幣：日元 (`currency: 'jpy'`)
- 稅費：可選自動計算

## 5. 測試

### 5.1 測試模式
使用 Stripe 測試密鑰進行測試：
- 測試卡號：`4242 4242 4242 4242`
- 任意未來日期和 CVC

### 5.2 Webhook 測試
使用 Stripe CLI 進行本地測試：
```bash
stripe listen --forward-to localhost:3000/api/payment/webhook
```

## 6. 監控和分析

### 6.1 Stripe Dashboard
- 查看支付狀態
- 監控訂閱續費
- 管理客戶

### 6.2 應用日誌
查看 Vercel 日誌以監控：
- 支付會話創建
- Webhook 事件處理
- 用戶配額更新

## 7. 故障排除

### 7.1 常見問題
- **支付失敗**: 檢查 Stripe 密鑰配置
- **Webhook 未觸發**: 驗證 Webhook URL 和簽名
- **用戶配額未更新**: 檢查數據庫連接和日誌

### 7.2 錯誤日誌
所有錯誤都會記錄在 Vercel 函數日誌中，便於診斷。 