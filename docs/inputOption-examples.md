# LINE Messaging API inputOption 使用示例

## 1. openKeyboard - 自動打開輸入鍵盤

```javascript
{
  type: 'postback',
  label: '自己輸入',
  data: 'action=INPUT_CUSTOM_PROMPT',
  inputOption: 'openKeyboard',
  fillInText: '請輸入您的自定義提示...'  // 預設文字
}
```

**使用場景**：
- 讓用戶輸入自定義內容
- 填寫表單
- 提供反饋意見

## 2. openRichMenu - 打開Rich Menu

```javascript
{
  type: 'postback',
  label: '打開菜單',
  data: 'action=OPEN_MENU',
  inputOption: 'openRichMenu'
}
```

**使用場景**：
- 引導用戶使用Rich Menu
- 顯示更多選項

## 3. closeRichMenu - 關閉Rich Menu

```javascript
{
  type: 'postback',
  label: '關閉菜單',
  data: 'action=CLOSE_MENU',
  inputOption: 'closeRichMenu'
}
```

**使用場景**：
- 為用戶提供更大的聊天空間
- 專注於當前對話

## 4. openVoice - 打開語音輸入

```javascript
{
  type: 'postback',
  label: '語音輸入',
  data: 'action=VOICE_INPUT',
  inputOption: 'openVoice'
}
```

**使用場景**：
- 語音識別功能
- 方便用戶快速輸入

## 版本要求

- **LINE 版本**: 12.6.0 或更高
- **發布日期**: 2022年5月13日
- **兼容性**: 如果用戶LINE版本較舊，按鈕仍可點擊，但不會自動執行inputOption行為

## 最佳實踐

1. **總是提供fallback**: 確保即使inputOption不工作，用戶仍能完成操作
2. **合理使用fillInText**: 提供有幫助的預設文字或提示
3. **測試兼容性**: 在不同LINE版本上測試功能
4. **用戶體驗**: 在適當的時機使用，避免過度干擾用戶 