/**
 * 清零客户信用余额
 * 恢复正常付费周期
 */

const { stripe } = require('../../config/stripe-config');

export default async function handler(req, res) {
  // 管理员验证
  const { adminKey } = req.query;
  if (adminKey !== 'clear-credit-balance-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customerId } = req.body;
    
    if (!customerId) {
      return res.status(400).json({ error: 'Missing customerId' });
    }

    console.log(`💰 清零客户 ${customerId} 的信用余额...`);

    // 1. 获取客户当前信息
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.balance >= 0) {
      return res.json({
        success: true,
        message: '客户没有信用余额，无需清零',
        currentBalance: customer.balance
      });
    }

    const creditAmount = Math.abs(customer.balance);
    console.log(`当前信用余额: ¥${creditAmount}`);

    // 2. 创建一个余额调整来清零信用余额
    const balanceTransaction = await stripe.customers.createBalanceTransaction(customerId, {
      amount: creditAmount, // 正数，抵消负余额
      currency: 'jpy',
      description: `清零信用余额 - 管理员操作 (${new Date().toISOString()})`
    });

    // 3. 验证余额是否已清零
    const updatedCustomer = await stripe.customers.retrieve(customerId);

    console.log('✅ 信用余额清零完成');
    
    res.json({
      success: true,
      message: '信用余额已清零',
      previousBalance: customer.balance,
      currentBalance: updatedCustomer.balance,
      clearedAmount: creditAmount,
      transaction: {
        id: balanceTransaction.id,
        amount: balanceTransaction.amount,
        description: balanceTransaction.description
      }
    });

  } catch (error) {
    console.error('❌ 清零信用余额失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 