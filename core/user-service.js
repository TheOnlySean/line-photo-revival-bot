/**
 * 用户管理业务服务 - 纯业务逻辑，不依赖LINE API
 * 职责：用户状态管理、订阅检查、用户信息维护
 */
class UserService {
  constructor(database) {
    this.db = database;
  }

  /**
   * 确保用户存在，如不存在则创建
   */
  async ensureUserExists(lineUserId, displayName) {
    try {
      return await this.db.ensureUserExists(lineUserId, displayName);
    } catch (error) {
      console.error('❌ 确保用户存在失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户信息和状态
   */
  async getUserWithState(lineUserId) {
    try {
      return await this.db.getUserByLineId(lineUserId);
    } catch (error) {
      console.error('❌ 获取用户状态失败:', error);
      throw error;
    }
  }

  /**
   * 设置用户状态
   */
  async setUserState(userId, state, data = null) {
    try {
      await this.db.setUserState(userId, state, data);
      return {
        success: true,
        message: `用户状态已设置为: ${state}`
      };
    } catch (error) {
      console.error('❌ 设置用户状态失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 清除用户状态
   */
  async clearUserState(userId) {
    try {
      await this.db.setUserState(userId, 'idle');
      return {
        success: true,
        message: '用户状态已清除'
      };
    } catch (error) {
      console.error('❌ 清除用户状态失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 记录用户交互
   */
  async logUserInteraction(lineUserId, userId, interactionType, data = {}) {
    try {
      await this.db.logInteraction(lineUserId, userId, interactionType, data);
      return {
        success: true,
        message: '交互记录已保存'
      };
    } catch (error) {
      console.error('❌ 记录用户交互失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取用户订阅信息
   */
  async getUserSubscription(userId) {
    try {
      return await this.db.getUserSubscription(userId);
    } catch (error) {
      console.error('❌ 获取用户订阅失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户订阅状态
   */
  async checkSubscriptionStatus(userId) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription) {
        return {
          hasSubscription: false,
          status: 'none',
          quota: { hasQuota: false, remaining: 0, total: 0 }
        };
      }

      const now = new Date();
      const currentPeriodEnd = new Date(subscription.current_period_end);
      const isActive = subscription.status === 'active' && currentPeriodEnd > now;

      const quota = await this.db.checkVideoQuota(userId);

      return {
        hasSubscription: true,
        isActive,
        status: subscription.status,
        planType: subscription.plan_type,
        currentPeriodEnd: subscription.current_period_end,
        quota
      };
    } catch (error) {
      console.error('❌ 检查订阅状态失败:', error);
      return {
        hasSubscription: false,
        status: 'error',
        quota: { hasQuota: false, remaining: 0, total: 0 }
      };
    }
  }

  /**
   * 处理用户关注事件
   */
  async handleUserFollow(lineUserId, displayName) {
    try {
      // 确保用户存在
      const user = await this.ensureUserExists(lineUserId, displayName);
      
      // 记录关注事件
      await this.logUserInteraction(lineUserId, user.id, 'follow', {
        displayName: displayName
      });

      return {
        success: true,
        user: user,
        message: '用户关注处理成功'
      };
    } catch (error) {
      console.error('❌ 处理用户关注失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 生成用户调试信息
   */
  async generateUserDebugInfo(user) {
    try {
      const subscription = await this.getUserSubscription(user.id);
      const quota = await this.db.checkVideoQuota(user.id);

      return subscription
        ? `用户状态: ${user.current_state}\n订阅: ${subscription.plan_type}\n配额: ${quota.remaining}/${quota.total}`
        : `用户状态: ${user.current_state}\n订阅: 无\n配额: 0/0`;
    } catch (error) {
      console.error('❌ 生成调试信息失败:', error);
      return `调试信息生成失败: ${error.message}`;
    }
  }

  /**
   * 处理配额不足情况
   */
  async handleInsufficientQuota(userId) {
    try {
      const subscriptionStatus = await this.checkSubscriptionStatus(userId);
      
      return {
        hasSubscription: subscriptionStatus.hasSubscription,
        isActive: subscriptionStatus.isActive,
        planType: subscriptionStatus.planType,
        quota: subscriptionStatus.quota,
        needsUpgrade: subscriptionStatus.planType === 'trial',
        recommendedAction: subscriptionStatus.hasSubscription 
          ? (subscriptionStatus.planType === 'trial' ? 'upgrade' : 'wait_next_month')
          : 'subscribe'
      };
    } catch (error) {
      console.error('❌ 处理配额不足失败:', error);
      return {
        hasSubscription: false,
        isActive: false,
        needsUpgrade: true,
        recommendedAction: 'subscribe'
      };
    }
  }

  /**
   * 用户状态验证
   */
  validateUserState(state) {
    const validStates = [
      'idle',
      'awaiting_custom_prompt',
      'awaiting_photo',
      'awaiting_wave_photo',
      'awaiting_group_photo',
      'processing_video'
    ];

    return {
      isValid: validStates.includes(state),
      validStates
    };
  }

  /**
   * 获取用户统计信息
   */
  async getUserStats(userId) {
    try {
      const [videoStats, interactionStats] = await Promise.all([
        this.db.query(`
          SELECT 
            COUNT(*) as total_videos,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_videos
          FROM videos 
          WHERE user_id = $1
        `, [userId]),
        
        this.db.query(`
          SELECT 
            COUNT(*) as total_interactions,
            COUNT(DISTINCT DATE(created_at)) as active_days
          FROM user_interactions 
          WHERE user_id = $1
        `, [userId])
      ]);

      return {
        videos: videoStats.rows[0],
        interactions: interactionStats.rows[0]
      };
    } catch (error) {
      console.error('❌ 获取用户统计失败:', error);
      throw error;
    }
  }
}

module.exports = UserService; 