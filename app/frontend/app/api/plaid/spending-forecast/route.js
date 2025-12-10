import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readAccountData, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

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

    // Build daily projections for the forecast period
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysToForecast);

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
      
      // If still no date, start from today
      if (!nextDate) {
        nextDate = new Date(today);
      }
      
      // Generate payments within the forecast window
      while (nextDate <= endDate) {
        if (nextDate >= today) {
          const dateKey = nextDate.toISOString().split('T')[0];
          
          if (dailyData[dateKey]) {
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
            };
            
            if (rp.category === 'Income') {
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
    });
  } catch (error) {
    console.error('Error generating spending forecast:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

