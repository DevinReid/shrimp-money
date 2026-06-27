import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readAccountData, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');
const { loadMergedTransactions } = require('@/lib/transactionStore');

/**
 * Format a date as YYYY-MM-DD using LOCAL time (not UTC)
 * This prevents timezone shifts when the server is in a different timezone
 */
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate next payment date based on frequency
 */
function calculateNextPaymentDate(lastPaymentDate, frequency, frequencyDays, dayOfMonth, dayOfWeek) {
  const last = new Date(lastPaymentDate);
  // Normalize to midnight to avoid timezone issues
  last.setHours(0, 0, 0, 0);
  const next = new Date(last);
  
  switch (frequency) {
    case 'weekly':
      if (dayOfWeek !== null && dayOfWeek !== undefined) {
        // Find next occurrence of the specified day of week
        const currentDay = next.getDay();
        let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
        // If it's the same day, go to next week
        if (daysToAdd === 0) {
          daysToAdd = 7;
        }
        next.setDate(next.getDate() + daysToAdd);
      } else {
        // No specific day, just add 7 days
        next.setDate(next.getDate() + 7);
      }
      break;
    case 'bi-weekly':
      if (dayOfWeek !== null && dayOfWeek !== undefined) {
        // Find next occurrence of the specified day of week (2 weeks later)
        const currentDay = next.getDay();
        let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
        if (daysToAdd === 0) {
          daysToAdd = 14; // Same day, go 2 weeks forward
        } else {
          daysToAdd += 7; // Add a week to get to 2 weeks later
        }
        next.setDate(next.getDate() + daysToAdd);
      } else {
        next.setDate(next.getDate() + 14);
      }
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'custom':
      next.setDate(next.getDate() + (frequencyDays || 30));
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  
  // Normalize to midnight
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Apply 2-day buffer to account for Plaid posted dates vs actual withdrawal dates
 * If payment is scheduled for Jan 2, we need money by Dec 31 (2 days earlier)
 */
function applyBufferDate(paymentDate) {
  const buffered = new Date(paymentDate);
  buffered.setDate(buffered.getDate() - 2);
  return buffered;
}

/**
 * Analyze transaction patterns from spending analysis data
 * Returns patterns like: monthly bills, weekly expenses, etc.
 * Separates income and expense patterns
 */
function analyzeTransactionPatterns(transactions, startDate, endDate) {
  const patterns = {
    income: {
      monthly: {}, // category -> { amount, dayOfMonth, count }
      weekly: {},  // category -> { amount, dayOfWeek, count }
      daily: {},   // category -> { avgAmount, count }
    },
    expenses: {
      monthly: {}, // category -> { amount, dayOfMonth, count }
      weekly: {},  // category -> { amount, dayOfWeek, count }
      daily: {},   // category -> { avgAmount, count }
    },
  };

  // Group transactions by category and analyze frequency
  const incomeCategoryData = {};
  const expenseCategoryData = {};
  
  transactions.forEach(t => {
    if (!t.userCategory || t.userCategory === 'Uncategorized' || t.userCategory === 'Transfer') {
      return;
    }
    
    const category = t.userCategory;
    const txDate = new Date(t.date);
    const amount = Math.abs(t.amount);
    const isIncome = t.isIncome || category === 'Income';
    
    const categoryData = isIncome ? incomeCategoryData : expenseCategoryData;
    
    if (!categoryData[category]) {
      categoryData[category] = [];
    }
    
    categoryData[category].push({
      date: txDate,
      amount: amount,
      dayOfMonth: txDate.getDate(),
      dayOfWeek: txDate.getDay(),
    });
  });

  // Helper function to analyze patterns for a set of category data
  const analyzeCategoryPatterns = (categoryData, patternType) => {
    Object.entries(categoryData).forEach(([category, txs]) => {
      if (txs.length < 2) return; // Need at least 2 transactions to detect pattern
      
      // Check for monthly pattern (same day of month, roughly monthly intervals)
      const monthlyDays = txs.map(t => t.dayOfMonth);
      const monthlyCounts = {};
      monthlyDays.forEach(day => {
        monthlyCounts[day] = (monthlyCounts[day] || 0) + 1;
      });
      
      const mostCommonDay = Object.entries(monthlyCounts)
        .sort((a, b) => b[1] - a[1])[0];
      
      if (mostCommonDay && mostCommonDay[1] >= 2) {
        // Likely monthly pattern
        const avgAmount = txs.reduce((sum, t) => sum + t.amount, 0) / txs.length;
        patterns[patternType].monthly[category] = {
          amount: avgAmount,
          dayOfMonth: parseInt(mostCommonDay[0]),
          count: txs.length,
          maxAmount: Math.max(...txs.map(t => t.amount)),
        };
      }
      
      // Check for weekly pattern (same day of week)
      const weeklyDays = txs.map(t => t.dayOfWeek);
      const weeklyCounts = {};
      weeklyDays.forEach(day => {
        weeklyCounts[day] = (weeklyCounts[day] || 0) + 1;
      });
      
      const mostCommonWeekDay = Object.entries(weeklyCounts)
        .sort((a, b) => b[1] - a[1])[0];
      
      if (mostCommonWeekDay && mostCommonWeekDay[1] >= 2 && !patterns[patternType].monthly[category]) {
        // Likely weekly pattern (only if not already monthly)
        const avgAmount = txs.reduce((sum, t) => sum + t.amount, 0) / txs.length;
        patterns[patternType].weekly[category] = {
          amount: avgAmount,
          dayOfWeek: parseInt(mostCommonWeekDay[0]),
          count: txs.length,
          maxAmount: Math.max(...txs.map(t => t.amount)),
        };
      }
      
      // Daily average for categories without clear pattern
      if (!patterns[patternType].monthly[category] && !patterns[patternType].weekly[category]) {
        const avgAmount = txs.reduce((sum, t) => sum + t.amount, 0) / txs.length;
        const daysBetween = (txs[txs.length - 1].date - txs[0].date) / (1000 * 60 * 60 * 24);
        const frequency = daysBetween / txs.length;
        
        patterns[patternType].daily[category] = {
          avgAmount: avgAmount,
          count: txs.length,
          frequency: frequency, // days between transactions
          maxAmount: Math.max(...txs.map(t => t.amount)),
        };
      }
    });
  };

  // Analyze income patterns
  analyzeCategoryPatterns(incomeCategoryData, 'income');
  
  // Analyze expense patterns
  analyzeCategoryPatterns(expenseCategoryData, 'expenses');

  return patterns;
}

/**
 * GET /api/plaid/spending-forecast
 * Generate spending forecast with cash flow projections
 */
export async function GET(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const daysToForecast = parseInt(searchParams.get('days') || '30', 10);
    const customStartBalance = searchParams.get('startBalance');
    const useMax = searchParams.get('useMax') === 'true'; // Use max spending instead of average
    
    // Get current account balance from Plaid data
    let startingBalance = 0;
    let accounts = [];
    
    const itemsData = await readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    
    if (itemsData.items.length > 0) {
      const matchingItems = itemsData.items.filter(item => {
        if (!item.environment) return currentEnv === 'sandbox';
        return item.environment === currentEnv;
      });

      if (matchingItems.length > 0) {
        const item = matchingItems.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        )[0];

        // Try database first for account data
        if (prisma && prisma.plaidAccountData) {
          try {
            const dbData = await prisma.plaidAccountData.findUnique({
              where: { itemId: item.item_id },
            });
            if (dbData && dbData.accounts) {
              accounts = Array.isArray(dbData.accounts) 
                ? dbData.accounts 
                : (dbData.accounts.accounts || []);
            }
          } catch (dbError) {
            console.log('⚠️ Could not read accounts from database:', dbError.message);
          }
        }

        // Fallback to file storage
        if (accounts.length === 0) {
          const fileData = readAccountData(item.item_id);
          if (fileData && fileData.accounts) {
            accounts = fileData.accounts || [];
          }
        }
      }
    }

    // Calculate total available balance across all checking/savings accounts
    accounts.forEach(account => {
      if (['checking', 'savings'].includes(account.subtype)) {
        startingBalance += account.balances.available || account.balances.current || 0;
      }
    });

    // Allow custom starting balance override (for "what if" scenarios)
    if (customStartBalance) {
      startingBalance = parseFloat(customStartBalance);
    }

    // Get all active recurring payments
    let recurringPayments = [];
    
    if (prisma && prisma.plaidRecurringPayment) {
      recurringPayments = await prisma.plaidRecurringPayment.findMany({
        where: { isActive: true },
        orderBy: [
          { nextPaymentDate: 'asc' },
          { name: 'asc' }
        ],
      });
    }

    // Load actual transactions from spending analysis (PlaidTransaction table)
    // Load the full transaction set from the shared store (live blob + table,
    // deduped, categories filled) so the forecast computes on the SAME data as
    // every other view. See lib/transactionStore.js.
    let allTransactions = [];
    try {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      twelveMonthsAgo.setHours(0, 0, 0, 0);

      const { transactions } = await loadMergedTransactions(prisma);

      // Keep the last 12 months and classify income vs expense:
      // Income category => income; any other category => expense; uncategorized
      // falls back to amount sign (Plaid: positive = expense).
      allTransactions = transactions
        .filter(t => t.dateObj >= twelveMonthsAgo)
        .map(t => {
          const userCategory = t.userCategory || null;
          const isUserMarkedIncome = userCategory === 'Income';
          const hasUserCategory = userCategory && userCategory !== 'Uncategorized';
          const isExpense = isUserMarkedIncome ? false : (hasUserCategory ? true : t.amount > 0);
          const isIncome = isUserMarkedIncome || (!hasUserCategory && t.amount < 0);
          return {
            transaction_id: t.transaction_id,
            account_id: t.account_id,
            name: t.name,
            merchant_name: t.merchant_name,
            amount: t.amount,
            date: formatLocalDate(t.dateObj),
            userCategory,
            isExpense,
            isIncome,
          };
        });

      console.log(`✅ Forecast: ${allTransactions.length} transactions in last 12 months (shared store)`);
    } catch (txError) {
      console.log('⚠️ Could not load transactions for pattern analysis:', txError.message);
    }

    // Build daily projections for the forecast period
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysToForecast);
    
    // Analyze transaction patterns from spending analysis
    const transactionPatterns = analyzeTransactionPatterns(allTransactions, today, endDate);

    // Initialize daily projections map
    const dailyData = {};
    for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = formatLocalDate(d);
      dailyData[dateKey] = {
        date: dateKey,
        expenses: [],
        income: [],
        totalExpenses: 0,
        totalIncome: 0,
        netChange: 0,
        runningBalance: 0,
      };
    }

    // Generate all upcoming payments for each recurring payment
    // Apply 2-day buffer: if payment is Jan 2, we need money by Dec 31
    recurringPayments.forEach(rp => {
      let nextDate = null;
      
      // DEBUG: Log payment info for Income category
      if (rp.category === 'Income') {
        console.log('🔍 INCOME PAYMENT DEBUG:', {
          name: rp.name,
          frequency: rp.frequency,
          dayOfWeek: rp.dayOfWeek,
          dayOfWeekType: typeof rp.dayOfWeek,
          nextPaymentDate: rp.nextPaymentDate,
          lastPaymentDate: rp.lastPaymentDate,
          todayDay: today.getDay(),
          todayDate: formatLocalDate(today),
        });
      }
      
      // For WEEKLY or BI-WEEKLY payments with dayOfWeek, always find the next occurrence of that day
      if ((rp.frequency === 'weekly' || rp.frequency === 'bi-weekly') && rp.dayOfWeek !== null && rp.dayOfWeek !== undefined) {
        const targetDay = parseInt(rp.dayOfWeek); // Ensure it's a number
        
        // For bi-weekly, try to maintain pattern from lastPaymentDate if available
        if (rp.frequency === 'bi-weekly' && rp.lastPaymentDate) {
          const lastDate = new Date(rp.lastPaymentDate);
          lastDate.setHours(0, 0, 0, 0);
          
          // Calculate next bi-weekly date (14 days from last)
          nextDate = new Date(lastDate);
          nextDate.setDate(nextDate.getDate() + 14);
          
          // If that date is in the past, add another 14 days
          while (nextDate < today) {
            nextDate.setDate(nextDate.getDate() + 14);
          }
          
          // Verify it's on the correct day of week
          if (nextDate.getDay() !== targetDay) {
            // Adjust to the correct day (should be within 6 days)
            const daysUntilTarget = (targetDay - nextDate.getDay() + 7) % 7;
            nextDate.setDate(nextDate.getDate() + daysUntilTarget);
          }
          
          nextDate.setHours(0, 0, 0, 0);
        } else {
          // For weekly, or bi-weekly without lastPaymentDate, find next occurrence of that day
          // Find the next occurrence of the specified day from today (INCLUDING today if it matches)
          nextDate = new Date(today);
          const currentDay = nextDate.getDay();
          
          // Calculate days until target day
          // If today IS the target day, daysUntilTarget = 0 (include today!)
          let daysUntilTarget = (targetDay - currentDay + 7) % 7;
          
          // DON'T skip today - if today is payday, show it!
          // daysUntilTarget of 0 means today IS the target day
          
          nextDate.setDate(nextDate.getDate() + daysUntilTarget);
          nextDate.setHours(0, 0, 0, 0);
        }
        
        // DEBUG: Log calculated date for income
        if (rp.category === 'Income') {
          console.log(`🔍 ${rp.frequency.toUpperCase()} INCOME CALCULATED:`, {
            name: rp.name,
            frequency: rp.frequency,
            targetDay,
            todayDay: today.getDay(),
            calculatedDate: formatLocalDate(nextDate),
            calculatedDayOfWeek: nextDate.getDay(),
            lastPaymentDate: rp.lastPaymentDate,
          });
        }
        
        // Verify the date is actually on the correct day
        if (nextDate.getDay() !== targetDay) {
          // If somehow wrong, recalculate
          nextDate = new Date(today);
          const daysUntilTarget = (targetDay - nextDate.getDay() + 7) % 7;
          nextDate.setDate(nextDate.getDate() + daysUntilTarget);
          nextDate.setHours(0, 0, 0, 0);
        }
      } else {
        // For other frequencies, use nextPaymentDate if available
        nextDate = rp.nextPaymentDate ? new Date(rp.nextPaymentDate) : null;
        
        // Normalize nextDate to midnight to avoid timezone issues
        if (nextDate) {
          nextDate.setHours(0, 0, 0, 0);
        }
        
        // If no next payment date, calculate from last payment
        if (!nextDate && rp.lastPaymentDate) {
          nextDate = calculateNextPaymentDate(
            rp.lastPaymentDate,
            rp.frequency,
            rp.frequencyDays,
            rp.dayOfMonth,
            rp.dayOfWeek
          );
        }
        
        // If still no date, start from today
        if (!nextDate) {
          nextDate = new Date(today);
          nextDate.setHours(0, 0, 0, 0);
        }
      }
      
      // Generate payments within the forecast window
      while (nextDate <= endDate) {
        // For WEEKLY with dayOfWeek, verify the date matches the specified day
        if (rp.frequency === 'weekly' && rp.dayOfWeek !== null && rp.dayOfWeek !== undefined) {
          const actualDay = nextDate.getDay();
          const targetDay = parseInt(rp.dayOfWeek);
          if (actualDay !== targetDay) {
            // Date doesn't match the specified day, recalculate to correct day
            const daysUntilTarget = (targetDay - actualDay + 7) % 7;
            const daysToAdd = daysUntilTarget === 0 ? 7 : daysUntilTarget;
            nextDate.setDate(nextDate.getDate() + daysToAdd);
            nextDate.setHours(0, 0, 0, 0);
            continue;
          }
        }
        
        // Include today and future dates (>= comparison includes today)
        const nextDateNormalized = new Date(nextDate);
        nextDateNormalized.setHours(0, 0, 0, 0);
        
        if (nextDateNormalized >= today) {
          // For income: use actual date (no buffer - you get paid on the actual date it posts)
          // For expenses: apply 2-day buffer (you need money before the payment posts)
          const isIncome = rp.category === 'Income';
          // Income uses the exact payment date, expenses use 2 days earlier
          const effectiveDate = isIncome ? nextDate : applyBufferDate(nextDate);
          const dateKey = formatLocalDate(effectiveDate);
          
          // Only add if date is still within forecast window
          // For income, ensure we're using the actual payment date (not buffered)
          // Explicitly include today by using >= comparison
          const effectiveDateNormalized = new Date(effectiveDate);
          effectiveDateNormalized.setHours(0, 0, 0, 0);
          const isTodayOrFuture = isIncome 
            ? nextDateNormalized >= today 
            : effectiveDateNormalized >= today;
          
          if (dailyData[dateKey] && isTodayOrFuture) {
            // Use max amount for conservative forecasting (as per plan)
            // For variable bills, we use amountMax; for fixed subscriptions, use amount
            const forecastAmount = rp.isVariableAmount && rp.amountMax 
              ? rp.amountMax 
              : rp.amount;
            
            const paymentEntry = {
              id: rp.id,
              name: rp.name,
              category: rp.category,
              amount: forecastAmount,
              // Include range info for tooltip display
              isVariable: rp.isVariableAmount || false,
              amountMin: rp.amountMin,
              amountMax: rp.amountMax,
              frequency: rp.frequency,
              originalDate: formatLocalDate(nextDate), // Store original date for reference
              effectiveDate: dateKey, // Date when money is actually received/needed
            };
            
            if (isIncome) {
              dailyData[dateKey].income.push(paymentEntry);
              dailyData[dateKey].totalIncome += forecastAmount;
            } else {
              dailyData[dateKey].expenses.push(paymentEntry);
              dailyData[dateKey].totalExpenses += forecastAmount;
            }
          }
        }
        
        // Calculate next occurrence
        // For weekly/bi-weekly with dayOfWeek, add 7 or 14 days to maintain the same day
        if ((rp.frequency === 'weekly' || rp.frequency === 'bi-weekly') && rp.dayOfWeek !== null && rp.dayOfWeek !== undefined) {
          const daysToAdd = rp.frequency === 'bi-weekly' ? 14 : 7;
          nextDate.setDate(nextDate.getDate() + daysToAdd);
          nextDate.setHours(0, 0, 0, 0);
          // Verify it's still on the correct day
          const targetDay = parseInt(rp.dayOfWeek);
          if (nextDate.getDay() !== targetDay) {
            // Adjust to correct day if needed
            const daysUntilTarget = (targetDay - nextDate.getDay() + 7) % 7;
            nextDate.setDate(nextDate.getDate() + daysUntilTarget);
            nextDate.setHours(0, 0, 0, 0);
          }
        } else {
          // For other frequencies, use the calculation function
          nextDate = calculateNextPaymentDate(
            nextDate,
            rp.frequency,
            rp.frequencyDays,
            rp.dayOfMonth,
            rp.dayOfWeek
          );
        }
      }
    });

    // Calculate category spending stats from transactions
    // Categories to include in forecast (regular spending categories)
    const forecastCategories = [
      'Groceries',
      'Dining out',
      'Partying',
      'Amazon',
      'Cars',
      'Pets',
      'Beauty',
      'Shopping',
      'Travel',
      'Entertainment',
      'Thrift',
      'Devin Lunch',
      'Lunch',
      'Uncategorized',
      'Gifts',
    ];
    
    // Helper to normalize category names
    const normalizeCategory = (category) => {
      // Genuinely-uncategorized expenses (no category) are bucketed as
      // "Uncategorized" so their spending is surfaced in the forecast instead
      // of silently dropped. Known-but-unforecast categories (Bill, Subscription,
      // Credit Card, etc.) still fall through to `return null` below and are
      // excluded here, since they're handled by the recurring-payments engine.
      if (!category) return 'Uncategorized';
      const categoryLower = category.toLowerCase().trim();
      if (categoryLower === 'groceries' || categoryLower === 'grocery') return 'Groceries';
      if (categoryLower === 'dining out' || categoryLower === 'dining' || categoryLower === 'restaurants') return 'Dining out';
      if (categoryLower === 'partying' || categoryLower === 'party') return 'Partying';
      if (categoryLower === 'amazon') return 'Amazon';
      if (categoryLower === 'cars' || categoryLower === 'car' || categoryLower === 'automotive') return 'Cars';
      if (categoryLower === 'pets' || categoryLower === 'pet') return 'Pets';
      if (categoryLower === 'beauty' || categoryLower === 'cosmetics') return 'Beauty';
      if (categoryLower === 'shopping') return 'Shopping';
      if (categoryLower === 'travel') return 'Travel';
      if (categoryLower === 'entertainment') return 'Entertainment';
      if (categoryLower === 'thrift' || categoryLower === 'thrifting') return 'Thrift';
      if (categoryLower === 'devin' || categoryLower === 'devin lunch') return 'Devin Lunch';
      if (categoryLower === 'lunch') return 'Lunch';
      if (categoryLower === 'uncategorized') return 'Uncategorized';
      if (categoryLower === 'gifts' || categoryLower === 'gift') return 'Gifts';
      return null;
    };
    
    // Calculate monthly spending stats for forecast categories
    // Use last 12 months (rolling 12 months from today) instead of just current year
    const categoryMonthlyData = {};
    // Reuse the 'today' variable already declared earlier in the function
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    
    // Filter transactions from last 12 months and group by category and month
    allTransactions
      .filter(t => {
        if (!t.isExpense) return false;
        // Exclude transfers from category spending stats (they're just moving money between accounts)
        if (t.userCategory === 'Transfer') return false;
        const txDate = new Date(t.date);
        txDate.setHours(0, 0, 0, 0);
        return txDate >= twelveMonthsAgo && txDate <= today;
      })
      .forEach(t => {
        const normalizedCategory = normalizeCategory(t.userCategory);
        if (!normalizedCategory || !forecastCategories.includes(normalizedCategory)) return;
        
        const txDate = new Date(t.date);
        const amount = Math.abs(t.amount);
        
        if (!categoryMonthlyData[normalizedCategory]) {
          categoryMonthlyData[normalizedCategory] = [];
        }
        
        // Store each transaction's amount and month for proper calculation
        categoryMonthlyData[normalizedCategory].push({
          amount: amount,
          month: txDate.getMonth(),
          year: txDate.getFullYear(),
        });
      });
    
    // Calculate min, avg, max for each category
    // avgMonth should be total spending / 12 (not just average of non-zero months)
    const categorySpendingStats = {};
    Object.entries(categoryMonthlyData).forEach(([category, transactions]) => {
      if (transactions.length === 0) return;
      
      // Calculate total spending over the last 12 months
      const totalSpending = transactions.reduce((sum, t) => sum + t.amount, 0);
      
      // Group by month to calculate min/max and count active months
      const monthlyTotals = {};
      transactions.forEach(t => {
        const monthKey = `${t.year}-${t.month}`;
        if (!monthlyTotals[monthKey]) {
          monthlyTotals[monthKey] = 0;
        }
        monthlyTotals[monthKey] += t.amount;
      });
      
      const monthlyAmounts = Object.values(monthlyTotals);
      const nonZeroMonths = monthlyAmounts.filter(a => a > 0);
      
      if (nonZeroMonths.length === 0) return;
      
      // Calculate average per month: total / 12 months
      // This gives the true monthly average regardless of which months had spending
      // This matches what the user expects: if they spent $4,000 last year, that's $4,000/12 = $333.33/month
      const avgMonth = totalSpending / 12;
      
      const minMonth = Math.min(...nonZeroMonths);
      const maxMonth = Math.max(...monthlyAmounts);
      
      // Debug logging for Pets category to help diagnose discrepancies
      if (category === 'Pets') {
        console.log(`🐾 Pets category stats:`, {
          totalSpending: Math.round(totalSpending * 100) / 100,
          avgMonth: Math.round(avgMonth * 100) / 100,
          transactionCount: transactions.length,
          monthsActive: nonZeroMonths.length,
          monthlyTotals: Object.entries(monthlyTotals).map(([key, val]) => ({ month: key, total: Math.round(val * 100) / 100 })),
        });
      }
      
      categorySpendingStats[category] = {
        minMonth: Math.round(minMonth * 100) / 100,
        avgMonth: Math.round(avgMonth * 100) / 100,
        maxMonth: Math.round(maxMonth * 100) / 100,
        monthsActive: nonZeroMonths.length,
        totalSpending: Math.round(totalSpending * 100) / 100,
      };
    });

    // Add category-based spending to forecast with custom schedules
    // Distribute monthly averages based on category-specific schedules
    const weeksPerMonth = 4.33;
    const daysPerMonth = 30.44; // Average days per month
    
    // Define category schedules
    const categorySchedules = {
      'Partying': { type: 'dayOfWeek', days: [5, 6, 0] }, // Friday, Saturday, Sunday
      'Dining out': { type: 'daily' }, // Every day
      'Thrift': { type: 'dayOfWeek', days: [5, 6, 0] }, // Friday, Saturday, Sunday (weekends)
      'Shopping': { type: 'dayOfWeek', days: [5, 6, 0] }, // Friday, Saturday, Sunday
      'Groceries': { type: 'daily' }, // Every day
      'Amazon': { type: 'daily' }, // Every day
      'Beauty': { type: 'daily' }, // Every day
      'Cars': { type: 'daily' }, // Every day
      'Pets': { type: 'daily' }, // Every day (spread throughout month)
      'Entertainment': { type: 'daily' }, // Every day (spread throughout month)
      'Travel': { type: 'daily' }, // Every day (spread throughout month)
      'Devin Lunch': { type: 'daily' }, // Every day
      'Gifts': { type: 'daily' }, // Every day
      'Uncategorized': { type: 'daily' }, // Unsorted spending — spread daily so it's not invisible to the forecast
    };
    
    // Categories handled by category spending (exclude from transaction patterns)
    const categorySpendingCategories = Object.keys(categorySchedules);
    
    Object.entries(categorySpendingStats).forEach(([category, stats]) => {
      if (stats.avgMonth <= 0 || stats.monthsActive < 1) return; // Skip if no data
      
      const schedule = categorySchedules[category];
      if (!schedule) return; // Skip categories without a schedule (like Pets, which we removed)
      
      let forecastAmount;
      let frequency;
      
      if (schedule.type === 'daily') {
        // Calculate daily amount (monthly average or max / days per month)
        const monthlyAmount = useMax ? stats.maxMonth : stats.avgMonth;
        forecastAmount = monthlyAmount / daysPerMonth;
        frequency = 'daily';
        
        // Add to every day in forecast period
        let currentDate = new Date(today);
        while (currentDate <= endDate) {
          const dateKey = formatLocalDate(currentDate);
          
          if (dailyData[dateKey]) {
            const categoryEntry = {
              id: `category-${category}-${dateKey}`,
              name: `${category} (daily estimate)`,
              category: category,
              amount: Math.round(forecastAmount * 100) / 100,
              isVariable: false,
              frequency: 'daily',
              source: 'category-spending',
            };
            
            dailyData[dateKey].expenses.push(categoryEntry);
            dailyData[dateKey].totalExpenses += forecastAmount;
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (schedule.type === 'dayOfWeek') {
        // Calculate amount per occurrence
        // For weekly categories: monthly average or max / (weeks per month * occurrences per week)
        const occurrencesPerWeek = schedule.days.length;
        const monthlyAmount = useMax ? stats.maxMonth : stats.avgMonth;
        const weeklyAmount = monthlyAmount / (weeksPerMonth * occurrencesPerWeek);
        forecastAmount = weeklyAmount;
        frequency = 'weekly';
        
        // Add to specific days of week
        let currentDate = new Date(today);
        while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
          
          if (schedule.days.includes(dayOfWeek)) {
            const dateKey = formatLocalDate(currentDate);
            
            if (dailyData[dateKey]) {
              const categoryEntry = {
                id: `category-${category}-${dateKey}`,
                name: `${category} (weekly estimate)`,
                category: category,
                amount: Math.round(forecastAmount * 100) / 100,
                isVariable: false,
                frequency: 'weekly',
                source: 'category-spending',
              };
              
              dailyData[dateKey].expenses.push(categoryEntry);
              dailyData[dateKey].totalExpenses += forecastAmount;
            }
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    });

    // Add transaction-based patterns from spending analysis
    // These supplement recurring payments with actual historical patterns
    
    // Helper function to add income patterns
    // Income uses actual date (no buffer)
    // Use average amount, not max, to avoid outliers
    const addIncomePattern = (dateKey, testDate, category, pattern, frequency) => {
      // For income, use the actual date, not buffered
      const actualDateKey = formatLocalDate(testDate);
      if (dailyData[actualDateKey] && new Date(actualDateKey) >= today) {
        // Use average amount, not max, to avoid outliers
        const forecastAmount = pattern.amount;
        
        const paymentEntry = {
          id: `pattern-${category}-${actualDateKey}`,
          name: `${category} (from pattern)`,
          category: category,
          amount: forecastAmount,
          isVariable: false, // Always use average
          frequency: frequency,
          originalDate: actualDateKey,
          effectiveDate: actualDateKey,
          source: 'transaction-pattern',
        };
        
        dailyData[actualDateKey].income.push(paymentEntry);
        dailyData[actualDateKey].totalIncome += forecastAmount;
      }
    };
    
    // Helper function to add expense patterns
    // Use average amount, not max, to avoid outliers
    const addExpensePattern = (dateKey, testDate, category, pattern, frequency) => {
      if (dailyData[dateKey] && new Date(dateKey) >= today) {
        // Use average amount, not max, to avoid outliers
        const forecastAmount = pattern.amount;
        
        const paymentEntry = {
          id: `pattern-${category}-${formatLocalDate(testDate)}`,
          name: `${category} (from pattern)`,
          category: category,
          amount: forecastAmount,
          isVariable: false, // Always use average
          frequency: frequency,
          originalDate: formatLocalDate(testDate),
          effectiveDate: dateKey,
          source: 'transaction-pattern',
        };
        
        dailyData[dateKey].expenses.push(paymentEntry);
        dailyData[dateKey].totalExpenses += forecastAmount;
      }
    };
    
    // Monthly income patterns (e.g., salary)
    // Income uses actual date (no buffer)
    // Exclude categories already handled by category spending
    Object.entries(transactionPatterns.income.monthly).forEach(([category, pattern]) => {
      const hasRecurringPayment = recurringPayments.some(rp => rp.category === category);
      const isCategorySpending = categorySpendingCategories.includes(category);
      
      if (!hasRecurringPayment && !isCategorySpending && pattern.count >= 2) {
        let currentDate = new Date(today);
        
        while (currentDate <= endDate) {
          const dayOfMonth = pattern.dayOfMonth;
          const testDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayOfMonth);
          
          if (testDate >= today && testDate <= endDate) {
            // Income: use actual date, no buffer
            const dateKey = formatLocalDate(testDate);
            addIncomePattern(dateKey, testDate, category, pattern, 'monthly');
          }
          
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }
    });
    
    // Weekly income patterns
    // Income uses actual date (no buffer)
    // Exclude categories already handled by category spending
    Object.entries(transactionPatterns.income.weekly).forEach(([category, pattern]) => {
      const hasRecurringPayment = recurringPayments.some(rp => rp.category === category);
      const isCategorySpending = categorySpendingCategories.includes(category);
      
      if (!hasRecurringPayment && !isCategorySpending && pattern.count >= 2) {
        let testDate = new Date(today);
        const daysUntilTarget = (pattern.dayOfWeek - testDate.getDay() + 7) % 7;
        testDate.setDate(testDate.getDate() + (daysUntilTarget === 0 ? 7 : daysUntilTarget));
        
        while (testDate <= endDate) {
          if (testDate >= today) {
            // Income: use actual date, no buffer
            const dateKey = formatLocalDate(testDate);
            addIncomePattern(dateKey, testDate, category, pattern, 'weekly');
          }
          
          testDate.setDate(testDate.getDate() + 7);
        }
      }
    });
    
    // Monthly expense patterns (e.g., bills that come on the same day each month)
    // Exclude categories already handled by category spending and Credit Card
    Object.entries(transactionPatterns.expenses.monthly).forEach(([category, pattern]) => {
      const hasRecurringPayment = recurringPayments.some(rp => rp.category === category);
      const isCategorySpending = categorySpendingCategories.includes(category);
      const isCreditCard = category.toLowerCase().includes('credit card');
      
      if (!hasRecurringPayment && !isCategorySpending && !isCreditCard && pattern.count >= 2) {
        let currentDate = new Date(today);
        
        while (currentDate <= endDate) {
          const dayOfMonth = pattern.dayOfMonth;
          const testDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayOfMonth);
          
          if (testDate >= today && testDate <= endDate) {
            const bufferedDate = applyBufferDate(testDate);
            const dateKey = formatLocalDate(bufferedDate);
            addExpensePattern(dateKey, testDate, category, pattern, 'monthly');
          }
          
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }
    });
    
    // Weekly expense patterns (e.g., weekly subscriptions)
    // Exclude categories already handled by category spending and Credit Card
    Object.entries(transactionPatterns.expenses.weekly).forEach(([category, pattern]) => {
      const hasRecurringPayment = recurringPayments.some(rp => rp.category === category);
      const isCategorySpending = categorySpendingCategories.includes(category);
      const isCreditCard = category.toLowerCase().includes('credit card');
      
      if (!hasRecurringPayment && !isCategorySpending && !isCreditCard && pattern.count >= 2) {
        let testDate = new Date(today);
        const daysUntilTarget = (pattern.dayOfWeek - testDate.getDay() + 7) % 7;
        testDate.setDate(testDate.getDate() + (daysUntilTarget === 0 ? 7 : daysUntilTarget));
        
        while (testDate <= endDate) {
          if (testDate >= today) {
            const bufferedDate = applyBufferDate(testDate);
            const dateKey = formatLocalDate(bufferedDate);
            addExpensePattern(dateKey, testDate, category, pattern, 'weekly');
          }
          
          testDate.setDate(testDate.getDate() + 7);
        }
      }
    });

    // Calculate running balance and net change for each day
    let runningBalance = startingBalance;
    const dailyProjections = [];
    const criticalDates = [];
    let lowestBalance = startingBalance;
    let lowestBalanceDate = formatLocalDate(today);
    
    Object.keys(dailyData).sort().forEach(dateKey => {
      const day = dailyData[dateKey];
      day.netChange = day.totalIncome - day.totalExpenses;
      runningBalance += day.netChange;
      day.runningBalance = Math.round(runningBalance * 100) / 100;
      
      // Track lowest balance point
      if (runningBalance < lowestBalance) {
        lowestBalance = runningBalance;
        lowestBalanceDate = dateKey;
      }
      
      // Mark critical dates (high expense days or negative balance)
      const isCritical = day.totalExpenses > 500 || // High expense day
                        day.expenses.length >= 3 || // Multiple expenses stacking
                        day.runningBalance < 0; // Negative balance warning
      
      if (isCritical) {
        criticalDates.push({
          date: dateKey,
          reason: day.runningBalance < 0 
            ? 'negative_balance' 
            : day.expenses.length >= 3 
              ? 'stacked_expenses' 
              : 'high_expenses',
          totalExpenses: day.totalExpenses,
          expenseCount: day.expenses.length,
          projectedBalance: day.runningBalance,
        });
      }
      
      dailyProjections.push(day);
    });

    // Calculate summary statistics
    const totalProjectedExpenses = dailyProjections.reduce((sum, d) => sum + d.totalExpenses, 0);
    const totalProjectedIncome = dailyProjections.reduce((sum, d) => sum + d.totalIncome, 0);
    const calculatedNetChange = totalProjectedIncome - totalProjectedExpenses;
    const calculatedEndingBalance = startingBalance + calculatedNetChange;
    
    // Calculate minimum balance needed to stay positive
    const minimumRequired = lowestBalance < 0 
      ? Math.abs(lowestBalance) + startingBalance 
      : 0;
    
    // DEBUG: Compare calculations
    const lastDay = dailyProjections[dailyProjections.length - 1];
    console.log('🔍 NET CHANGE CALCULATION COMPARISON:', {
      startingBalance,
      endingBalance: runningBalance,
      calculatedEndingBalance,
      difference: runningBalance - calculatedEndingBalance,
      netChangeFromSum: calculatedNetChange,
      netChangeFromBalance: runningBalance - startingBalance,
      lastDayDate: lastDay?.date,
      lastDayRunningBalance: lastDay?.runningBalance,
      totalProjectedIncome,
      totalProjectedExpenses,
    });

    // DEBUG: Verify today is included in calculations
    const todayKey = formatLocalDate(today);
    const todayData = dailyProjections.find(d => d.date === todayKey);
    if (todayData) {
      console.log('📊 TODAY INCLUDED IN FORECAST:', {
        date: todayKey,
        income: todayData.totalIncome,
        expenses: todayData.totalExpenses,
        netChange: todayData.netChange,
        runningBalance: todayData.runningBalance,
      });
    } else {
      console.log('⚠️ WARNING: Today not found in dailyProjections!', {
        todayKey,
        firstProjection: dailyProjections[0]?.date,
        lastProjection: dailyProjections[dailyProjections.length - 1]?.date,
      });
    }
    
    // DEBUG: Check specific dates that user is seeing issues with
    const jan14 = dailyProjections.find(d => d.date === '2026-01-14');
    const jan15 = dailyProjections.find(d => d.date === '2026-01-15');
    
    if (jan14) {
      const jan14Cumulative = jan14.runningBalance - startingBalance;
      console.log('🔍 JAN 14 BACKEND DATA:', {
        date: jan14.date,
        runningBalance: jan14.runningBalance,
        startingBalance: startingBalance,
        cumulativeChange: jan14Cumulative,
        totalIncome: jan14.totalIncome,
        totalExpenses: jan14.totalExpenses,
        netChange: jan14.netChange,
        incomeCount: jan14.income.length,
        expenseCount: jan14.expenses.length,
      });
    } else {
      console.log('⚠️ JAN 14 NOT FOUND in dailyProjections');
    }
    
    if (jan15) {
      const jan15Cumulative = jan15.runningBalance - startingBalance;
      console.log('🔍 JAN 15 BACKEND DATA:', {
        date: jan15.date,
        runningBalance: jan15.runningBalance,
        startingBalance: startingBalance,
        cumulativeChange: jan15Cumulative,
        totalIncome: jan15.totalIncome,
        totalExpenses: jan15.totalExpenses,
        netChange: jan15.netChange,
        incomeCount: jan15.income.length,
        expenseCount: jan15.expenses.length,
      });
    } else {
      console.log('⚠️ JAN 15 NOT FOUND in dailyProjections');
    }

    // Record this forecast run so we can compare predictions vs actuals over
    // time. One row per (day, horizon, mode); upsert keeps it to one per day.
    // Wrapped so a snapshot failure never affects the forecast response.
    if (prisma && prisma.plaidForecastSnapshot) {
      try {
        const snapshotDate = new Date(today);
        snapshotDate.setHours(0, 0, 0, 0);
        const values = {
          startingBalance: Math.round(startingBalance * 100) / 100,
          endingBalance: Math.round(runningBalance * 100) / 100,
          lowestBalance: Math.round(lowestBalance * 100) / 100,
          projectedIncome: Math.round(totalProjectedIncome * 100) / 100,
          projectedExpenses: Math.round(totalProjectedExpenses * 100) / 100,
          netChange: Math.round((runningBalance - startingBalance) * 100) / 100,
          transactionsAnalyzed: allTransactions.length,
        };
        await prisma.plaidForecastSnapshot.upsert({
          where: {
            snapshotDate_horizonDays_useMax: {
              snapshotDate,
              horizonDays: daysToForecast,
              useMax,
            },
          },
          update: values,
          create: { snapshotDate, horizonDays: daysToForecast, useMax, ...values },
        });
        console.log('📸 Forecast snapshot saved');
      } catch (snapErr) {
        console.warn('⚠️ Could not save forecast snapshot:', snapErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      forecast: {
        startingBalance: Math.round(startingBalance * 100) / 100,
        endingBalance: Math.round(runningBalance * 100) / 100,
        lowestBalance: Math.round(lowestBalance * 100) / 100,
        lowestBalanceDate,
        minimumRequired: Math.round(minimumRequired * 100) / 100,
        totalProjectedExpenses: Math.round(totalProjectedExpenses * 100) / 100,
        totalProjectedIncome: Math.round(totalProjectedIncome * 100) / 100,
        // Use endingBalance - startingBalance for netChange to ensure consistency with cumulative calculations
        // This matches what users see in the cumulative change display
        netChange: Math.round((runningBalance - startingBalance) * 100) / 100,
        daysForecasted: daysToForecast,
      },
      dailyProjections,
      criticalDates,
      accounts: accounts.map(a => ({
        id: a.account_id,
        name: a.name,
        type: a.subtype,
        available: a.balances.available,
        current: a.balances.current,
      })),
      recurringPaymentsCount: recurringPayments.length,
      // Include server's "today" date to ensure client uses the same reference
      // This prevents timezone mismatches between server and client
      serverToday: formatLocalDate(today),
      metadata: {
        bufferDays: 2,
        note: 'Expense dates include a 2-day buffer (if a payment posts on Jan 2, you need the money by Dec 31). Income uses actual dates (no buffer).',
        dataSources: {
          recurringPayments: recurringPayments.length,
          incomePatterns: Object.keys(transactionPatterns.income.monthly).length + Object.keys(transactionPatterns.income.weekly).length,
          expensePatterns: Object.keys(transactionPatterns.expenses.monthly).length + Object.keys(transactionPatterns.expenses.weekly).length,
          categorySpending: Object.keys(categorySpendingStats).length,
          transactionsAnalyzed: allTransactions.length,
        },
        categorySpendingStats: Object.entries(categorySpendingStats).map(([category, stats]) => ({
          category,
          ...stats,
        })),
      },
    });
  } catch (error) {
    console.error('Error generating spending forecast:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

