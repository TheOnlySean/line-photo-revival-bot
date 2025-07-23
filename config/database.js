const { Pool } = require('pg');

// 数据库配置
const dbConfig = {
  // Neon数据库连接字符串 (映像工房共用数据库)
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_JIjeL7Dp4YrG@ep-holy-smoke-a14e7x3f-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// 创建连接池
const pool = new Pool(dbConfig);

// 连接测试
pool.on('connect', () => {
  console.log('✅ 数据库连接成功');
});

pool.on('error', (err) => {
  console.error('❌ 数据库连接错误:', err);
});

// 数据库查询封装
const db = {
  // 通用查询方法
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('📊 SQL查询:', { text, duration: `${duration}ms`, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('❌ SQL查询错误:', { text, error: error.message });
      throw error;
    }
  },

  // 用户相关查询
  async getUserByLineId(lineId) {
    const query = 'SELECT * FROM users WHERE line_id = $1';
    const result = await this.query(query, [lineId]);
    return result.rows[0];
  },

  async createLineUser(lineId, displayName, avatarUrl) {
    const query = `
      INSERT INTO users (line_id, display_name, avatar_url, auth_provider, credits, is_active)
      VALUES ($1, $2, $3, 'line', 100, true)
      ON CONFLICT (line_id) 
      DO UPDATE SET 
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await this.query(query, [lineId, displayName, avatarUrl]);
    return result.rows[0];
  },

  // 获取用户点数
  async getUserCredits(userId) {
    const query = 'SELECT credits FROM users WHERE id = $1';
    const result = await this.query(query, [userId]);
    return result.rows[0]?.credits || 0;
  },

  // 设置用户状态
  async setUserState(userId, state, data = null) {
    const query = `
      UPDATE users 
      SET current_state = $2, state_data = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.query(query, [userId, state, JSON.stringify(data)]);
    return result.rows[0];
  },

  // 获取用户状态
  async getUserState(userId) {
    const query = 'SELECT current_state, state_data FROM users WHERE id = $1';
    const result = await this.query(query, [userId]);
    const user = result.rows[0];
    return {
      state: user?.current_state || null,
      data: user?.state_data ? JSON.parse(user.state_data) : null
    };
  },

  // 清除用户状态
  async clearUserState(userId) {
    const query = `
      UPDATE users 
      SET current_state = NULL, state_data = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await this.query(query, [userId]);
  },

  async updateUserCredits(userId, creditsChange) {
    const query = `
      UPDATE users 
      SET credits = credits + $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.query(query, [userId, creditsChange]);
    return result.rows[0];
  },

  // 演示内容相关查询
  async getDemoContents() {
    const query = `
      SELECT * FROM line_demo_contents 
      WHERE is_active = true 
      ORDER BY sort_order ASC, id ASC
    `;
    const result = await this.query(query);
    return result.rows;
  },

  async insertDemoContent(title, imageUrl, videoUrl, description, sortOrder = 0) {
    const query = `
      INSERT INTO line_demo_contents (title, image_url, video_url, description, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.query(query, [title, imageUrl, videoUrl, description, sortOrder]);
    return result.rows[0];
  },

  // 视频生成记录
  async createVideoGeneration(userId, originalPrompt, isDemo = false, creditsUsed = 1) {
    const query = `
      INSERT INTO videos (user_id, original_prompt, credits_used, status)
      VALUES ($1, $2, $3, 'processing')
      RETURNING *
    `;
    const result = await this.query(query, [userId, originalPrompt, creditsUsed]);
    return result.rows[0];
  },

  async updateVideoGeneration(videoId, updates) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const query = `
      UPDATE videos 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const values = [videoId, ...Object.values(updates)];
    const result = await this.query(query, values);
    return result.rows[0];
  },

  // 交互日志
  async logInteraction(lineUserId, userId, interactionType, data = {}) {
    const query = `
      INSERT INTO line_interactions (line_user_id, user_id, interaction_type, data)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await this.query(query, [lineUserId, userId, interactionType, JSON.stringify(data)]);
    return result.rows[0];
  },

  // 关闭连接池
  async close() {
    await pool.end();
  }
};

module.exports = db; 