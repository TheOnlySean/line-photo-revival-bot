# 开发规则

## LINE API 使用规则

### 🚫 严格禁止事项

1. **禁止使用 `pushMessage` API**
   - 所有消息发送必须使用免费的 `replyMessage`
   - `pushMessage` 会消耗LINE API的免费消息配额
   - 会导致429 (Too Many Requests) 错误
   - 任何需要主动发送消息的场景都应重新设计

### ✅ 推荐做法

1. **使用 `replyMessage` 发送所有消息**
   - 在用户触发事件后的24小时内回复
   - 完全免费，不消耗配额
   - 避免API限制问题

2. **用户体验设计**
   - 使用Rich Menu状态变化来提示处理进度
   - 合理设计等待时间和用户预期
   - 在单次回复中发送完整的响应

### 🔧 技术实现

1. **Demo视频生成流程**
   ```
   用户点击 → 切换processing menu → 等待15秒 → replyMessage发送视频
   ```

2. **错误处理**
   - 避免在错误处理中使用pushMessage
   - 静默失败，不发送错误消息如果会触发429

### 📋 代码审查检查点

- [ ] 确认没有使用 `pushMessage`
- [ ] 所有消息使用 `replyMessage`
- [ ] 用户体验流程合理
- [ ] 错误处理不会触发429

---

**记住：这个项目中，pushMessage 是被严格禁止的！** 