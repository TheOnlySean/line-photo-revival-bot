/**
 * 简单的支付成功页面
 */
module.exports = (req, res) => {
  const { plan = 'trial' } = req.query;
  
  const planName = plan === 'standard' ? 'スタンダードプラン' : 'お試しプラン';
  const planDetails = plan === 'standard' ? '月100本の動画生成' : '月8本の動画生成';
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>お支払い完了</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
    .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; }
    .success { font-size: 48px; margin-bottom: 20px; }
    h1 { color: #333; }
    .plan { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">🎉</div>
    <h1>お支払い完了</h1>
    <p>ありがとうございます！</p>
    <div class="plan">
      <strong>${planName}</strong><br>
      ${planDetails}
    </div>
    <p>LINEアプリに戻って動画生成をお楽しみください！</p>
  </div>
</body>
</html>
  `);
}; 