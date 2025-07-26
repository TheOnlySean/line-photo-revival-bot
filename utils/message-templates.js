/**
 * 消息模板工厂 - 生成LINE消息模板，与业务逻辑解耦
 * 职责：创建各种消息格式（文本、Flex Message、Carousel等）
 */
class MessageTemplates {
  
  /**
   * 创建欢迎消息
   */
  static createWelcomeMessage() {
    return {
      type: 'text',
      text: '🎉 **写真復活へようこそ！**\n\n✨ AIが古い写真を美しい動画に変換します\n\n🎁 新規ユーザー様には無料体験をご用意しております'
    };
  }

  /**
   * 创建演示视频选择轮播
   */
  static createDemoVideoCarousel(trialPhotos) {
    return {
      type: 'flex',
      altText: '🎁 無料体験 - サンプル写真を選択',
      contents: {
        type: 'carousel',
        contents: trialPhotos.map(photo => ({
          type: 'bubble',
          hero: {
            type: 'image',
            url: photo.image_url,
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'cover'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: photo.title || 'サンプル写真',
                weight: 'bold',
                size: 'md',
                color: '#333333'
              },
              {
                type: 'text',
                text: '⏱️ 生成時間: 約15秒',
                size: 'xs',
                color: '#999999',
                margin: 'md'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🎬 この写真で体験',
                  data: `action=demo_generate&photo_id=${photo.id}`
                },
                style: 'primary',
                color: '#FF6B9D'
              }
            ]
          }
        }))
      }
    };
  }

  /**
   * 创建视频生成确认卡片
   */
  static createGenerationConfirmCard(imageUrl, prompt, quotaInfo = null) {
    return {
      type: 'flex',
      altText: '🎬 動画生成確認',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎬 動画生成確認',
              weight: 'bold',
              size: 'lg',
              color: '#333333'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            // 配額信息
            ...(quotaInfo ? [{
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '📊 今月の残り動画数:',
                  size: 'sm',
                  color: '#666666',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: `${quotaInfo.remaining}/${quotaInfo.total} 本`,
                  size: 'md',
                  color: quotaInfo.remaining > 5 ? '#42C76A' : '#FF6B6B',
                  weight: 'bold',
                  margin: 'xs'
                }
              ]
            }, {
              type: 'separator',
              margin: 'md'
            }] : []),
            // 無圖片提示
            ...(imageUrl === null ? [{
              type: 'box',
              layout: 'vertical',
              margin: quotaInfo ? 'sm' : 'md',
              contents: [
                {
                  type: 'text',
                  text: '📝 生成方式:',
                  size: 'sm',
                  color: '#666666',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: 'プロンプトのみで生成',
                  size: 'sm',
                  color: '#FF6B9D',
                  weight: 'bold',
                  margin: 'xs'
                }
              ]
            }, {
              type: 'separator',
              margin: 'md'
            }] : []),
            {
              type: 'box',
              layout: 'vertical',
              margin: (quotaInfo || imageUrl === null) ? 'sm' : 'md',
              contents: [
                {
                  type: 'text',
                  text: '📝 プロンプト:',
                  size: 'sm',
                  color: '#666666',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: prompt,
                  size: 'sm',
                  color: '#333333',
                  wrap: true,
                  margin: 'xs'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#42C76A',
              height: 'sm',
              action: {
                type: 'postback',
                label: '🎬 動画を生成する',
                data: 'action=confirm_generate'
              }
            }
          ]
        }
      }
    };
  }

  /**
   * 创建配额不足消息卡片
   */
  static createInsufficientQuotaCard(quotaInfo) {
    const { remaining, total, planType, needsUpgrade, resetDate } = quotaInfo;
    
    return {
      type: 'flex',
      altText: '📊 動画生成配額について',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📊 配額不足',
              weight: 'bold',
              size: 'lg',
              color: '#FF6B35'
            },
            {
              type: 'text',
              text: `今月の利用可能回数: ${remaining}/${total}`,
              size: 'md',
              color: '#666666',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: needsUpgrade 
                ? '✨ スタンダードプランにアップグレードして、月100本の動画を生成できます！'
                : resetDate 
                  ? `📅 配額リセット日: ${resetDate}`
                  : '📅 訂閱後30日ごとに配額がリセットされます。',
              size: 'sm',
              color: '#333333',
              wrap: true,
              margin: 'lg'
            }
          ]
        },
        footer: needsUpgrade ? {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#FF6B35',
              action: {
                type: 'postback',
                label: '💎 アップグレード',
                data: 'action=UPGRADE_PLAN'
              }
            }
          ]
        } : undefined
      }
    };
  }

  /**
   * 创建支付选项卡片
   */
  static createPaymentOptionsCarousel() {
    const trialUrl = process.env.STRIPE_TRIAL_URL || 'https://buy.stripe.com/5kQ9AS2JJ09gfdB96ncs804';
    const standardUrl = process.env.STRIPE_STANDARD_URL || 'https://buy.stripe.com/8x26oG8437BI3uTcizcs805';
    return {
      type: 'flex',
      altText: '💳 支払いプランを選択',
      contents: {
        type: 'carousel',
        contents: [
          {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://via.placeholder.com/400x200/FF6B9D/FFFFFF?text=Trial+Plan',
              size: 'full',
              aspectRatio: '2:1',
              aspectMode: 'cover'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'Trial Plan',
                  weight: 'bold',
                  size: 'xl'
                },
                {
                  type: 'text',
                  text: '¥300/月',
                  size: 'lg',
                  color: '#FF6B9D',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '8本の動画生成',
                  size: 'sm',
                  color: '#666666'
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#FF6B9D',
                  action: {
                    type: 'uri',
                    label: '申し込む',
                    uri: trialUrl
                  }
                }
              ]
            }
          },
          {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://via.placeholder.com/400x200/42C76A/FFFFFF?text=Standard+Plan',
              size: 'full',
              aspectRatio: '2:1',
              aspectMode: 'cover'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'Standard Plan',
                  weight: 'bold',
                  size: 'xl'
                },
                {
                  type: 'text',
                  text: '¥2,980/月',
                  size: 'lg',
                  color: '#42C76A',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '100本の動画生成',
                  size: 'sm',
                  color: '#666666'
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#42C76A',
                  action: {
                    type: 'uri',
                    label: '申し込む',
                    uri: standardUrl
                  }
                }
              ]
            }
          }
        ]
      }
    };
  }

  /**
   * 创建订阅状态显示消息
   */
  static createSubscriptionStatusMessage(subscription) {
    const planName = subscription.plan_type === 'trial' ? 'Trial Plan' : 'Standard Plan';
    const planPrice = subscription.plan_type === 'trial' ? '¥300/月' : '¥2,980/月';
    const monthlyQuota = subscription.monthly_video_quota;
    const used = subscription.videos_used_this_month || 0;
    const remaining = monthlyQuota - used;
    
    return {
      type: 'flex',
      altText: '📋 サブスクリプション状態',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📋 現在のプラン',
              weight: 'bold',
              size: 'lg',
              color: '#333333'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: planName,
                  size: 'xl',
                  weight: 'bold',
                  color: subscription.plan_type === 'trial' ? '#FF6B9D' : '#42C76A'
                },
                {
                  type: 'text',
                  text: planPrice,
                  size: 'md',
                  color: '#666666',
                  margin: 'xs'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '📊 今月の利用状況:',
                  size: 'sm',
                  color: '#666666',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: `残り ${remaining}/${monthlyQuota} 本`,
                  size: 'lg',
                  color: remaining > 5 ? '#42C76A' : '#FF6B6B',
                  weight: 'bold',
                  margin: 'xs'
                }
              ]
            }
          ]
        }
      }
    };
  }

  /**
   * 创建升级提示卡片（Trial -> Standard）
   */
  static createUpgradePromptCard(subscription) {
    const used = subscription.videos_used_this_month || 0;
    const remaining = subscription.monthly_video_quota - used;
    
    return {
      type: 'flex',
      altText: '⬆️ プラン升級',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '⬆️ プラン升級',
              weight: 'bold',
              size: 'lg',
              color: '#333333'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '現在：Trial Plan (¥300/月)',
                  size: 'md',
                  color: '#FF6B9D',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: `残り ${remaining}/8 本`,
                  size: 'sm',
                  color: '#666666',
                  margin: 'xs'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: 'Standard Plan にアップグレードしませんか？',
                  size: 'md',
                  color: '#333333',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• ¥2,980/月\n• 100本の動画生成\n• より多くの機能',
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#42C76A',
              action: {
                type: 'postback',
                label: '⬆️ Standard にアップグレード',
                data: 'action=UPGRADE_TO_STANDARD'
              }
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: 'キャンセル',
                data: 'action=CANCEL_UPGRADE'
              }
            }
          ]
        }
      }
    };
  }

  /**
   * 创建优惠券功能卡片
   */
  static createCouponCard() {
    return {
      type: 'flex',
      altText: '🎟️ 優惠券・充值オプション',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎟️ 優惠券・充值',
              weight: 'bold',
              size: 'lg',
              color: '#8B5A96'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: '現在利用可能なクーポンはありません',
                  size: 'sm',
                  color: '#666666',
                  wrap: true,
                  align: 'center',
                  margin: 'md'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '💳 プラン変更',
                data: 'action=CHANGE_PLAN'
              },
              style: 'primary',
              color: '#8B5A96'
            }
          ]
        }
      }
    };
  }

  /**
   * 创建官网客服卡片
   */
  static createWebsiteCard() {
    return {
      type: 'flex',
      altText: '🌐 官方網站・カスタマーサポート',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🌐 官方サポート',
              weight: 'bold',
              size: 'lg',
              color: '#4A90E2'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: 'ご質問・お困りごとがございましたら、お気軽にお問い合わせください。',
                  size: 'sm',
                  color: '#666666',
                  wrap: true,
                  align: 'center',
                  margin: 'md'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '🌐 公式サイトへ',
                uri: 'https://example.com/support'
              },
              style: 'primary',
              color: '#4A90E2'
            }
          ]
        }
      }
    };
  }

  /**
   * 创建好友分享卡片
   */
  static createShareCard(channelId) {
    return {
      type: 'flex',
      altText: '👥 友達にシェア',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '👥 友達にシェア',
              weight: 'bold',
              size: 'lg',
              color: '#8B5A96'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: '写真復活を友達に紹介して、一緒に思い出を動画にしませんか？',
                  size: 'sm',
                  color: '#666666',
                  wrap: true,
                  align: 'center',
                  margin: 'md'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '📱 友達に紹介する',
                uri: `https://line.me/R/nv/recommendOA/@${channelId}`
              },
              style: 'primary',
              color: '#8B5A96'
            }
          ]
        }
      }
    };
  }

  /**
   * 创建动作选择消息
   */
  static createActionSelectionMessages(actionType) {
    const messages = {
      wave: [
        {
          type: 'text',
          text: '👋 手振り動画生成\n\n写真の人物が自然に手を振る動画を作成します。\n\n📸 写真をアップロードしてください：'
        }
      ],
      group: [
        {
          type: 'text',
          text: '👨‍👩‍👧‍👦 寄り添い動画生成\n\n家族や友人との温かい瞬間を動画にします。\n\n📸 写真をアップロードしてください：'
        }
      ],
      personalize: [
        {
          type: 'text',
          text: '✏️ 個性化プロンプト設定\n\n動画のスタイルや雰囲気を自由に入力してください：\n\n例：\n・ゆっくりと微笑む\n・懐かしい雰囲気で\n・映画のようなドラマチックに'
        }
      ]
    };

    return messages[actionType] || [
      {
        type: 'text',
        text: '🤔 申し訳ございません。下部のメニューからご利用ください。'
      }
    ];
  }

  /**
   * 创建视频生成状态消息
   */
  static createVideoStatusMessages(status, options = {}) {
    const messages = {
      starting: {
        type: 'text',
        text: '🎬 動画生成を開始します！\n\n⏱️ 約3-5分で完成します。お待ちください...'
      },
      processing: {
        type: 'text',
        text: '🎬 テスト動画を生成中...\n\n⏱️ 約15秒でお送りします！'
      },
      completed: [
        {
          type: 'text',
          text: '🎉 **動画生成完了！**\n\nいかがでしょうか？\n\n他の写真でも試してみたい場合は、下部メニューからどうぞ！'
        },
        {
          type: 'video',
          originalContentUrl: options.videoUrl,
          previewImageUrl: options.thumbnailUrl || options.videoUrl
        }
      ],
      demo_completed: [
        {
          type: 'text',
          text: '🎉 **テスト動画生成完了！**\n\nいかがでしょうか？\n\n実際の写真で試してみたい場合は、下部メニューからご利用ください！'
        },
        {
          type: 'video',
          originalContentUrl: options.videoUrl,
          previewImageUrl: options.thumbnailUrl
        }
      ],
      failed: {
        type: 'text',
        text: '❌ 申し訳ございません。動画の生成に失敗しました。\n\n再度お試しいただくか、しばらく時間を置いてからお試しください。'
      }
    };

    return messages[status] || messages.failed;
  }

  /**
   * 创建错误消息
   */
  static createErrorMessage(errorType = 'general') {
    const messages = {
      general: '❌ 申し訳ございません。エラーが発生しました。',
      image_upload: '❌ 画像のアップロードに失敗しました。再度お試しください。',
      quota_check: '❌ 配額の確認に失敗しました。しばらくしてから再度お試しください。',
      video_generation: '❌ 動画生成処理中にエラーが発生しました。再度お試しください。',
      system: '❌ システムエラーが発生しました。管理者にお問い合わせください。'
    };

    return {
      type: 'text',
      text: messages[errorType] || messages.general
    };
  }

  /**
   * 创建简单文本消息
   */
  static createTextMessage(text) {
    return {
      type: 'text',
      text: text
    };
  }

  static createPersonalizePromptSelection() {
    return {
      type: 'flex',
      altText: '✏️ プロンプト設定方法を選択してください',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '✏️ プロンプト設定方法を選択してください',
              weight: 'bold',
              size: 'lg',
              color: '#333333',
              align: 'center'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '動画のスタイルや雰囲気を設定する方法を選択してください：',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'postback',
                label: '🎲 ランダムプロンプト',
                data: 'action=RANDOM_PROMPT'
              }
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'postback',
                label: '✏️ 自分で入力する',
                data: 'action=INPUT_CUSTOM_PROMPT',
                inputOption: 'openKeyboard',
                fillInText: ''
              }
            }
          ]
        }
      }
    };
  }
}

module.exports = MessageTemplates; 