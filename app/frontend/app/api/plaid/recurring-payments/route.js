import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

const RECURRING_CATEGORIES = ['Income', 'Subscription', 'Bill', 'Credit Card'];

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

    // Filter transactions to only those with recurring categories
    categorizedTransactions = allTransactions
      .filter(t => {
        const category = categoryMap[t.transaction_id];
        return category && RECURRING_CATEGORIES.includes(category);
      })
      .map(t => ({
        ...t,
        userCategory: categoryMap[t.transaction_id],
      }));

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

    // Find suggested recurring payments (merchants with 2+ transactions)
    const suggestions = Object.values(merchantGroups)
      .filter(g => g.transactions.length >= 2)
      .map(g => {
        // Calculate average amount
        const avgAmount = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length;
        
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
        
        return {
          merchant: g.merchant,
          category: g.category,
          suggestedAmount: Math.round(avgAmount * 100) / 100,
          suggestedFrequency: frequency,
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
      let nextDate = rp.nextPaymentDate ? new Date(rp.nextPaymentDate) : null;
      
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
      
      // Generate upcoming payments
      while (nextDate && nextDate <= futureDate) {
        if (nextDate >= today) {
          const dateKey = nextDate.toISOString().split('T')[0];
          
          upcomingPayments.push({
            recurringPaymentId: rp.id,
            name: rp.name,
            category: rp.category,
            amount: rp.amount,
            date: dateKey,
            frequency: rp.frequency,
            isIncome: rp.category === 'Income',
          });
          
          if (!paymentsByDate[dateKey]) {
            paymentsByDate[dateKey] = { expenses: 0, income: 0 };
          }
          if (rp.category === 'Income') {
            paymentsByDate[dateKey].income += rp.amount;
          } else {
            paymentsByDate[dateKey].expenses += rp.amount;
          }
        }
        
        nextDate = calculateNextPaymentDate(
          nextDate,
          rp.frequency,
          rp.frequencyDays,
          rp.dayOfMonth,
          rp.dayOfWeek
        );
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

    return NextResponse.json({
      success: true,
      recurringPayments: recurringPayments.map(rp => ({
        ...rp,
        merchantAliases: rp.merchantAliases || [],
        startDate: rp.startDate?.toISOString(),
        endDate: rp.endDate?.toISOString(),
        lastPaymentDate: rp.lastPaymentDate?.toISOString(),
        nextPaymentDate: rp.nextPaymentDate?.toISOString(),
        createdAt: rp.createdAt?.toISOString(),
        updatedAt: rp.updatedAt?.toISOString(),
      })),
      suggestions,
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

    const recurringPayment = await prisma.plaidRecurringPayment.create({
      data: {
        name,
        merchantName: merchantName || null,
        category,
        amount: parseFloat(amount),
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

