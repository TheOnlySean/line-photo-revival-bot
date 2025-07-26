const { Pool } = require('pg');

class Database {
  constructor() {
    // 新的Neon數據庫連接配置 - angelsphoto-line項目
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_5BVRk8NOJIFf@ep-square-haze-afdewteo-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  // === 用戶管理方法 ===

  // 確保用戶存在（自動創建）
  async ensureUserExists(lineUserId, displayName = null) {
    try {
      // 先嘗試查詢用戶
      const existingUser = await this.query(
        'SELECT * FROM users WHERE line_user_id = $1',
        [lineUserId]
      );

      if (existingUser.rows.length > 0) {
        return existingUser.rows[0];
      }

      // 用戶不存在，創建新用戶
      const newUser = await this.query(
        `INSERT INTO users (line_user_id, display_name) 
         VALUES ($1, $2) 
         RETURNING *`,
        [lineUserId, displayName]
      );

      console.log('✅ 新用戶創建成功:', { lineUserId, id: newUser.rows[0].id });
      return newUser.rows[0];
    } catch (error) {
      console.error('❌ 確保用戶存在失敗:', error);
      throw error;
    }
  }

  // 獲取用戶信息
  async getUser(lineUserId) {
    try {
      const result = await this.query(
        'SELECT * FROM users WHERE line_user_id = $1',
        [lineUserId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ 獲取用戶失敗:', error);
      throw error;
    }
  }

  // 設置用戶狀態
  async setUserState(userId, state, prompt = null) {
    try {
      const result = await this.query(
        `UPDATE users 
         SET current_state = $2, current_prompt = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 
         RETURNING *`,
        [userId, state, prompt]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ 設置用戶狀態失敗:', error);
      throw error;
    }
  }

  // === 訂閱管理方法 ===

  // 創建或更新訂閱
  async upsertSubscription(userId, subscriptionData) {
    try {
      const {
        stripeCustomerId,
        stripeSubscriptionId,
        planType,
        status = 'active',
        currentPeriodStart,
        currentPeriodEnd,
        monthlyVideoQuota,
        videosUsedThisMonth = 0
      } = subscriptionData;

      // 先檢查是否已存在訂閱
      const existing = await this.query(
        'SELECT * FROM subscriptions WHERE user_id = $1',
        [userId]
      );

      if (existing.rows.length > 0) {
        // 更新現有訂閱
        const result = await this.query(
          `UPDATE subscriptions 
           SET stripe_customer_id = $2, stripe_subscription_id = $3, plan_type = $4,
               status = $5, current_period_start = $6, current_period_end = $7,
               monthly_video_quota = $8, videos_used_this_month = $9,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 
           RETURNING *`,
          [userId, stripeCustomerId, stripeSubscriptionId, planType, status, 
           currentPeriodStart, currentPeriodEnd, monthlyVideoQuota, videosUsedThisMonth]
        );
        return result.rows[0];
      } else {
        // 創建新訂閱
        const result = await this.query(
          `INSERT INTO subscriptions 
           (user_id, stripe_customer_id, stripe_subscription_id, plan_type, status,
            current_period_start, current_period_end, monthly_video_quota, videos_used_this_month)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [userId, stripeCustomerId, stripeSubscriptionId, planType, status,
           currentPeriodStart, currentPeriodEnd, monthlyVideoQuota, videosUsedThisMonth]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error('❌ 創建/更新訂閱失敗:', error);
      throw error;
    }
  }

  // 獲取用戶訂閱信息
  async getUserSubscription(userId) {
    try {
      const result = await this.query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
        [userId, 'active']
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ 獲取用戶訂閱失敗:', error);
      throw error;
    }
  }

  // 通過Stripe訂閱ID獲取訂閱
  async getSubscriptionByStripeId(stripeSubscriptionId) {
    try {
      const result = await this.query(
        'SELECT s.*, u.line_user_id FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.stripe_subscription_id = $1',
        [stripeSubscriptionId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ 通過Stripe ID獲取訂閱失敗:', error);
      throw error;
    }
  }

  // 檢查用戶是否有剩餘配額
  async checkVideoQuota(userId) {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        return { hasQuota: false, remaining: 0, total: 0 };
      }

      const remaining = subscription.monthly_video_quota - subscription.videos_used_this_month;
      return {
        hasQuota: remaining > 0,
        remaining: remaining,
        total: subscription.monthly_video_quota,
        used: subscription.videos_used_this_month
      };
    } catch (error) {
      console.error('❌ 檢查視頻配額失敗:', error);
      throw error;
    }
  }

  // 使用視頻配額
  async useVideoQuota(userId) {
    try {
      const result = await this.query(
        `UPDATE subscriptions 
         SET videos_used_this_month = videos_used_this_month + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status = 'active'
         RETURNING *`,
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ 使用視頻配額失敗:', error);
      throw error;
    }
  }

  // 重置月度配額
  async resetMonthlyQuota(userId) {
    try {
      const result = await this.query(
        `UPDATE subscriptions 
         SET videos_used_this_month = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING *`,
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ 重置月度配額失敗:', error);
      throw error;
    }
  }

  // 恢复视频配额（用于生成失败时）
  async restoreVideoQuota(userId) {
    try {
      const result = await this.query(
        `UPDATE subscriptions 
         SET videos_used_this_month = GREATEST(videos_used_this_month - 1, 0),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status = 'active'
         RETURNING *`,
        [userId]
      );
      console.log(`✅ 已恢复用户 ${userId} 的视频配额`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ 恢复视频配额失败:', error);
      throw error;
    }
  }

  // === 視頻記錄方法 ===

  // 創建視頻記錄
  async createVideoRecord(userId, videoData) {
    try {
      const {
        subscriptionId,
        taskId,
        promptText,
        imageUrl,
        status = 'pending'
      } = videoData;

      const result = await this.query(
        `INSERT INTO videos 
         (user_id, subscription_id, task_id, prompt_text, image_url, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, subscriptionId, taskId, promptText, imageUrl, status]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ 創建視頻記錄失敗:', error);
      throw error;
    }
  }

  // 更新視頻狀態
  async updateVideoStatus(taskId, status, videoUrl = null) {
    try {
      let query, params;
      
      if (videoUrl) {
        query = `UPDATE videos 
                 SET status = $2, video_url = $3, generated_at = CURRENT_TIMESTAMP
                 WHERE task_id = $1 
                 RETURNING *`;
        params = [taskId, status, videoUrl];
      } else {
        query = `UPDATE videos 
                 SET status = $2
                 WHERE task_id = $1 
                 RETURNING *`;
        params = [taskId, status];
      }

      const result = await this.query(query, params);
      return result.rows[0];
    } catch (error) {
      console.error('❌ 更新視頻狀態失敗:', error);
      throw error;
    }
  }

  // 獲取用戶的處理中任務
  async getUserPendingTasks(lineUserId) {
    try {
      const result = await this.query(
        `SELECT v.* FROM videos v 
         JOIN users u ON v.user_id = u.id 
         WHERE u.line_user_id = $1 AND v.status IN ('pending', 'processing')`,
        [lineUserId]
      );
      return result.rows;
    } catch (error) {
      console.error('❌ 獲取用戶待處理任務失敗:', error);
      throw error;
    }
  }

  // === 交互日誌方法 ===

  // 記錄用戶交互
  async logInteraction(lineUserId, userId, interactionType, interactionData = {}) {
    try {
      const result = await this.query(
        `INSERT INTO user_interactions 
         (user_id, line_user_id, interaction_type, interaction_data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, lineUserId, interactionType, JSON.stringify(interactionData)]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ 記錄用戶交互失敗:', error);
      throw error;
    }
  }

  // 關閉數據庫連接
  async close() {
    await this.pool.end();
  }
}

module.exports = new Database(); 