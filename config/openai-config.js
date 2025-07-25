const { OpenAI } = require('openai');

// OpenAI配置
const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY, // 从环境变量获取API Key
  model: 'gpt-4o-mini',
  maxTokens: 150,
  temperature: 0.3 // 低temperature确保翻译一致性
};

// 创建OpenAI客户端（timeout在这里设置）
const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
  timeout: 10000 // 10秒超时
});

// System Prompt - 简洁版
const TRANSLATION_SYSTEM_PROMPT = `You are a Prompt Engineer specializing in translating Japanese text to English prompts optimized for AI video generation models like Runway and Pika Labs.

Rules:
- Translate Japanese to concise, clear English
- Focus on visual actions and scenes
- Keep prompts under 100 characters when possible
- Add cinematic quality descriptors
- Return only the English prompt, no explanations`;

module.exports = {
  openai,
  openaiConfig,
  TRANSLATION_SYSTEM_PROMPT
}; 