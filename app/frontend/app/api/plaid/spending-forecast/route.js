import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readAccountData, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

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
    let allTransactions = [];
    if (prisma && prisma.plaidTransaction) {
      try {
        // Get transactions from the last 6 months to analyze patterns
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const normalizedTransactions = await prisma.plaidTransaction.findMany({
          where: {
            date: {
              gte: sixMonthsAgo,
            },
          },
          orderBy: { date: 'desc' },
        });
        
        allTransactions = normalizedTransactions.map(t => {
          // Identify income vs expenses (same logic as spending analysis)
          const userCategory = t.userCategory || null;
          const isUserMarkedIncome = userCategory === 'Income';
          const hasUserCategory = userCategory && userCategory !== 'Uncategorized';
          
          // If user categorized it, respect their categorization
          // Income category = always income, any other category = always expense
          // If no category, use amount sign (positive = expense, negative = income in Plaid)
          const isExpense = isUserMarkedIncome 
            ? false 
            : (hasUserCategory ? true : t.amount > 0);
          const isIncome = isUserMarkedIncome || (!hasUserCategory && t.amount < 0);
          
          return {
            transaction_id: t.transactionId,
            account_id: t.accountId,
            name: t.name,
            merchant_name: t.merchantName,
            amount: t.amount,
            date: t.date.toISOString().split('T')[0],
            userCategory: t.userCategory,
            isExpense,
            isIncome,
          };
        });
        
        console.log(`✅ Loaded ${allTransactions.length} transactions for pattern analysis`);
      } catch (txError) {
        console.log('⚠️ Could not load transactions for pattern analysis:', txError.message);
      }
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
      const dateKey = d.toISOString().split('T')[0];
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
      let nextDate = rp.nextPaymentDate ? new Date(rp.nextPaymentDate) : null;
      
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
      
      // Generate payments within the forecast window
      while (nextDate <= endDate) {
        if (nextDate >= today) {
          // For income: use actual date (no buffer - you get paid on the actual date it posts)
          // For expenses: apply 2-day buffer (you need money before the payment posts)
          const isIncome = rp.category === 'Income';
          // Income uses the exact payment date, expenses use 2 days earlier
          const effectiveDate = isIncome ? nextDate : applyBufferDate(nextDate);
          const dateKey = effectiveDate.toISOString().split('T')[0];
          
          // Only add if date is still within forecast window
          // For income, ensure we're using the actual payment date (not buffered)
          if (dailyData[dateKey] && (isIncome ? nextDate >= today : effectiveDate >= today)) {
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
              originalDate: nextDate.toISOString().split('T')[0], // Store original date for reference
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
        nextDate = calculateNextPaymentDate(
          nextDate,
          rp.frequency,
          rp.frequencyDays,
          rp.dayOfMonth,
          rp.dayOfWeek
        );
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
      'Devin',
      'Lunch',
      'Uncategorized',
      'Gifts',
    ];
    
    // Helper to normalize category names
    const normalizeCategory = (category) => {
      if (!category) return null;
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
      if (categoryLower === 'devin') return 'Devin';
      if (categoryLower === 'lunch') return 'Lunch';
      if (categoryLower === 'uncategorized') return 'Uncategorized';
      if (categoryLower === 'gifts' || categoryLower === 'gift') return 'Gifts';
      return null;
    };
    
    // Calculate monthly spending stats for forecast categories
    const categoryMonthlyData = {};
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
    
    // Filter transactions from current year and group by category and month
    allTransactions
      .filter(t => {
        if (!t.isExpense) return false;
        const txDate = new Date(t.date);
        return txDate >= yearStart && txDate <= yearEnd;
      })
      .forEach(t => {
        const normalizedCategory = normalizeCategory(t.userCategory);
        if (!normalizedCategory || !forecastCategories.includes(normalizedCategory)) return;
        
        const txDate = new Date(t.date);
        const monthIndex = txDate.getMonth();
        const amount = Math.abs(t.amount);
        
        if (!categoryMonthlyData[normalizedCategory]) {
          categoryMonthlyData[normalizedCategory] = Array(12).fill(0);
        }
        
        categoryMonthlyData[normalizedCategory][monthIndex] += amount;
      });
    
    // Calculate min, avg, max for each category
    const categorySpendingStats = {};
    Object.entries(categoryMonthlyData).forEach(([category, monthlyAmounts]) => {
      const nonZeroMonths = monthlyAmounts.filter(a => a > 0);
      if (nonZeroMonths.length === 0) return;
      
      const avgMonth = nonZeroMonths.reduce((a, b) => a + b, 0) / nonZeroMonths.length;
      const minMonth = Math.min(...nonZeroMonths);
      const maxMonth = Math.max(...monthlyAmounts);
      
      categorySpendingStats[category] = {
        minMonth: Math.round(minMonth * 100) / 100,
        avgMonth: Math.round(avgMonth * 100) / 100,
        maxMonth: Math.round(maxMonth * 100) / 100,
        monthsActive: nonZeroMonths.length,
      };
    });

    // Add category-based spending to forecast with custom schedules
    // Distribute monthly averages based on category-specific schedules
    const weeksPerMonth = 4.33;
    const daysPerMonth = 30.44; // Average days per month
    
    // Define category schedules
    const categorySchedules = {
      'Partying': { type: 'dayOfWeek', days: [5, 6, 0] }, // Friday, Saturday, Sunday
      'Dining out': { type: 'dayOfWeek', days: [4] }, // Thursday
      'Thrift': { type: 'dayOfWeek', days: [4] }, // Thursday
      'Shopping': { type: 'dayOfWeek', days: [5, 6, 0] }, // Friday, Saturday, Sunday
      'Groceries': { type: 'daily' }, // Every day
      'Amazon': { type: 'daily' }, // Every day
      'Beauty': { type: 'daily' }, // Every day
      'Cars': { type: 'daily' }, // Every day
      'Pets': { type: 'daily' }, // Every day (spread throughout month)
      'Entertainment': { type: 'daily' }, // Every day (spread throughout month)
      'Travel': { type: 'daily' }, // Every day (spread throughout month)
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
        // Calculate daily amount (monthly average / days per month)
        forecastAmount = stats.avgMonth / daysPerMonth;
        frequency = 'daily';
        
        // Add to every day in forecast period
        let currentDate = new Date(today);
        while (currentDate <= endDate) {
          const dateKey = currentDate.toISOString().split('T')[0];
          
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
        // For weekly categories: monthly average / (weeks per month * occurrences per week)
        const occurrencesPerWeek = schedule.days.length;
        const weeklyAmount = stats.avgMonth / (weeksPerMonth * occurrencesPerWeek);
        forecastAmount = weeklyAmount;
        frequency = 'weekly';
        
        // Add to specific days of week
        let currentDate = new Date(today);
        while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
          
          if (schedule.days.includes(dayOfWeek)) {
            const dateKey = currentDate.toISOString().split('T')[0];
            
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
      const actualDateKey = testDate.toISOString().split('T')[0];
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
          id: `pattern-${category}-${testDate.toISOString().split('T')[0]}`,
          name: `${category} (from pattern)`,
          category: category,
          amount: forecastAmount,
          isVariable: false, // Always use average
          frequency: frequency,
          originalDate: testDate.toISOString().split('T')[0],
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
            const dateKey = testDate.toISOString().split('T')[0];
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
            const dateKey = testDate.toISOString().split('T')[0];
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
            const dateKey = bufferedDate.toISOString().split('T')[0];
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
            const dateKey = bufferedDate.toISOString().split('T')[0];
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
    let lowestBalanceDate = today.toISOString().split('T')[0];
    
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
    
    // Calculate minimum balance needed to stay positive
    const minimumRequired = lowestBalance < 0 
      ? Math.abs(lowestBalance) + startingBalance 
      : 0;

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
        netChange: Math.round((totalProjectedIncome - totalProjectedExpenses) * 100) / 100,
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

