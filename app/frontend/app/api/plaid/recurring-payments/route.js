import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

const RECURRING_CATEGORIES = ['Income', 'Subscription', 'Bill', 'Credit Card'];

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
  const next = new Date(last);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'bi-weekly':
      next.setDate(next.getDate() + 14);
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
  
  return next;
}

/**
 * GET /api/plaid/recurring-payments
 * Get all recurring payments with predictions
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
    // Get all recurring payments from database
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

    // Get categorized transactions to find potential recurring payments
    const itemsData = await readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    
    let allTransactions = [];
    let categorizedTransactions = [];
    
    if (itemsData.items.length > 0) {
      const matchingItems = itemsData.items.filter(item => {
        if (!item.environment) return currentEnv === 'sandbox';
        return item.environment === currentEnv;
      });

      if (matchingItems.length > 0) {
        const item = matchingItems.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        )[0];

        // Try database first
        if (prisma && prisma.plaidTransactionData) {
          try {
            const dbData = await prisma.plaidTransactionData.findUnique({
              where: { itemId: item.item_id },
            });
            if (dbData && dbData.transactions) {
              allTransactions = Array.isArray(dbData.transactions) 
                ? dbData.transactions 
                : (dbData.transactions.transactions || []);
            }
          } catch (dbError) {
            console.log('⚠️ Could not read from database:', dbError.message);
          }
        }

        // Fallback to file storage
        if (allTransactions.length === 0) {
          const fileData = readTransactionData(item.item_id);
          if (fileData && fileData.transactions) {
            allTransactions = fileData.transactions || [];
          }
        }
      }
    }

    // Get categories for these transactions
    let categoryMap = {};
    if (prisma && prisma.plaidTransactionCategory) {
      const categories = await prisma.plaidTransactionCategory.findMany();
      categories.forEach(c => {
        categoryMap[c.transactionId] = c.category;
      });
    }

    // Helper function to normalize category names
    const normalizeCategory = (category) => {
      if (!category) return null;
      const categoryLower = category.toLowerCase().trim();
      if (categoryLower === 'subscription' || categoryLower === 'subscriptions') return 'Subscription';
      if (categoryLower === 'bill' || categoryLower === 'bills') return 'Bill';
      if (categoryLower === 'credit card' || categoryLower === 'credit cards') return 'Credit Card';
      if (categoryLower === 'income') return 'Income';
      return category; // Return original if no match
    };

    // Filter transactions to only those with recurring categories
    categorizedTransactions = allTransactions
      .filter(t => {
        const category = categoryMap[t.transaction_id];
        if (!category) return false;
        const normalized = normalizeCategory(category);
        return normalized && RECURRING_CATEGORIES.includes(normalized);
      })
      .map(t => {
        const category = categoryMap[t.transaction_id];
        return {
          ...t,
          userCategory: normalizeCategory(category) || category, // Use normalized category
        };
      });

    // Group transactions by merchant to suggest recurring payments not yet configured
    // Include both primary merchant names AND aliases
    const existingMerchants = new Set();
    recurringPayments.forEach(rp => {
      if (rp.merchantName) {
        existingMerchants.add(rp.merchantName.toLowerCase());
      }
      // Also check aliases
      if (rp.merchantAliases && Array.isArray(rp.merchantAliases)) {
        rp.merchantAliases.forEach(alias => {
          if (alias) existingMerchants.add(alias.toLowerCase());
        });
      }
    });
    const merchantGroups = {};
    
    categorizedTransactions.forEach(t => {
      const merchant = (t.merchant_name || t.name || '').toLowerCase().trim();
      if (!merchant || existingMerchants.has(merchant)) return;
      
      if (!merchantGroups[merchant]) {
        merchantGroups[merchant] = {
          merchant: t.merchant_name || t.name,
          category: t.userCategory,
          transactions: [],
          amounts: [],
        };
      }
      merchantGroups[merchant].transactions.push(t);
      merchantGroups[merchant].amounts.push(Math.abs(t.amount));
    });

    // Get dismissed suggestions to filter them out
    let dismissedSuggestions = new Set();
    if (prisma && prisma.plaidDismissedSuggestion) {
      try {
        const dismissed = await prisma.plaidDismissedSuggestion.findMany();
        dismissed.forEach(d => {
          // Store as lowercase for case-insensitive matching
          dismissedSuggestions.add(`${d.merchant.toLowerCase()}:${d.category}`);
        });
      } catch (dbError) {
        console.log('⚠️ Could not read dismissed suggestions:', dbError.message);
      }
    }

    // Find suggested recurring payments (merchants with 2+ transactions)
    const suggestions = Object.values(merchantGroups)
      .filter(g => {
        // Filter out dismissed suggestions
        const key = `${g.merchant.toLowerCase()}:${g.category}`;
        return g.transactions.length >= 2 && !dismissedSuggestions.has(key);
      })
      .map(g => {
        // Calculate amount statistics
        const amounts = g.amounts;
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const minAmount = Math.min(...amounts);
        const maxAmount = Math.max(...amounts);
        
        // Calculate standard deviation to determine if amount is variable
        const variance = amounts.reduce((sum, amt) => {
          return sum + Math.pow(amt - avgAmount, 2);
        }, 0) / amounts.length;
        const stdDev = Math.sqrt(variance);
        
        // If std dev > 5% of mean, consider it a variable amount
        // Subscriptions typically have <1% variance, Bills can have 10-50% variance
        const variancePercent = avgAmount > 0 ? (stdDev / avgAmount) * 100 : 0;
        const isVariableAmount = variancePercent > 5;
        
        // Category-based hint: Subscriptions default to fixed, Bills default to variable
        const categoryHint = g.category === 'Subscription' ? false : 
                            g.category === 'Bill' ? true : 
                            isVariableAmount;
        
        // Sort by date
        const sorted = g.transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Calculate average interval
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
          const diff = (new Date(sorted[i].date) - new Date(sorted[i-1].date)) / (1000 * 60 * 60 * 24);
          intervals.push(diff);
        }
        const avgInterval = intervals.length > 0 
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
          : 30;
        
        // Determine frequency
        let frequency = 'monthly';
        if (avgInterval <= 8) frequency = 'weekly';
        else if (avgInterval <= 16) frequency = 'bi-weekly';
        else if (avgInterval >= 85 && avgInterval <= 95) frequency = 'quarterly';
        else if (avgInterval >= 350) frequency = 'yearly';
        
        // Detect typical day of month for monthly payments
        let suggestedDayOfMonth = null;
        if (frequency === 'monthly' && sorted.length >= 2) {
          const daysOfMonth = sorted.map(t => new Date(t.date).getDate());
          // Find most common day
          const dayCount = {};
          daysOfMonth.forEach(d => {
            dayCount[d] = (dayCount[d] || 0) + 1;
          });
          const mostCommonDay = Object.entries(dayCount)
            .sort((a, b) => b[1] - a[1])[0];
          if (mostCommonDay && mostCommonDay[1] >= 2) {
            suggestedDayOfMonth = parseInt(mostCommonDay[0]);
          }
        }
        
        return {
          merchant: g.merchant,
          category: g.category,
          // For variable amounts, use max for conservative forecasting
          suggestedAmount: Math.round((categoryHint ? maxAmount : avgAmount) * 100) / 100,
          amountMin: Math.round(minAmount * 100) / 100,
          amountMax: Math.round(maxAmount * 100) / 100,
          amountAvg: Math.round(avgAmount * 100) / 100,
          isVariableAmount: categoryHint,
          variancePercent: Math.round(variancePercent * 10) / 10,
          suggestedFrequency: frequency,
          suggestedDayOfMonth,
          occurrences: g.transactions.length,
          lastDate: sorted[sorted.length - 1].date,
          transactions: sorted.slice(-5).map(t => ({
            id: t.transaction_id,
            date: t.date,
            amount: t.amount,
          })),
        };
      })
      .sort((a, b) => b.occurrences - a.occurrences);

    // Calculate upcoming payments for next 60 days
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 60);
    
    const upcomingPayments = [];
    const paymentsByDate = {};
    
    recurringPayments.forEach(rp => {
      let nextDate = null;
      
      // For WEEKLY payments with dayOfWeek, always find the next occurrence of that day
      if (rp.frequency === 'weekly' && rp.dayOfWeek !== null && rp.dayOfWeek !== undefined) {
        // Find the next occurrence of the specified day from today
        nextDate = new Date(today);
        const currentDay = nextDate.getDay();
        const targetDay = parseInt(rp.dayOfWeek);
        
        // Calculate days until target day
        let daysUntilTarget = (targetDay - currentDay + 7) % 7;
        
        if (daysUntilTarget === 0) {
          // Today is the target day, go to next week
          daysUntilTarget = 7;
        }
        
        nextDate.setDate(nextDate.getDate() + daysUntilTarget);
        nextDate.setHours(0, 0, 0, 0);
        
        // Verify the date is actually on the correct day
        if (nextDate.getDay() !== targetDay) {
          // If somehow wrong, recalculate
          nextDate = new Date(today);
          daysUntilTarget = (targetDay - nextDate.getDay() + 7) % 7;
          if (daysUntilTarget === 0) daysUntilTarget = 7;
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
      }
      
      // Generate upcoming payments
      while (nextDate && nextDate <= futureDate) {
        // For weekly with dayOfWeek, verify the date matches the specified day
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
        
        if (nextDate >= today) {
          const dateKey = formatLocalDate(nextDate);
          
          // Use max amount for variable bills (conservative forecasting)
          const forecastAmount = rp.isVariableAmount && rp.amountMax 
            ? rp.amountMax 
            : rp.amount;
          
          upcomingPayments.push({
            recurringPaymentId: rp.id,
            name: rp.name,
            category: rp.category,
            amount: forecastAmount,
            // Include range info for UI tooltips
            isVariable: rp.isVariableAmount || false,
            amountMin: rp.amountMin,
            amountMax: rp.amountMax,
            date: dateKey,
            frequency: rp.frequency,
            isIncome: rp.category === 'Income',
          });
          
          if (!paymentsByDate[dateKey]) {
            paymentsByDate[dateKey] = { expenses: 0, income: 0 };
          }
          if (rp.category === 'Income') {
            paymentsByDate[dateKey].income += forecastAmount;
          } else {
            paymentsByDate[dateKey].expenses += forecastAmount;
          }
        }
        
        // Calculate next occurrence
        // For weekly with dayOfWeek, just add 7 days to maintain the same day
        if (rp.frequency === 'weekly' && rp.dayOfWeek !== null && rp.dayOfWeek !== undefined) {
          nextDate.setDate(nextDate.getDate() + 7);
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
    
    // Sort by date
    upcomingPayments.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate summary statistics
    const totalMonthlyExpenses = recurringPayments
      .filter(rp => rp.category !== 'Income')
      .reduce((sum, rp) => {
        const multiplier = rp.frequency === 'weekly' ? 4.33 
          : rp.frequency === 'bi-weekly' ? 2.17 
          : rp.frequency === 'quarterly' ? 0.33 
          : rp.frequency === 'yearly' ? 0.083 
          : 1;
        return sum + (rp.amount * multiplier);
      }, 0);

    const totalMonthlyIncome = recurringPayments
      .filter(rp => rp.category === 'Income')
      .reduce((sum, rp) => {
        const multiplier = rp.frequency === 'weekly' ? 4.33 
          : rp.frequency === 'bi-weekly' ? 2.17 
          : rp.frequency === 'quarterly' ? 0.33 
          : rp.frequency === 'yearly' ? 0.083 
          : 1;
        return sum + (rp.amount * multiplier);
      }, 0);

    // Get dismissed suggestions to return to client
    let dismissedSuggestionsList = [];
    if (prisma && prisma.plaidDismissedSuggestion) {
      try {
        dismissedSuggestionsList = await prisma.plaidDismissedSuggestion.findMany();
      } catch (dbError) {
        console.log('⚠️ Could not read dismissed suggestions:', dbError.message);
      }
    }

    return NextResponse.json({
      success: true,
      recurringPayments: recurringPayments.map(rp => ({
        ...rp,
        merchantAliases: rp.merchantAliases || [],
        amountMin: rp.amountMin,
        amountMax: rp.amountMax,
        isVariableAmount: rp.isVariableAmount || false,
        startDate: rp.startDate?.toISOString(),
        endDate: rp.endDate?.toISOString(),
        lastPaymentDate: rp.lastPaymentDate?.toISOString(),
        nextPaymentDate: rp.nextPaymentDate?.toISOString(),
        createdAt: rp.createdAt?.toISOString(),
        updatedAt: rp.updatedAt?.toISOString(),
      })),
      suggestions,
      dismissedSuggestions: dismissedSuggestionsList.map(d => ({
        merchant: d.merchant,
        category: d.category,
      })),
      upcomingPayments,
      paymentsByDate,
      summary: {
        totalRecurring: recurringPayments.length,
        totalMonthlyExpenses: Math.round(totalMonthlyExpenses * 100) / 100,
        totalMonthlyIncome: Math.round(totalMonthlyIncome * 100) / 100,
        netMonthly: Math.round((totalMonthlyIncome - totalMonthlyExpenses) * 100) / 100,
        byCategory: RECURRING_CATEGORIES.reduce((acc, cat) => {
          acc[cat] = recurringPayments.filter(rp => rp.category === cat).length;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('Error fetching recurring payments:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * POST /api/plaid/recurring-payments
 * Create a new recurring payment
 */
export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const body = await req.json();
    const {
      name,
      merchantName,
      category,
      amount,
      amountMin,
      amountMax,
      isVariableAmount,
      frequency,
      frequencyDays,
      dayOfMonth,
      dayOfWeek,
      startDate,
      endDate,
      lastPaymentDate,
      notes,
      isAutoDetected,
    } = body;

    if (!name || !category || !amount || !frequency) {
      return NextResponse.json({
        error: 'Name, category, amount, and frequency are required',
      }, { status: 400 });
    }

    if (!RECURRING_CATEGORIES.includes(category)) {
      return NextResponse.json({
        error: `Category must be one of: ${RECURRING_CATEGORIES.join(', ')}`,
      }, { status: 400 });
    }

    // Calculate next payment date
    const lastDate = lastPaymentDate ? new Date(lastPaymentDate) : new Date(startDate || new Date());
    const nextPaymentDate = calculateNextPaymentDate(
      lastDate,
      frequency,
      frequencyDays,
      dayOfMonth,
      dayOfWeek
    );

    // Determine if variable based on category hint if not explicitly set
    const isVariable = isVariableAmount !== undefined 
      ? isVariableAmount 
      : (category === 'Bill' || category === 'Credit Card');

    const recurringPayment = await prisma.plaidRecurringPayment.create({
      data: {
        name,
        merchantName: merchantName || null,
        category,
        amount: parseFloat(amount),
        amountMin: amountMin ? parseFloat(amountMin) : null,
        amountMax: amountMax ? parseFloat(amountMax) : null,
        isVariableAmount: isVariable,
        frequency,
        frequencyDays: frequencyDays ? parseInt(frequencyDays) : null,
        dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null,
        dayOfWeek: dayOfWeek ? parseInt(dayOfWeek) : null,
        startDate: new Date(startDate || new Date()),
        endDate: endDate ? new Date(endDate) : null,
        lastPaymentDate: lastPaymentDate ? new Date(lastPaymentDate) : null,
        nextPaymentDate,
        notes: notes || null,
        isAutoDetected: isAutoDetected || false,
      },
    });

    return NextResponse.json({
      success: true,
      recurringPayment: {
        ...recurringPayment,
        amountMin: recurringPayment.amountMin,
        amountMax: recurringPayment.amountMax,
        isVariableAmount: recurringPayment.isVariableAmount || false,
        startDate: recurringPayment.startDate?.toISOString(),
        endDate: recurringPayment.endDate?.toISOString(),
        lastPaymentDate: recurringPayment.lastPaymentDate?.toISOString(),
        nextPaymentDate: recurringPayment.nextPaymentDate?.toISOString(),
        createdAt: recurringPayment.createdAt?.toISOString(),
        updatedAt: recurringPayment.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating recurring payment:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

