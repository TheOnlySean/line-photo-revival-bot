const Database = require('../../config/database');
const LineAdapter = require('../../adapters/line-adapter');
const MessageTemplates = require('../../utils/message-templates');

const db = new Database();
const lineAdapter = new LineAdapter();

/**
 * 处理订阅支付成功后的重定向
 */
module.exports = async (req, res) => {
  console.log('🎉 收到订阅支付成功请求');
  
  try {
    const { plan, session_id } = req.query;
    
    console.log(`📋 支付信息: plan=${plan}, session_id=${session_id}`);
    
    // 生成一个简单的成功页面，并尝试通过LINE发送确认消息
    const successPageHtml = `
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
          .btn {
            display: inline-block;
            background: #00C851;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin-top: 20px;
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
            <strong>${plan === 'trial' ? 'お試しプラン' : 'スタンダードプラン'}</strong><br>
            ${plan === 'trial' ? '月8本の動画生成' : '月100本の動画生成'}
          </div>
          
          <p>LINEにて確認メッセージをお送りしております。<br>すぐに動画生成をお楽しみください！</p>
          
          <div class="line-return">
            <p>このページは自動的に閉じることができます。<br>LINEアプリに戻って動画生成をお試しください。</p>
          </div>
        </div>
        
        <script>
          // 5秒後に自動的にLINEアプリに戻る（モバイルの場合）
          setTimeout(() => {
            if (window.navigator.userAgent.includes('Line')) {
              window.close();
            }
          }, 5000);
        </script>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(successPageHtml);
    
    // 注意：实际的LINE消息发送需要通过webhook来处理
    // 因为我们需要用户的LINE ID，而这个信息在支付完成时不直接可用
    console.log('✅ 支付成功页面已显示');
    
  } catch (error) {
    console.error('❌ 处理支付成功失败:', error);
    
    const errorPageHtml = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>エラー - 写真復活</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 100%;
          }
          .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            color: #e74c3c;
            margin-bottom: 10px;
          }
          p {
            color: #666;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>処理エラー</h1>
          <p>申し訳ございません。処理中にエラーが発生しました。<br>LINEアプリに戻ってお試しください。</p>
        </div>
      </body>
      </html>
    `;
    
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(errorPageHtml);
  }
}; 