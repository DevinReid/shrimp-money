import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
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
    
    // Get all transactions from normalized table (preferred) or JSON blob (fallback)
    const itemsData = await readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    
    let allTransactions = [];
    
    if (itemsData.items.length > 0) {
      const matchingItems = itemsData.items.filter(item => {
        if (!item.environment) return currentEnv === 'sandbox';
        return item.environment === currentEnv;
      });

      if (matchingItems.length > 0) {
        const item = matchingItems.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        )[0];

        // Try normalized table first (NEW - preferred method)
        if (prisma && prisma.plaidTransaction) {
          try {
            const normalizedTransactions = await prisma.plaidTransaction.findMany({
              where: { itemId: item.item_id },
              orderBy: { date: 'desc' },
            });
            
            if (normalizedTransactions.length > 0) {
              // Convert normalized format back to Plaid format for compatibility
              allTransactions = normalizedTransactions.map(t => ({
                transaction_id: t.transactionId,
                account_id: t.accountId,
                name: t.name,
                merchant_name: t.merchantName,
                amount: t.amount,
                date: t.date.toISOString().split('T')[0],
                category: t.category ? (Array.isArray(t.category) ? t.category : JSON.parse(JSON.stringify(t.category))) : null,
                iso_currency_code: t.isoCurrencyCode,
                pending: t.pending,
                transaction_code: t.transactionCode,
                // Include user category directly from table (no need to look up separately!)
                userCategory: t.userCategory,
                // Include raw data if available
                ...(t.rawData ? JSON.parse(JSON.stringify(t.rawData)) : {}),
              }));
              console.log(`✅ Loaded ${allTransactions.length} transactions from normalized table`);
            }
          } catch (dbError) {
            console.log('⚠️ Could not read from normalized table:', dbError.message);
          }
        }

        // Fallback to JSON blob if normalized table is empty
        if (allTransactions.length === 0 && prisma && prisma.plaidTransactionData) {
          try {
            const dbData = await prisma.plaidTransactionData.findUnique({
              where: { itemId: item.item_id },
            });
            if (dbData && dbData.transactions) {
              allTransactions = Array.isArray(dbData.transactions) 
                ? dbData.transactions 
                : (dbData.transactions.transactions || []);
              console.log(`⚠️ Loaded ${allTransactions.length} transactions from JSON blob (fallback)`);
            }
          } catch (dbError) {
            console.log('⚠️ Could not read from database:', dbError.message);
          }
        }

        // Final fallback to file storage
        if (allTransactions.length === 0) {
          const fileData = readTransactionData(item.item_id);
          if (fileData && fileData.transactions) {
            allTransactions = fileData.transactions || [];
            console.log(`⚠️ Loaded ${allTransactions.length} transactions from file (fallback)`);
          }
        }
      }
    }

    // Get user categories - if using normalized table, categories are already included
    // Otherwise, build category map from PlaidTransactionCategory table
    let categoryMap = {};
    let allCategoryIds = new Set();
    let orphanedCategories = [];
    
    // Check if we're using normalized table (userCategory already in data)
    const usingNormalizedTable = allTransactions.length > 0 && allTransactions[0].userCategory !== undefined;
    
    if (usingNormalizedTable) {
      // Categories are already in the transaction data, just build map for consistency
      allTransactions.forEach(t => {
        if (t.userCategory) {
          categoryMap[t.transaction_id] = t.userCategory;
          allCategoryIds.add(t.transaction_id);
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
    } else {
      // Fallback: build category map from PlaidTransactionCategory table
      if (prisma && prisma.plaidTransactionCategory) {
        const categories = await prisma.plaidTransactionCategory.findMany();
        categories.forEach(c => {
          categoryMap[c.transactionId] = c.category;
          allCategoryIds.add(c.transactionId);
        });
      }
      
      // Check for orphaned categories
      const transactionIds = new Set(allTransactions.map(t => t.transaction_id));
      const orphanedCategoryIds = [...allCategoryIds].filter(id => !transactionIds.has(id));
      orphanedCategories = orphanedCategoryIds.map(id => ({
        transactionId: id,
        category: categoryMap[id],
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
        // Use userCategory from transaction if available, otherwise look up in categoryMap
        const userCategory = t.userCategory || categoryMap[t.transaction_id] || null;
        // Use user's category to determine if it's income
        // If categorized as "Income", treat as income regardless of amount sign
        // Otherwise fall back to Plaid convention (positive = expense)
        const isUserMarkedIncome = userCategory === 'Income';
        
        return {
          ...t,
          userCategory,
          // Respect user's category assignment for income
          isExpense: !isUserMarkedIncome && t.amount > 0,
          isIncome: isUserMarkedIncome || t.amount < 0,
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

        return {
          category,
          yearTotal: Math.round(data.total * 100) / 100,
          transactionCount: data.count,
          avgPerMonth: Math.round(avgPerMonth * 100) / 100,
          minMonth: Math.round(minMonth * 100) / 100,
          maxMonth: Math.round(maxMonth * 100) / 100,
          monthlyBreakdown: monthlyAmounts.map(a => Math.round(a * 100) / 100),
          percentOfTotal: totalYearExpenses > 0 
            ? Math.round((data.total / totalYearExpenses) * 1000) / 10 
            : 0,
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
    });
  } catch (error) {
    console.error('Error generating spending analysis:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

