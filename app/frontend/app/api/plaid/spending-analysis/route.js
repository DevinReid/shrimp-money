import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * GET /api/plaid/spending-analysis
 * Get spending breakdown by category for the year
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
    const year = parseInt(searchParams.get('year') || new Date().getFullYear());
    
    // Get ALL transactions from normalized PlaidTransaction table
    // No need to filter by itemId - we want to see all spending across all accounts
    if (!prisma) {
      throw new Error('Database not available');
    }

    let allTransactions = [];
    
    try {
      // Query ALL transactions from the normalized PlaidTransaction table
      // This gives us a complete view of all spending, regardless of which Plaid item it came from
      const normalizedTransactions = await prisma.plaidTransaction.findMany({
        orderBy: { date: 'desc' },
      });
      
      // Convert normalized format to expected format
      allTransactions = normalizedTransactions.map(t => ({
        transaction_id: t.transactionId,
        account_id: t.accountId,
        name: t.name,
        merchant_name: t.merchantName,
        amount: t.amount,
        date: t.date.toISOString().split('T')[0],
        iso_currency_code: t.isoCurrencyCode,
        pending: t.pending,
        transaction_code: t.transactionCode,
        // User category is already in the table - no lookup needed!
        userCategory: t.userCategory,
      }));
      
      console.log(`✅ Loaded ${allTransactions.length} transactions from normalized PlaidTransaction table`);
    } catch (dbError) {
      console.error('❌ Error reading from normalized table:', dbError.message);
      // Check if it's a model not found error
      if (dbError.message && (
        dbError.message.includes('plaidTransaction') || 
        dbError.message.includes('Unknown model') ||
        dbError.message.includes('does not exist')
      )) {
        throw new Error('PlaidTransaction model not found. The Prisma client may need to be regenerated. Please restart the dev server.');
      }
      throw new Error(`Failed to load transactions: ${dbError.message}`);
    }
    
    if (allTransactions.length === 0) {
      return NextResponse.json({
        error: 'No transactions found. Please ensure transactions are imported.',
      }, { status: 404 });
    }

    // Build category map from transactions (userCategory is already in the data)
    // Also check for orphaned categories in PlaidTransactionCategory table
    let categoryMap = {};
    let orphanedCategories = [];
    
    // Categories are already in the transaction data from normalized table
    allTransactions.forEach(t => {
      if (t.userCategory) {
        categoryMap[t.transaction_id] = t.userCategory;
      }
    });
    
    // Check for orphaned categories (in category table but not in transactions)
    if (prisma && prisma.plaidTransactionCategory) {
      const allCategories = await prisma.plaidTransactionCategory.findMany();
      const transactionIds = new Set(allTransactions.map(t => t.transaction_id));
      orphanedCategories = allCategories
        .filter(c => !transactionIds.has(c.transactionId))
        .map(c => ({
          transactionId: c.transactionId,
          category: c.category,
        }));
    }

    // Filter transactions for the selected year and add user categories
    // Note: Date parsing - handle both YYYY-MM-DD and other formats
    const yearStart = new Date(year, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    yearEnd.setHours(23, 59, 59, 999);
    
    const yearTransactions = allTransactions
      .filter(t => {
        if (!t.date) return false;
        const txDate = new Date(t.date);
        // Check if date is valid
        if (isNaN(txDate.getTime())) {
          console.warn(`Invalid date for transaction ${t.transaction_id}: ${t.date}`);
          return false;
        }
        return txDate >= yearStart && txDate <= yearEnd;
      })
      .map(t => {
        // userCategory is already in the transaction data from normalized table
        const userCategory = t.userCategory || null;
        // Use user's category to determine if it's income or expense
        // If categorized as "Income", treat as income regardless of amount sign
        // If user has assigned a category (and it's not "Income"), treat as expense regardless of amount sign
        // Otherwise fall back to Plaid convention (positive = expense, negative = income)
        const isUserMarkedIncome = userCategory === 'Income';
        const hasUserCategory = userCategory && userCategory !== 'Uncategorized';
        
        // If user categorized it, respect their categorization
        // Income category = always income, any other category = always expense
        // If no category, use amount sign (positive = expense, negative = income)
        const isExpense = isUserMarkedIncome 
          ? false 
          : (hasUserCategory ? true : t.amount > 0);
        const isIncome = isUserMarkedIncome || (!hasUserCategory && t.amount < 0);
        
        return {
          ...t,
          userCategory,
          isExpense,
          isIncome,
          normalizedAmount: Math.abs(t.amount),
        };
      });

    // Initialize monthly data structure
    const months = [];
    for (let m = 0; m < 12; m++) {
      months.push({
        month: m,
        monthName: new Date(year, m, 1).toLocaleString('en-US', { month: 'long' }),
        shortName: new Date(year, m, 1).toLocaleString('en-US', { month: 'short' }),
        categories: {},
        totalExpenses: 0,
        totalIncome: 0,
        transactionCount: 0,
      });
    }

    // Category totals for the year
    const categoryTotals = {};
    const categoryMonthlyData = {};
    const categoryTransactions = {}; // Store transactions per category
    let totalYearExpenses = 0;
    let totalYearIncome = 0;
    let uncategorizedTotal = 0;
    let uncategorizedCount = 0;

    // Process each transaction
    yearTransactions.forEach(t => {
      const txDate = new Date(t.date);
      const monthIndex = txDate.getMonth();
      const category = t.userCategory || 'Uncategorized';
      const amount = t.normalizedAmount;

      // Update monthly data
      months[monthIndex].transactionCount++;
      
      if (t.isExpense) {
        months[monthIndex].totalExpenses += amount;
        totalYearExpenses += amount;
        
        // Category tracking
        if (!months[monthIndex].categories[category]) {
          months[monthIndex].categories[category] = { total: 0, count: 0, transactions: [] };
        }
        months[monthIndex].categories[category].total += amount;
        months[monthIndex].categories[category].count++;
        months[monthIndex].categories[category].transactions.push({
          id: t.transaction_id,
          name: t.name,
          amount: amount,
          date: t.date,
          merchant: t.merchant_name,
        });

        // Year totals by category
        if (!categoryTotals[category]) {
          categoryTotals[category] = { total: 0, count: 0, isExpense: true };
        }
        categoryTotals[category].total += amount;
        categoryTotals[category].count++;

        // Store transactions per category (for drill-down view)
        if (!categoryTransactions[category]) {
          categoryTransactions[category] = [];
        }
        categoryTransactions[category].push({
          id: t.transaction_id,
          name: t.name,
          merchant: t.merchant_name,
          amount: amount,
          date: t.date,
        });

        // Monthly breakdown for each category
        if (!categoryMonthlyData[category]) {
          categoryMonthlyData[category] = Array(12).fill(null).map(() => ({ total: 0, count: 0 }));
        }
        categoryMonthlyData[category][monthIndex].total += amount;
        categoryMonthlyData[category][monthIndex].count++;

        if (category === 'Uncategorized') {
          uncategorizedTotal += amount;
          uncategorizedCount++;
        }
      } else {
        months[monthIndex].totalIncome += amount;
        totalYearIncome += amount;

        // Track income categories too
        if (!categoryTotals[category]) {
          categoryTotals[category] = { total: 0, count: 0, isExpense: false };
        }
        // For income, we might want to track it separately
        if (category === 'Income') {
          categoryTotals[category].total += amount;
          categoryTotals[category].count++;
          categoryTotals[category].isExpense = false;
          
          // Store Income transactions for drill-down view
          if (!categoryTransactions[category]) {
            categoryTransactions[category] = [];
          }
          categoryTransactions[category].push({
            id: t.transaction_id,
            name: t.name,
            merchant: t.merchant_name,
            amount: amount,
            date: t.date,
          });
          
          // Monthly breakdown for Income category
          if (!categoryMonthlyData[category]) {
            categoryMonthlyData[category] = Array(12).fill(null).map(() => ({ total: 0, count: 0 }));
          }
          categoryMonthlyData[category][monthIndex].total += amount;
          categoryMonthlyData[category][monthIndex].count++;
        }
      }
    });

    // Calculate category statistics
    const categoryStats = Object.entries(categoryTotals)
      .filter(([cat, data]) => data.isExpense !== false || cat === 'Income')
      .map(([category, data]) => {
        const monthlyAmounts = categoryMonthlyData[category] 
          ? categoryMonthlyData[category].map(m => m.total)
          : Array(12).fill(0);
        
        const nonZeroMonths = monthlyAmounts.filter(a => a > 0);
        const avgPerMonth = nonZeroMonths.length > 0 
          ? nonZeroMonths.reduce((a, b) => a + b, 0) / nonZeroMonths.length 
          : 0;
        
        const minMonth = Math.min(...monthlyAmounts.filter(a => a > 0)) || 0;
        const maxMonth = Math.max(...monthlyAmounts) || 0;

        // Get transactions for this category, sorted by date (most recent first)
        const transactions = (categoryTransactions[category] || [])
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        // For Income category, calculate percent of total income instead of expenses
        const percentOfTotal = category === 'Income'
          ? (totalYearIncome > 0 ? Math.round((data.total / totalYearIncome) * 1000) / 10 : 0)
          : (totalYearExpenses > 0 ? Math.round((data.total / totalYearExpenses) * 1000) / 10 : 0);
        
        return {
          category,
          yearTotal: Math.round(data.total * 100) / 100,
          transactionCount: data.count,
          avgPerMonth: Math.round(avgPerMonth * 100) / 100,
          minMonth: Math.round(minMonth * 100) / 100,
          maxMonth: Math.round(maxMonth * 100) / 100,
          monthlyBreakdown: monthlyAmounts.map(a => Math.round(a * 100) / 100),
          percentOfTotal,
          monthsActive: nonZeroMonths.length,
          isExpense: data.isExpense !== false,
          // Include transactions for drill-down (limit to most recent 100 for performance)
          transactions: transactions.slice(0, 100),
          hasMoreTransactions: transactions.length > 100,
          totalTransactionCount: transactions.length,
        };
      })
      .sort((a, b) => b.yearTotal - a.yearTotal);

    // Monthly summary
    const monthlySummary = months.map(m => ({
      month: m.month,
      monthName: m.monthName,
      shortName: m.shortName,
      totalExpenses: Math.round(m.totalExpenses * 100) / 100,
      totalIncome: Math.round(m.totalIncome * 100) / 100,
      netChange: Math.round((m.totalIncome - m.totalExpenses) * 100) / 100,
      transactionCount: m.transactionCount,
      topCategories: Object.entries(m.categories)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([cat, data]) => ({
          category: cat,
          total: Math.round(data.total * 100) / 100,
          count: data.count,
        })),
    }));

    // Calculate averages
    const monthsWithData = monthlySummary.filter(m => m.transactionCount > 0).length;
    const avgMonthlyExpenses = monthsWithData > 0 ? totalYearExpenses / monthsWithData : 0;
    const avgMonthlyIncome = monthsWithData > 0 ? totalYearIncome / monthsWithData : 0;

    return NextResponse.json({
      success: true,
      year,
      summary: {
        totalExpenses: Math.round(totalYearExpenses * 100) / 100,
        totalIncome: Math.round(totalYearIncome * 100) / 100,
        netChange: Math.round((totalYearIncome - totalYearExpenses) * 100) / 100,
        avgMonthlyExpenses: Math.round(avgMonthlyExpenses * 100) / 100,
        avgMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
        totalTransactions: yearTransactions.length,
        categorizedTransactions: yearTransactions.filter(t => t.userCategory).length,
        uncategorizedTransactions: uncategorizedCount,
        uncategorizedTotal: Math.round(uncategorizedTotal * 100) / 100,
        monthsWithData,
        categoryCount: Object.keys(categoryTotals).length,
        // Warn about missing transactions
        orphanedCategories: orphanedCategories.length,
        orphanedCategoriesByType: orphanedCategories.reduce((acc, oc) => {
          acc[oc.category] = (acc[oc.category] || 0) + 1;
          return acc;
        }, {}),
      },
      categoryStats,
      monthlySummary,
      // Include available years for the dropdown
      availableYears: [...new Set(allTransactions.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a),
      // Suggest the year with the most transactions
      suggestedYear: (() => {
        const yearCounts = {};
        allTransactions.forEach(t => {
          const txYear = new Date(t.date).getFullYear();
          yearCounts[txYear] = (yearCounts[txYear] || 0) + 1;
        });
        return Object.entries(yearCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || year;
      })(),
    });
  } catch (error) {
    console.error('Error generating spending analysis:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

