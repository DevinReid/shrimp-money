/**
 * Subscription Detection Algorithm
 * 
 * Analyzes transactions to identify recurring payments and subscriptions
 * Groups similar transactions by merchant and amount patterns
 */

// Use CommonJS for compatibility with Next.js API routes

/**
 * Detect subscriptions from transaction history
 * @param {Array} transactions - Array of transaction objects from Plaid
 * @returns {Array} Array of detected subscriptions
 */
function detectSubscriptions(transactions) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  console.log(`🔍 Analyzing ${transactions.length} transactions for subscriptions...`);

  // Filter out positive amounts (deposits) and keep only expenses
  const expenses = transactions.filter(t => t.amount > 0);
  
  // Group transactions by merchant/name and similar amounts
  const merchantGroups = {};
  
  expenses.forEach(transaction => {
    const merchant = transaction.merchant_name || transaction.name || 'Unknown';
    const amount = Math.abs(transaction.amount);
    
    // Create a key that groups similar amounts (within $0.50 tolerance)
    const amountKey = Math.round(amount * 2) / 2; // Round to nearest $0.50
    
    const groupKey = `${merchant.toLowerCase().trim()}_${amountKey}`;
    
    if (!merchantGroups[groupKey]) {
      merchantGroups[groupKey] = {
        merchant: merchant,
        amount: amount,
        transactions: [],
        category: transaction.userCategory || null,
      };
    }
    
    merchantGroups[groupKey].transactions.push({
      transaction_id: transaction.transaction_id,
      date: transaction.date,
      amount: amount,
      account_id: transaction.account_id,
    });
  });

  // Analyze each group for recurring patterns
  const subscriptions = [];
  
  Object.values(merchantGroups).forEach(group => {
    if (group.transactions.length < 2) {
      return; // Need at least 2 transactions to be a subscription
    }

    // Sort transactions by date
    group.transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate intervals between transactions
    const intervals = [];
    for (let i = 1; i < group.transactions.length; i++) {
      const daysDiff = (new Date(group.transactions[i].date) - new Date(group.transactions[i - 1].date)) / (1000 * 60 * 60 * 24);
      intervals.push(daysDiff);
    }

    // Calculate average interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    // Calculate standard deviation to check consistency
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgInterval, 2);
    }, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Determine frequency
    let frequency = 'irregular';
    let frequencyDays = Math.round(avgInterval);
    
    if (avgInterval >= 28 && avgInterval <= 31) {
      frequency = 'monthly';
      frequencyDays = 30;
    } else if (avgInterval >= 13 && avgInterval <= 15) {
      frequency = 'bi-weekly';
      frequencyDays = 14;
    } else if (avgInterval >= 6 && avgInterval <= 8) {
      frequency = 'weekly';
      frequencyDays = 7;
    } else if (avgInterval >= 85 && avgInterval <= 95) {
      frequency = 'quarterly';
      frequencyDays = 90;
    } else if (avgInterval >= 360 && avgInterval <= 370) {
      frequency = 'yearly';
      frequencyDays = 365;
    } else if (stdDev < avgInterval * 0.2) {
      // If consistent but not standard frequency, mark as regular
      frequency = `every ${frequencyDays} days`;
    }

    // Only consider it a subscription if:
    // 1. Has at least 3 occurrences OR
    // 2. Has 2 occurrences with consistent timing (low std dev)
    const isRecurring = group.transactions.length >= 3 || 
                       (group.transactions.length >= 2 && stdDev < avgInterval * 0.3);

    if (isRecurring) {
      const lastTransaction = group.transactions[group.transactions.length - 1];
      const lastDate = new Date(lastTransaction.date);
      
      // Predict next payment date
      const nextPaymentDate = new Date(lastDate);
      nextPaymentDate.setDate(nextPaymentDate.getDate() + frequencyDays);
      
      // Calculate confidence based on consistency and number of occurrences
      const consistencyScore = 1 - Math.min(stdDev / avgInterval, 1); // 0-1, higher is better
      const occurrenceScore = Math.min(group.transactions.length / 6, 1); // More occurrences = higher confidence
      const confidence = Math.round((consistencyScore * 0.6 + occurrenceScore * 0.4) * 100);

      subscriptions.push({
        id: `sub_${group.merchant.toLowerCase().replace(/\s+/g, '_')}_${Math.round(group.amount)}`,
        merchant: group.merchant,
        amount: group.amount,
        frequency: frequency,
        frequencyDays: frequencyDays,
        lastPaymentDate: lastTransaction.date,
        lastPaymentAmount: lastTransaction.amount,
        nextPaymentDate: nextPaymentDate.toISOString().split('T')[0],
        occurrences: group.transactions.length,
        confidence: confidence,
        category: group.category,
        transactions: group.transactions.map(t => ({
          id: t.transaction_id,
          date: t.date,
          amount: t.amount,
        })),
      });
    }
  });

  // Sort by confidence (highest first), then by amount
  subscriptions.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return b.amount - a.amount;
  });

  console.log(`✅ Detected ${subscriptions.length} potential subscriptions`);
  
  return subscriptions;
}

/**
 * Predict upcoming payments and required balance
 * @param {Array} subscriptions - Array of subscription objects
 * @param {Date} endDate - Date to predict up to (default: 30 days from now)
 * @returns {Object} Predictions with upcoming payments and required balance
 */
function predictUpcomingPayments(subscriptions, endDate = null) {
  const now = new Date();
  const predictionEndDate = endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days

  const upcomingPayments = [];
  const paymentDates = new Map(); // Track total per date

  subscriptions.forEach(sub => {
    const lastDate = new Date(sub.lastPaymentDate);
    let nextDate = new Date(sub.nextPaymentDate);

    // Generate all payments up to the end date
    while (nextDate <= predictionEndDate) {
      const dateKey = nextDate.toISOString().split('T')[0];
      
      if (!paymentDates.has(dateKey)) {
        paymentDates.set(dateKey, 0);
      }
      
      paymentDates.set(dateKey, paymentDates.get(dateKey) + sub.amount);
      
      upcomingPayments.push({
        subscriptionId: sub.id,
        merchant: sub.merchant,
        amount: sub.amount,
        date: dateKey,
        confidence: sub.confidence,
        frequency: sub.frequency,
      });

      // Calculate next payment date
      nextDate = new Date(nextDate);
      nextDate.setDate(nextDate.getDate() + sub.frequencyDays);
    }
  });

  // Sort by date
  upcomingPayments.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate cumulative required balance
  const dailyRequirements = [];
  let cumulativeTotal = 0;
  
  const sortedDates = Array.from(paymentDates.keys()).sort();
  sortedDates.forEach(date => {
    cumulativeTotal += paymentDates.get(date);
    dailyRequirements.push({
      date: date,
      amount: paymentDates.get(date),
      cumulativeRequired: cumulativeTotal,
    });
  });

  // Find the peak requirement (highest cumulative amount needed)
  const peakRequirement = dailyRequirements.length > 0
    ? Math.max(...dailyRequirements.map(d => d.cumulativeRequired))
    : 0;

  return {
    upcomingPayments,
    dailyRequirements,
    peakRequirement,
    totalUpcoming: cumulativeTotal,
    predictionPeriod: {
      start: now.toISOString().split('T')[0],
      end: predictionEndDate.toISOString().split('T')[0],
    },
  };
}

module.exports = {
  detectSubscriptions,
  predictUpcomingPayments,
};

