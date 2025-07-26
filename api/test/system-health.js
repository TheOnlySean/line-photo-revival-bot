const db = require('../../config/database');
const { stripe, stripeConfig } = require('../../config/stripe-config');

export default async function handler(req, res) {
  const testResults = {
    timestamp: new Date().toISOString(),
    system: 'angelsphoto-line',
    status: 'unknown',
    tests: {},
    summary: {}
  };

  let allTestsPassed = true;

  try {
    // 1. Database Connection Test
    console.log('🧪 測試數據庫連接...');
    try {
      const dbTest = await db.query('SELECT NOW() as current_time, COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = $1', ['public']);
      testResults.tests.database = {
        status: 'pass',
        message: 'Database connection successful',
        data: {
          currentTime: dbTest.rows[0].current_time,
          tableCount: parseInt(dbTest.rows[0].table_count)
        }
      };
      console.log('✅ 數據庫連接測試通過');
    } catch (dbError) {
      testResults.tests.database = {
        status: 'fail',
        message: 'Database connection failed',
        error: dbError.message
      };
      allTestsPassed = false;
      console.error('❌ 數據庫連接測試失敗:', dbError.message);
    }

    // 2. User Management Test
    console.log('🧪 測試用戶管理功能...');
    try {
      const testUserId = `test_health_${Date.now()}`;
      
      // 測試用戶創建
      const user = await db.ensureUserExists(testUserId, 'Health Test User');
      
      // 測試狀態設置
      await db.setUserState(user.id, 'testing', 'health check prompt');
      
      // 測試用戶獲取
      const retrievedUser = await db.getUser(testUserId);
      
      // 清理測試數據
      await db.query('DELETE FROM users WHERE line_user_id = $1', [testUserId]);
      
      testResults.tests.userManagement = {
        status: 'pass',
        message: 'User management functions working',
        data: {
          userCreated: !!user.id,
          stateUpdated: retrievedUser.current_state === 'testing',
          promptSaved: retrievedUser.current_prompt === 'health check prompt'
        }
      };
      console.log('✅ 用戶管理測試通過');
    } catch (userError) {
      testResults.tests.userManagement = {
        status: 'fail',
        message: 'User management test failed',
        error: userError.message
      };
      allTestsPassed = false;
      console.error('❌ 用戶管理測試失敗:', userError.message);
    }

    // 3. Subscription Management Test
    console.log('🧪 測試訂閱管理功能...');
    try {
      const testUserId = `test_sub_${Date.now()}`;
      const user = await db.ensureUserExists(testUserId, 'Subscription Test User');
      
      // 測試訂閱創建
      const subscription = await db.upsertSubscription(user.id, {
        stripeCustomerId: 'cus_test_health',
        stripeSubscriptionId: 'sub_test_health',
        planType: 'trial',
        status: 'active',
        monthlyVideoQuota: 8,
        videosUsedThisMonth: 0
      });
      
      // 測試配額檢查
      const quota = await db.checkVideoQuota(user.id);
      
      // 測試配額使用
      await db.useVideoQuota(user.id);
      const quotaAfterUse = await db.checkVideoQuota(user.id);
      
      // 清理測試數據
      await db.query('DELETE FROM subscriptions WHERE stripe_subscription_id = $1', ['sub_test_health']);
      await db.query('DELETE FROM users WHERE line_user_id = $1', [testUserId]);
      
      testResults.tests.subscriptionManagement = {
        status: 'pass',
        message: 'Subscription management functions working',
        data: {
          subscriptionCreated: !!subscription.id,
          initialQuota: quota.remaining,
          quotaAfterUse: quotaAfterUse.remaining,
          quotaReduced: quota.remaining > quotaAfterUse.remaining
        }
      };
      console.log('✅ 訂閱管理測試通過');
    } catch (subError) {
      testResults.tests.subscriptionManagement = {
        status: 'fail',
        message: 'Subscription management test failed',
        error: subError.message
      };
      allTestsPassed = false;
      console.error('❌ 訂閱管理測試失敗:', subError.message);
    }

    // 4. Stripe Integration Test
    console.log('🧪 測試Stripe集成...');
    try {
      const account = await stripe.accounts.retrieve();
      const testSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'jpy',
            product_data: { name: 'Health Test' },
            unit_amount: 100
          },
          quantity: 1
        }],
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        metadata: { test: 'health_check' }
      });

      testResults.tests.stripeIntegration = {
        status: 'pass',
        message: 'Stripe integration working',
        data: {
          accountId: account.id,
          country: account.country,
          sessionCreated: !!testSession.id,
          plansConfigured: Object.keys(stripeConfig.plans)
        }
      };
      console.log('✅ Stripe集成測試通過');
    } catch (stripeError) {
      testResults.tests.stripeIntegration = {
        status: 'fail',
        message: 'Stripe integration test failed',
        error: stripeError.message
      };
      allTestsPassed = false;
      console.error('❌ Stripe集成測試失敗:', stripeError.message);
    }

    // 5. Environment Variables Test
    console.log('🧪 測試環境變數...');
    const envTest = {
      hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY || !!stripeConfig.secretKey,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasVercelUrl: !!process.env.VERCEL_URL,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV
    };

    testResults.tests.environment = {
      status: envTest.hasStripeSecretKey && envTest.hasDatabaseUrl ? 'pass' : 'fail',
      message: 'Environment variables check',
      data: envTest
    };

    if (!envTest.hasStripeSecretKey || !envTest.hasDatabaseUrl) {
      allTestsPassed = false;
    }

    // Generate Summary
    const passedTests = Object.values(testResults.tests).filter(test => test.status === 'pass').length;
    const totalTests = Object.keys(testResults.tests).length;

    testResults.status = allTestsPassed ? 'healthy' : 'unhealthy';
    testResults.summary = {
      overallStatus: testResults.status,
      testsCompleted: totalTests,
      testsPassed: passedTests,
      testsFailed: totalTests - passedTests,
      successRate: `${Math.round((passedTests / totalTests) * 100)}%`
    };

    console.log(`🏁 系統健康檢查完成: ${testResults.status} (${passedTests}/${totalTests} 通過)`);

    res.status(allTestsPassed ? 200 : 500).json(testResults);

  } catch (error) {
    console.error('❌ 系統健康檢查失敗:', error);
    testResults.status = 'error';
    testResults.error = error.message;
    res.status(500).json(testResults);
  }
} 