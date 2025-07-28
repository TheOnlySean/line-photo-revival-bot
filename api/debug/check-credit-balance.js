/**
 * 检查Stripe客户信用余额
 * 分析为什么显示下次支付¥0
 */

const { stripe } = require('../../config/stripe-config');

export default async function handler(req, res) {
  // 管理员验证
  const { adminKey } = req.query;
  if (adminKey !== 'check-credit-balance-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('💰 检查Stripe信用余额...');
    const results = {};

    // 1. 获取最近的客户（按创建时间排序）
    const customers = await stripe.customers.list({
      limit: 10,
      created: {
        gte: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000) // 最近30天
      }
    });

    results.recentCustomers = [];

    for (const customer of customers.data) {
      const customerInfo = {
        id: customer.id,
        email: customer.email,
        created: new Date(customer.created * 1000).toISOString(),
        balance: customer.balance, // 信用余额（以cents为单位）
        currency: customer.currency || 'jpy'
      };

      // 检查这个客户的订阅
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 5
      });

      customerInfo.subscriptions = subscriptions.data.map(sub => ({
        id: sub.id,
        status: sub.status,
        plan_name: sub.items.data[0]?.price?.nickname || 'Unknown',
        amount: sub.items.data[0]?.price?.unit_amount,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString()
      }));

      // 如果有负余额（信用余额），查看余额变化历史
      if (customer.balance < 0) {
        customerInfo.hasCredit = true;
        customerInfo.creditAmount = Math.abs(customer.balance);

        // 获取客户的余额变化历史
        const balanceTransactions = await stripe.customers.listBalanceTransactions(customer.id, {
          limit: 10
        });

        customerInfo.balanceHistory = balanceTransactions.data.map(tx => ({
          id: tx.id,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type,
          description: tx.description,
          created: new Date(tx.created * 1000).toISOString()
        }));
      }

      results.recentCustomers.push(customerInfo);
    }

    // 2. 检查最近的退款
    console.log('🔄 检查最近的退款...');
    const refunds = await stripe.refunds.list({
      limit: 10,
      created: {
        gte: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
      }
    });

    results.recentRefunds = refunds.data.map(refund => ({
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      created: new Date(refund.created * 1000).toISOString(),
      charge: refund.charge
    }));

    // 3. 检查最近的发票
    console.log('📄 检查最近的发票...');
    const invoices = await stripe.invoices.list({
      limit: 10,
      created: {
        gte: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
      }
    });

    results.recentInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      customer: invoice.customer,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      starting_balance: invoice.starting_balance,
      ending_balance: invoice.ending_balance,
      created: new Date(invoice.created * 1000).toISOString()
    }));

    console.log('✅ 信用余额检查完成');
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: '信用余额检查完成',
      results
    });

  } catch (error) {
    console.error('❌ 检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 