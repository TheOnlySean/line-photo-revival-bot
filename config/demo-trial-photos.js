// 新用户免费试用的示例照片配置
const trialPhotos = [
  {
    id: 'trial_1',
    title: '女性挥手微笑',
    description: '年轻女性自然挥手的温暖场景',
    image_url: '/demo-files/1.png',
    demo_video_url: '/demo-files/1.mp4',
    type: 'wave',
    credits_demo: 0 // 免费试用
  },
  {
    id: 'trial_2', 
    title: '男性友好问候',
    description: '专业男性的亲切问候动作',
    image_url: '/demo-files/2.png',
    demo_video_url: '/demo-files/2.mp4', 
    type: 'wave',
    credits_demo: 0 // 免费试用
  },
  {
    id: 'trial_3',
    title: '情侣温馨互动',
    description: '温馨的情侣寄り添い场景', 
    image_url: '/demo-files/3.png',
    demo_video_url: '/demo-files/3.mp4',
    type: 'group',
    credits_demo: 0 // 免费试用
  }
];

// 为每个试用照片生成详细描述
const trialPhotoDetails = {
    trial_1: {
    title: '👋 女性挥手微笑',
    subtitle: '自然友好的问候场景', 
    features: ['✨ 温暖微笑', '👋 自然挥手', '🎬 高质量AI生成'],
    generation_time: '约20秒',
    demo_type: 'wave_hello'
  },
  trial_2: {
    title: '🤵 男性友好问候',
    subtitle: '专业亲切的问候动作',
    features: ['😊 亲切表情', '👋 友好手势', '🎬 专业效果'],
    generation_time: '约20秒',
    demo_type: 'wave_hello'
  },
  trial_3: {
    title: '💕 情侣温馨互动',
    subtitle: '浪漫的寄り添い场景',
    features: ['💕 温馨氛围', '🤗 亲密互动', '🎬 感人效果'], 
    generation_time: '约20秒',
    demo_type: 'group_support'
  }
};

// 试用流程配置
const trialFlowConfig = {
  welcome_delay: 2000, // welcome message后等待2秒
  generation_simulation_time: 20000, // 模拟生成20秒（用户要求加快速度）
  processing_updates: [
    { time: 5000, message: '🎬 AI正在分析您选择的照片...' },
    { time: 10000, message: '🎨 正在生成动态效果...' }, 
    { time: 15000, message: '✨ 最终优化中，即将完成...' }
  ]
};

module.exports = {
  trialPhotos,
  trialPhotoDetails,
  trialFlowConfig
}; 