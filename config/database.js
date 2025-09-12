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

  // 確保用戶存在（自動創建）- 所有环境共用数据
  async ensureUserExists(lineUserId, displayName = null) {
    try {
      // 查詢用戶（不区分环境）
      const existingUser = await this.query(
        'SELECT * FROM users WHERE line_user_id = $1',
        [lineUserId]
      );

      if (existingUser.rows.length > 0) {
        return existingUser.rows[0];
      }

      // 用戶不存在，創建新用戶（environment仅作记录，不用于过滤）
      const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
      const newUser = await this.query(
        `INSERT INTO users (line_user_id, display_name, environment) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [lineUserId, displayName, environment]
      );

      console.log('✅ 新用戶創建成功:', { lineUserId, id: newUser.rows[0].id, createdIn: environment });
      return newUser.rows[0];
    } catch (error) {
      console.error('❌ 確保用戶存在失敗:', error);
      throw error;
    }
  }

  // 獲取用戶信息（所有环境共用）
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

  // 創建或更新訂閱（所有环境共用，现已包含海报配额支持）
  async upsertSubscription(userId, {
    stripeCustomerId, stripeSubscriptionId, planType, status,
    currentPeriodStart, currentPeriodEnd, monthlyVideoQuota, videosUsedThisMonth,
    monthlyPosterQuota, postersUsedThisMonth,
    cancelAtPeriodEnd = false
  }) {
    try {
      // 自动根据planType设置海报配额（如果未提供）
      if (monthlyPosterQuota === undefined) {
        monthlyPosterQuota = planType === 'standard' ? -1 : 8; // Standard无限，Trial 8张
      }
      if (postersUsedThisMonth === undefined) {
        postersUsedThisMonth = 0; // 新订阅从0开始
      }

      const existing = await this.query(
        'SELECT * FROM subscriptions WHERE user_id = $1',
        [userId]
      );

      if (existing.rows.length > 0) {
        // 更新現有訂閱（包含海报配额）
        const result = await this.query(
          `UPDATE subscriptions 
           SET stripe_customer_id = $2, stripe_subscription_id = $3, plan_type = $4,
               status = $5, current_period_start = $6, current_period_end = $7,
               monthly_video_quota = $8, videos_used_this_month = $9,
               monthly_poster_quota = $10, posters_used_this_month = $11,
               cancel_at_period_end = $12,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 
           RETURNING *`,
          [userId, stripeCustomerId, stripeSubscriptionId, planType, status, 
           currentPeriodStart, currentPeriodEnd, monthlyVideoQuota, videosUsedThisMonth,
           monthlyPosterQuota, postersUsedThisMonth, cancelAtPeriodEnd]
        );
        
        console.log(`✅ 订阅更新成功 - 用户: ${userId}, 计划: ${planType}, 视频配额: ${monthlyVideoQuota}, 海报配额: ${monthlyPosterQuota === -1 ? '无限' : monthlyPosterQuota}`);
        return result.rows[0];
      } else {
        // 創建新訂閱（包含海报配额，environment仅作记录）
        const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
        const result = await this.query(
          `INSERT INTO subscriptions 
           (user_id, stripe_customer_id, stripe_subscription_id, plan_type, status,
            current_period_start, current_period_end, monthly_video_quota, videos_used_this_month,
            monthly_poster_quota, posters_used_this_month, cancel_at_period_end, environment)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING *`,
          [userId, stripeCustomerId, stripeSubscriptionId, planType, status,
           currentPeriodStart, currentPeriodEnd, monthlyVideoQuota, videosUsedThisMonth,
           monthlyPosterQuota, postersUsedThisMonth, cancelAtPeriodEnd, environment]
        );
        
        console.log(`✅ 新订阅创建成功 - 用户: ${userId}, 计划: ${planType}, 视频配额: ${monthlyVideoQuota}, 海报配额: ${monthlyPosterQuota === -1 ? '无限' : monthlyPosterQuota}`);
        return result.rows[0];
      }
    } catch (error) {
      console.error('❌ 創建/更新訂閱失敗:', error);
      throw error;
    }
  }

  // 獲取用戶訂閱信息（所有环境共用）
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

  // 通過Stripe訂閱ID獲取訂閱（所有环境共用）
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

  // 檢查用戶是否有剩餘配額（所有环境共用）
  async checkVideoQuota(userId) {
    try {
      // 直接查询 active 状态的订阅
      const result = await this.query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
        [userId, 'active']
      );
      
      const subscription = result.rows[0];
      
      // 如果没有 active 订阅，返回无配额
      if (!subscription) {
        console.log(`🚫 用户 ${userId} 没有 active 订阅`);
        return { hasQuota: false, remaining: 0, total: 0 };
      }

      // 检查配额是否过期
      const now = new Date();
      const periodEnd = new Date(subscription.current_period_end);
      
      if (now > periodEnd) {
        console.log(`🚫 用户 ${userId} 订阅已过期 (${subscription.current_period_end})`);
        return { hasQuota: false, remaining: 0, total: subscription.monthly_video_quota };
      }

      const remaining = subscription.monthly_video_quota - subscription.videos_used_this_month;
      const hasQuota = remaining > 0;
      
      console.log(`📊 用户 ${userId} 配额检查: ${hasQuota ? '✅' : '❌'} (剩余: ${remaining}/${subscription.monthly_video_quota})`);
      
      return {
        hasQuota: hasQuota,
        remaining: remaining,
        total: subscription.monthly_video_quota,
        used: subscription.videos_used_this_month,
        planType: subscription.plan_type,
        status: subscription.status
      };
    } catch (error) {
      console.error('❌ 檢查視頻配額失敗:', error);
      throw error;
    }
  }

  // 使用視頻配額
  async useVideoQuota(userId) {
    try {
      console.log(`💰 开始扣除用户 ${userId} 的视频配额...`);
      
      const result = await this.query(
        `UPDATE subscriptions 
         SET videos_used_this_month = videos_used_this_month + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status = 'active'
         RETURNING user_id, plan_type, videos_used_this_month, monthly_video_quota`,
        [userId]
      );
      
      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        console.log(`✅ 配额扣除成功 - 用户: ${userId}, 计划: ${subscription.plan_type}, 已用: ${subscription.videos_used_this_month}/${subscription.monthly_video_quota}`);
        return subscription;
      } else {
        console.log(`⚠️ 未找到用户 ${userId} 的活跃订阅，无法扣除配额`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 扣除用户 ${userId} 视频配额失败:`, error);
      throw error;
    }
  }

  // 重置月度配額（所有环境共用，包含视频和海报配额）
  async resetMonthlyQuota(userId) {
    try {
      const result = await this.query(
        `UPDATE subscriptions 
         SET videos_used_this_month = 0,
             posters_used_this_month = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING *`,
        [userId]
      );
      
      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        const posterQuotaDisplay = subscription.monthly_poster_quota === -1 ? '无限' : subscription.monthly_poster_quota;
        console.log(`✅ 月度配额重置成功 - 用户: ${userId}, 视频: ${subscription.monthly_video_quota}, 海报: ${posterQuotaDisplay}`);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('❌ 重置月度配額失敗:', error);
      throw error;
    }
  }

  // 恢复视频配额（用于生成失败时）
  async restoreVideoQuota(userId) {
    try {
      console.log(`🔄 开始恢复用户 ${userId} 的视频配额...`);
      
      const result = await this.query(
        `UPDATE subscriptions 
         SET videos_used_this_month = GREATEST(videos_used_this_month - 1, 0),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status = 'active'
         RETURNING user_id, plan_type, videos_used_this_month, monthly_video_quota`,
        [userId]
      );
      
      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        console.log(`✅ 配额恢复成功 - 用户: ${userId}, 计划: ${subscription.plan_type}, 已用: ${subscription.videos_used_this_month}/${subscription.monthly_video_quota}`);
        return subscription;
      } else {
        console.log(`⚠️ 未找到用户 ${userId} 的活跃订阅，无法恢复配额`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 恢复用户 ${userId} 视频配额失败:`, error);
      throw error;
    }
  }

  // === 海报配额管理方法（与视频配额保持一致的结构） ===

  // 检查用户是否有剩余海报配额
  async checkPosterQuota(userId) {
    try {
      // 直接查询 active 状态的订阅
      const result = await this.query(
        'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
        [userId, 'active']
      );
      
      const subscription = result.rows[0];
      
      // 如果没有 active 订阅，返回无配额
      if (!subscription) {
        console.log(`🚫 用户 ${userId} 没有 active 订阅`);
        return { hasQuota: false, remaining: 0, total: 0 };
      }

      // 检查配额是否过期
      const now = new Date();
      const periodEnd = new Date(subscription.current_period_end);
      
      if (now > periodEnd) {
        console.log(`🚫 用户 ${userId} 订阅已过期 (${subscription.current_period_end})`);
        return { hasQuota: false, remaining: 0, total: subscription.monthly_poster_quota };
      }

      // Standard用户无限海报配额（用-1表示无限）
      if (subscription.monthly_poster_quota === -1) {
        console.log(`📸 用户 ${userId} Standard计划海报配额检查: ✅ (无限制)`);
        return {
          hasQuota: true,
          remaining: -1, // -1表示无限
          total: -1,
          used: subscription.posters_used_this_month,
          planType: subscription.plan_type,
          status: subscription.status,
          isUnlimited: true
        };
      }

      // Trial用户有限海报配额
      const remaining = subscription.monthly_poster_quota - subscription.posters_used_this_month;
      const hasQuota = remaining > 0;
      
      console.log(`📸 用户 ${userId} 海报配额检查: ${hasQuota ? '✅' : '❌'} (剩余: ${remaining}/${subscription.monthly_poster_quota})`);
      
      return {
        hasQuota: hasQuota,
        remaining: remaining,
        total: subscription.monthly_poster_quota,
        used: subscription.posters_used_this_month,
        planType: subscription.plan_type,
        status: subscription.status,
        isUnlimited: false
      };
    } catch (error) {
      console.error('❌ 檢查海報配額失敗:', error);
      throw error;
    }
  }

  // 使用海报配额
  async usePosterQuota(userId) {
    try {
      console.log(`💰 开始扣除用户 ${userId} 的海报配额...`);
      
      // 先检查是否为Standard用户（无限配额）
      const quotaCheck = await this.checkPosterQuota(userId);
      if (quotaCheck.isUnlimited) {
        console.log(`✅ Standard用户无限海报配额，无需扣除 - 用户: ${userId}`);
        // 仍然记录使用次数以便统计
        const result = await this.query(
          `UPDATE subscriptions 
           SET posters_used_this_month = posters_used_this_month + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND status = 'active'
           RETURNING user_id, plan_type, posters_used_this_month, monthly_poster_quota`,
          [userId]
        );
        return result.rows[0];
      }
      
      // Trial用户扣除配额
      const result = await this.query(
        `UPDATE subscriptions 
         SET posters_used_this_month = posters_used_this_month + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status = 'active'
         RETURNING user_id, plan_type, posters_used_this_month, monthly_poster_quota`,
        [userId]
      );
      
      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        const quotaDisplay = subscription.monthly_poster_quota === -1 ? '无限' : subscription.monthly_poster_quota;
        console.log(`✅ 海报配额扣除成功 - 用户: ${userId}, 计划: ${subscription.plan_type}, 已用: ${subscription.posters_used_this_month}/${quotaDisplay}`);
        return subscription;
      } else {
        console.log(`⚠️ 未找到用户 ${userId} 的活跃订阅，无法扣除海报配额`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 扣除用户 ${userId} 海报配额失败:`, error);
      throw error;
    }
  }

  // 恢复海报配额（用于生成失败时）
  async restorePosterQuota(userId) {
    try {
      console.log(`🔄 开始恢复用户 ${userId} 的海报配额...`);
      
      const result = await this.query(
        `UPDATE subscriptions 
         SET posters_used_this_month = GREATEST(posters_used_this_month - 1, 0),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status = 'active'
         RETURNING user_id, plan_type, posters_used_this_month, monthly_poster_quota`,
        [userId]
      );
      
      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        const quotaDisplay = subscription.monthly_poster_quota === -1 ? '无限' : subscription.monthly_poster_quota;
        console.log(`✅ 海报配额恢复成功 - 用户: ${userId}, 计划: ${subscription.plan_type}, 已用: ${subscription.posters_used_this_month}/${quotaDisplay}`);
        return subscription;
      } else {
        console.log(`⚠️ 未找到用户 ${userId} 的活跃订阅，无法恢复海报配额`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 恢复用户 ${userId} 海报配额失败:`, error);
      throw error;
    }
  }

  // === 海报模板管理方法 ===

  // 获取所有活跃的海报模板
  async getActivePosterTemplates() {
    try {
      const result = await this.query(
        'SELECT * FROM poster_templates WHERE is_active = true ORDER BY sort_order ASC, created_at ASC'
      );
      
      console.log(`📸 获取到 ${result.rows.length} 个活跃海报模板`);
      return result.rows;
    } catch (error) {
      console.error('❌ 获取海报模板失败:', error);
      throw error;
    }
  }

  // 随机选择一个海报模板
  async getRandomPosterTemplate() {
    try {
      const result = await this.query(
        'SELECT * FROM poster_templates WHERE is_active = true ORDER BY RANDOM() LIMIT 1'
      );
      
      if (result.rows.length > 0) {
        const template = result.rows[0];
        console.log(`🎨 随机选择海报模板: ${template.template_name} (${template.style_category})`);
        return template;
      } else {
        console.log('⚠️ 没有找到活跃的海报模板');
        return null;
      }
    } catch (error) {
      console.error('❌ 随机选择海报模板失败:', error);
      throw error;
    }
  }

  // 根据分类获取海报模板
  async getPosterTemplatesByCategory(category) {
    try {
      const result = await this.query(
        'SELECT * FROM poster_templates WHERE is_active = true AND style_category = $1 ORDER BY sort_order ASC',
        [category]
      );
      
      console.log(`🎨 获取 ${category} 分类的海报模板: ${result.rows.length} 个`);
      return result.rows;
    } catch (error) {
      console.error('❌ 根据分类获取海报模板失败:', error);
      throw error;
    }
  }

  // 更新海报模板URL（上传真实图片后使用）
  async updatePosterTemplateUrl(templateName, newUrl) {
    try {
      const result = await this.query(
        `UPDATE poster_templates 
         SET template_url = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE template_name = $1 
         RETURNING *`,
        [templateName, newUrl]
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ 海报模板URL更新成功: ${templateName}`);
        return result.rows[0];
      } else {
        console.log(`⚠️ 未找到模板: ${templateName}`);
        return null;
      }
    } catch (error) {
      console.error('❌ 更新海报模板URL失败:', error);
      throw error;
    }
  }

  // 添加新的海报模板
  async addPosterTemplate(templateData) {
    try {
      const { templateName, templateUrl, description, styleCategory, sortOrder = 0 } = templateData;
      
      const result = await this.query(
        `INSERT INTO poster_templates 
         (template_name, template_url, description, style_category, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [templateName, templateUrl, description, styleCategory, sortOrder]
      );
      
      console.log(`✅ 新海报模板添加成功: ${templateName}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ 添加海报模板失败:', error);
      throw error;
    }
  }

  // === 海报生成任务跟踪方法 ===

  // 创建海报生成任务记录
  async createPosterTask(userId, lineUserId, originalImageUrl) {
    try {
      const result = await this.query(
        `INSERT INTO poster_tasks (user_id, line_user_id, status, step, original_image_url, created_at)
         VALUES ($1, $2, 'processing', 1, $3, NOW())
         RETURNING *`,
        [userId, lineUserId, originalImageUrl]
      );
      
      console.log(`✅ 海报任务记录创建成功 - 用户: ${lineUserId}, ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ 创建海报任务记录失败:', error);
      throw error;
    }
  }

  // 更新海报任务状态
  async updatePosterTask(taskId, updates) {
    try {
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      const values = [taskId, ...Object.values(updates)];
      
      const result = await this.query(
        `UPDATE poster_tasks 
         SET ${setClause}, updated_at = NOW()
         WHERE id = $1 
         RETURNING *`,
        values
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ 海报任务更新成功 - ID: ${taskId}, 状态: ${updates.status || '未改变'}`);
        return result.rows[0];
      } else {
        console.log(`⚠️ 未找到海报任务: ${taskId}`);
        return null;
      }
    } catch (error) {
      console.error('❌ 更新海报任务失败:', error);
      throw error;
    }
  }

  // 获取用户当前的海报生成任务
  async getUserActivePosterTask(lineUserId) {
    try {
      const result = await this.query(
        `SELECT * FROM poster_tasks 
         WHERE line_user_id = $1 AND status = 'processing'
         ORDER BY created_at DESC 
         LIMIT 1`,
        [lineUserId]
      );
      
      if (result.rows.length > 0) {
        const task = result.rows[0];
        console.log(`📸 找到活跃海报任务 - 用户: ${lineUserId}, 步骤: ${task.step}`);
        return task;
      } else {
        console.log(`📸 用户 ${lineUserId} 没有活跃的海报任务`);
        return null;
      }
    } catch (error) {
      console.error('❌ 获取用户海报任务失败:', error);
      throw error;
    }
  }

  // 完成海报任务
  async completePosterTask(taskId, finalPosterUrl) {
    try {
      const result = await this.query(
        `UPDATE poster_tasks 
         SET status = 'completed', final_poster_url = $2, updated_at = NOW()
         WHERE id = $1 
         RETURNING *`,
        [taskId, finalPosterUrl]
      );
      
      console.log(`✅ 海报任务完成 - ID: ${taskId}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ 完成海报任务失败:', error);
      throw error;
    }
  }

  // 标记海报任务失败
  async failPosterTask(taskId, errorMessage) {
    try {
      const result = await this.query(
        `UPDATE poster_tasks 
         SET status = 'failed', error_message = $2, updated_at = NOW()
         WHERE id = $1 
         RETURNING *`,
        [taskId, errorMessage]
      );
      
      console.log(`❌ 海报任务失败 - ID: ${taskId}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ 标记海报任务失败:', error);
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

      const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
      const result = await this.query(
        `INSERT INTO videos 
         (user_id, subscription_id, task_id, prompt_text, image_url, status, environment)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, subscriptionId, taskId, promptText, imageUrl, status, environment]
      );
      return result.rows[0];
    } catch (error) {
      console.error('❌ 創建視頻記錄失敗:', error);
      throw error;
    }
  }

  // 更新視頻狀態（所有环境共用）
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

  // 獲取用戶的處理中任務（按创建时间降序排列）
  // 修复：移除严格的环境过滤，允许跨环境任务查询
  async getUserPendingTasks(lineUserId) {
    try {
      console.log(`🔍 查询用户 ${lineUserId} 的待处理任务...`);
      
      // 移除环境过滤，允许查找所有环境中的任务
      // 这修复了用户在开发环境但任务在生产环境创建的问题
      const result = await this.query(
        `SELECT v.*, v.environment as video_env, u.environment as user_env
         FROM videos v 
         JOIN users u ON v.user_id = u.id 
         WHERE u.line_user_id = $1 AND v.status IN ('pending', 'processing') 
         ORDER BY v.created_at DESC`,
        [lineUserId]
      );
      
      console.log(`📊 找到 ${result.rows.length} 个待处理任务`);
      if (result.rows.length > 0) {
        result.rows.forEach((task, index) => {
          console.log(`   ${index + 1}. ID: ${task.id}, 状态: ${task.status}, task_id: ${task.task_id || 'null'}, 用户环境: ${task.user_env}, 视频环境: ${task.video_env}`);
        });
      }
      
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