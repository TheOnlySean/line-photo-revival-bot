/**
 * 调试API：查看最近收到的LINE Webhook事件
 * 用于验证Official Account Manager设置是否正确
 */

export default function handler(req, res) {
  // 简单的管理员验证
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey !== 'debug-events-2024') {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: '需要管理员密钥'
    });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 获取最近的事件
    const recentEvents = global.recentLineEvents || [];
    
    // 统计事件类型
    const eventStats = recentEvents.reduce((stats, event) => {
      stats[event.type] = (stats[event.type] || 0) + 1;
      return stats;
    }, {});

    // 生成HTML响应便于查看
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>LINE Bot 事件调试</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { background: #06c755; color: white; padding: 15px; border-radius: 5px; }
            .stats { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
            .event { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
            .event-follow { border-left: 5px solid #06c755; }
            .event-message { border-left: 5px solid #0084ff; }
            .event-other { border-left: 5px solid #ff9500; }
            .timestamp { color: #666; font-size: 0.9em; }
            .json { background: #f8f8f8; padding: 10px; border-radius: 3px; overflow-x: auto; }
            .refresh { margin: 10px 0; }
            button { background: #06c755; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔍 LINE Bot 事件监控</h1>
            <p>实时查看 Webhook 接收到的事件，用于调试 Official Account Manager 设置</p>
        </div>

        <div class="refresh">
            <button onclick="location.reload()">🔄 刷新页面</button>
            <span style="margin-left: 10px;">⚡ 最后更新: ${new Date().toLocaleString('zh-CN')}</span>
        </div>

        <div class="stats">
            <h3>📊 事件统计 (最近 ${recentEvents.length} 个事件)</h3>
            ${Object.entries(eventStats).map(([type, count]) => 
              `<span style="margin-right: 15px;"><strong>${type}:</strong> ${count}</span>`
            ).join('')}
        </div>

        <div>
            <h3>📋 事件详情</h3>
            ${recentEvents.length === 0 ? 
              '<p>🚨 没有收到任何事件！请检查Official Account Manager设置。</p>' :
              recentEvents.map(event => `
                <div class="event event-${event.type}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4>🎯 ${event.type.toUpperCase()} 事件</h4>
                        <div class="timestamp">
                            📅 ${new Date(event.receivedAt).toLocaleString('zh-CN')}
                        </div>
                    </div>
                    <p><strong>用户ID:</strong> ${event.source?.userId || 'N/A'}</p>
                    ${event.type === 'follow' ? 
                      '<p style="color: #06c755;"><strong>✅ 用户添加好友事件 - 这是我们想要的！</strong></p>' : 
                      event.type === 'message' ? 
                        `<p><strong>💬 消息:</strong> ${event.message?.text || event.message?.type}</p>` : 
                        ''
                    }
                    <details>
                        <summary>查看完整JSON</summary>
                        <pre class="json">${JSON.stringify(event, null, 2)}</pre>
                    </details>
                </div>
              `).join('')
            }
        </div>

        <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border-radius: 5px;">
            <h4>🔧 故障排除指南</h4>
            <ul>
                <li><strong>看不到 follow 事件：</strong> Official Account Manager 后台的"加好友訊息"仍然开启</li>
                <li><strong>看不到 message 事件：</strong> "自動回應訊息"或"AI回應"仍然开启</li>
                <li><strong>完全没有事件：</strong> Webhook URL未正确设置或未开启</li>
            </ul>
        </div>

        <script>
            // 每30秒自动刷新
            setTimeout(() => location.reload(), 30000);
        </script>
    </body>
    </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('获取事件失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
} 