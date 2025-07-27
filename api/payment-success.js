/**
 * 支付成功页面API端点
 * 返回一个简单的HTML页面
 */
module.exports = async (req, res) => {
  try {
    const { plan = 'trial', user_id } = req.query;
    
    console.log(`🎉 支付成功页面访问: plan=${plan}, user_id=${user_id}`);
    
    // 根据计划类型设置页面内容
    const planName = plan === 'standard' ? 'スタンダードプラン' : 'お試しプラン';
    const planDetails = plan === 'standard' ? '月100本の動画生成' : '月8本の動画生成';
    
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>お支払い完了 - 写真復活</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    .success-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 24px;
    }
    p {
      color: #666;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .plan-info {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .line-return {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #888;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">🎉</div>
    <h1>お支払い完了</h1>
    <p>ありがとうございます！<br>サブスクリプションのお支払いが完了いたしました。</p>

    <div class="plan-info">
      <strong>${planName}</strong><br>
      <span>${planDetails}</span>
    </div>

    <p>LINEにて確認メッセージをお送りしております。<br>すぐに動画生成をお楽しみください！</p>

    <div class="line-return">
      <p>このページは自動的に閉じることができます。<br>LINEアプリに戻って動画生成をお試しください。</p>
    </div>
  </div>

  <script>
    // 5秒后尝试关闭页面（在LINE应用中）
    setTimeout(() => {
      if (window.navigator.userAgent.includes('Line')) {
        window.close();
      }
    }, 5000);
  </script>
</body>
</html>`;

    // 设置正确的Content-Type
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('❌ 支付成功页面错误:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}; 