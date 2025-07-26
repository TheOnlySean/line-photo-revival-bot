// 新用户免费试用的示例照片配置（使用Vercel Blob存储 - trial子文件夹）
const trialPhotos = [
  {
    id: 'trial_1',
    title: 'おばあちゃんの親切な微笑み',
    description: '温かい笑顔で迎えてくれるおばあちゃんのシーン',
    image_url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/1-avVzCLIlMDcxjLFpS5NLqwyUlt3sBm.png',
    demo_video_url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/1-kTLJV1Tr2PlM0DHtR4lNc8QoVp7Zdv.mp4',
    type: 'wave',
    credits_demo: 0 // 免費試用
  },
  {
    id: 'trial_2', 
    title: '子犬の可愛らしい様子',
    description: '愛らしい子犬の自然な表情と動作',
    image_url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/2-lwqPaIWZj0imE9WuqhFsbH8t6TpgZW.png',
    demo_video_url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/2-YqQn4tn1AMrHbOPFJEKsrmxGlKmRxa.mp4', 
    type: 'wave',
    credits_demo: 0 // 免費試用
  },
  {
    id: 'trial_3',
    title: 'お互いに寄り添い微笑み手を振る',
    description: '温かく寄り添いながら手を振る心温まるシーン', 
    image_url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/3-LwaXeLMhrX0tRybxr9K6c4i5CgAKR9.png',
    demo_video_url: 'https://gvzacs1zhqba8qzq.public.blob.vercel-storage.com/demo-files/trial/3-uDfuUyB0qisch3KEBCUVytFthsSd15.mp4',
    type: 'group',
    credits_demo: 0 // 免費試用
  }
];

// 为每个试用照片生成详细描述
const trialPhotoDetails = {
    trial_1: {
    title: '👋 女性手振り微笑み',
    subtitle: '自然で友好的な挨拶シーン', 
    features: ['✨ 温かい微笑み', '👋 自然な手振り', '🎬 高品質AI生成'],
    generation_time: '約20秒',
    demo_type: 'wave_hello'
  },
  trial_2: {
    title: '🤵 男性友好挨拶',
    subtitle: 'プロフェッショナルで親しみやすい挨拶動作',
    features: ['😊 親しみやすい表情', '👋 友好的な手振り', '🎬 プロフェッショナルな効果'],
    generation_time: '約20秒',
    demo_type: 'wave_hello'
  },
  trial_3: {
    title: '💕 カップル温かい触れ合い',
    subtitle: 'ロマンチックな寄り添いシーン',
    features: ['💕 温かい雰囲気', '🤗 親密な触れ合い', '🎬 感動的な効果'], 
    generation_time: '約20秒',
    demo_type: 'group_support'
  }
};

// 試用フロー設定
const trialFlowConfig = {
  welcome_delay: 2000, // ウェルカムメッセージ後2秒待機
  generation_simulation_time: 20000, // 生成を20秒シミュレート（ユーザーの要求で高速化）
  processing_updates: [
    { time: 5000, message: '🎬 AIが選択された写真を分析中...' },
    { time: 10000, message: '🎨 動的効果を生成中...' }, 
    { time: 15000, message: '✨ 最終最適化中、まもなく完成...' }
  ]
};

module.exports = {
  trialPhotos,
  trialPhotoDetails,
  trialFlowConfig
}; 