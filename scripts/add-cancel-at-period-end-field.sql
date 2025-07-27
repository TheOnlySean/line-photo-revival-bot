-- 添加 cancel_at_period_end 字段到 subscriptions 表
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- 更新现有记录的默认值
UPDATE subscriptions 
SET cancel_at_period_end = FALSE 
WHERE cancel_at_period_end IS NULL;
