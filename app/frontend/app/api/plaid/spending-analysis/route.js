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
    const yearParam = searchParams.get('year') || new Date().getFullYear().toString();
    const isLast12Months = yearParam === 'last12months';
    const year = isLast12Months ? null : parseInt(yearParam);
    
    // Get ALL transactions from normalized PlaidTransaction table
    // No need to filter by itemId - we want to see all spending across all accounts
    if (!prisma) {
      throw new Error('Database not available');
    }

    let allTransactions = [];
    const transactionMap = new Map(); // Use Map to deduplicate by transaction_id
    
    try {
      // First, try to get transactions from the normalized PlaidTransaction table
      try {
        const normalizedTransactions = await prisma.plaidTransaction.findMany({
          orderBy: { date: 'desc' },
        });
        
        // Get all categories to fill in any missing userCategory fields
        let categoryMapForNormalized = {};
        if (prisma && prisma.plaidTransactionCategory) {
          try {
            const transactionIds = normalizedTransactions.map(t => t.transactionId);
            const categories = await prisma.plaidTransactionCategory.findMany({
              where: { transactionId: { in: transactionIds } },
            });
            categoryMapForNormalized = categories.reduce((acc, cat) => {
              acc[cat.transactionId] = cat.category;
              return acc;
            }, {});
          } catch (catError) {
            console.warn('⚠️ Could not load categories for normalized transactions:', catError.message);
          }
        }
        
        // Convert normalized format to expected format
        normalizedTransactions.forEach(t => {
          const dateObj = t.date instanceof Date ? t.date : new Date(t.date);
          const dateStr = dateObj.toISOString().split('T')[0];
          
          // Use userCategory from table, or fall back to PlaidTransactionCategory if missing
          const userCategory = t.userCategory || categoryMapForNormalized[t.transactionId] || null;
          
          transactionMap.set(t.transactionId, {
            transaction_id: t.transactionId,
            account_id: t.accountId,
            name: t.name,
            merchant_name: t.merchantName,
            amount: t.amount,
            date: dateStr,
            dateObj: dateObj,
            iso_currency_code: t.isoCurrencyCode,
            pending: t.pending,
            transaction_code: t.transactionCode,
            userCategory: userCategory,
          });
        });
        
        console.log(`✅ Loaded ${normalizedTransactions.length} transactions from normalized PlaidTransaction table`);
        const withCategories = normalizedTransactions.filter(t => t.userCategory || categoryMapForNormalized[t.transactionId]).length;
        console.log(`   ${withCategories} transactions have categories (${withCategories} from table, ${Object.keys(categoryMapForNormalized).length - normalizedTransactions.filter(t => t.userCategory).length} from category table)`);
      } catch (normalizedError) {
        console.warn('⚠️ Could not read from normalized table:', normalizedError.message);
      }
      
      // Also check PlaidTransactionData (JSON blob) for any missing transactions
      // This ensures we get ALL transactions, including recent ones that might not be migrated yet
      try {
        if (prisma && prisma.plaidTransactionData) {
          const transactionDataRecords = await prisma.plaidTransactionData.findMany();
          
          for (const record of transactionDataRecords) {
            let transactions = [];
            if (record.transactions) {
              if (Array.isArray(record.transactions)) {
                transactions = record.transactions;
              } else if (record.transactions.transactions && Array.isArray(record.transactions.transactions)) {
                transactions = record.transactions.transactions;
              }
            }
            
            // Get categories for these transactions
            let categoryMap = {};
            if (prisma && prisma.plaidTransactionCategory) {
              try {
                const transactionIds = transactions.map(t => t.transaction_id);
                const categories = await prisma.plaidTransactionCategory.findMany({
                  where: { transactionId: { in: transactionIds } },
                });
                categoryMap = categories.reduce((acc, cat) => {
                  acc[cat.transactionId] = cat.category;
                  return acc;
                }, {});
              } catch (catError) {
                console.warn('⚠️ Could not load categories:', catError.message);
              }
            }
            
            // Add transactions that aren't already in the map
            transactions.forEach(txn => {
              if (!transactionMap.has(txn.transaction_id)) {
                const dateObj = txn.date ? new Date(txn.date) : new Date();
                const dateStr = dateObj.toISOString().split('T')[0];
                
                transactionMap.set(txn.transaction_id, {
                  transaction_id: txn.transaction_id,
                  account_id: txn.account_id || '',
                  name: txn.name || '',
                  merchant_name: txn.merchant_name || null,
                  amount: parseFloat(txn.amount) || 0,
                  date: dateStr,
                  dateObj: dateObj,
                  iso_currency_code: txn.iso_currency_code || null,
                  pending: txn.pending || false,
                  transaction_code: txn.transaction_code || null,
                  userCategory: categoryMap[txn.transaction_id] || null,
                });
              }
            });
            
            console.log(`✅ Added ${transactions.length} transactions from PlaidTransactionData (itemId: ${record.itemId})`);
          }
        }
      } catch (blobError) {
        console.warn('⚠️ Could not read from PlaidTransactionData:', blobError.message);
      }
      
      // Convert map to array
      allTransactions = Array.from(transactionMap.values());
      
      console.log(`✅ Total unique transactions loaded: ${allTransactions.length}`);
      console.log(`   From normalized table: ${transactionMap.size > 0 ? 'yes' : 'no'}`);
      console.log(`   From JSON blob: ${transactionMap.size > 0 ? 'yes' : 'no'}`);
      
    } catch (dbError) {
      console.error('❌ Error reading from database:', dbError.message);
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

    // Count ALL uncategorized transactions (not just current period)
    const allUncategorizedCount = allTransactions.filter(t => !t.userCategory || t.userCategory === 'Uncategorized').length;
    const allUncategorizedTotal = allTransactions
      .filter(t => !t.userCategory || t.userCategory === 'Uncategorized')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Filter transactions for the selected period
    // For "last 12 months", use rolling 12 months from today
    // For calendar year, use Jan 1 - Dec 31 of that year
    let periodStart, periodEnd;
    if (isLast12Months) {
      const today = new Date();
      periodEnd = new Date(today);
      periodEnd.setHours(23, 59, 59, 999);
      periodStart = new Date(today);
      periodStart.setMonth(periodStart.getMonth() - 12);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart = new Date(year, 0, 1);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(year, 11, 31, 23, 59, 59);
      periodEnd.setHours(23, 59, 59, 999);
    }
    
    // Debug: Log the period we're filtering for
    console.log(`\n📅 Filtering transactions for period:`);
    console.log(`   Period start: ${periodStart.toISOString()} (${periodStart.toLocaleDateString()})`);
    console.log(`   Period end: ${periodEnd.toISOString()} (${periodEnd.toLocaleDateString()})`);
    console.log(`   Year: ${year || 'last12months'}`);
    
    const periodTransactions = allTransactions
      .filter(t => {
        if (!t.date) return false;
        
        // Use the Date object if available, otherwise parse the string
        let txDate;
        if (t.dateObj && t.dateObj instanceof Date) {
          txDate = new Date(t.dateObj);
        } else if (typeof t.date === 'string') {
          // Parse date string as local date (not UTC) to avoid timezone shifts
          // "2026-01-15" should be Jan 15, not Jan 14
          const [year, month, day] = t.date.split('-').map(Number);
          if (isNaN(year) || isNaN(month) || isNaN(day)) {
            console.warn(`Invalid date string for transaction ${t.transaction_id}: ${t.date}`);
            return false;
          }
          txDate = new Date(year, month - 1, day);
        } else {
          txDate = new Date(t.date);
        }
        
        // Check if date is valid
        if (isNaN(txDate.getTime())) {
          console.warn(`Invalid date for transaction ${t.transaction_id}: ${t.date}`);
          return false;
        }
        
        // Normalize times to midnight for accurate date comparison
        txDate.setHours(0, 0, 0, 0);
        const normalizedPeriodStart = new Date(periodStart);
        normalizedPeriodStart.setHours(0, 0, 0, 0);
        const normalizedPeriodEnd = new Date(periodEnd);
        normalizedPeriodEnd.setHours(23, 59, 59, 999);
        
        const isInPeriod = txDate >= normalizedPeriodStart && txDate <= normalizedPeriodEnd;
        
        // Debug: Log transactions that are in 2026 but might be getting filtered out
        if (!isInPeriod && year === 2026) {
          const txYear = txDate.getFullYear();
          if (txYear === 2026) {
            console.log(`   ⚠️ 2026 transaction filtered out: ${t.name?.substring(0, 30)} | date=${t.date} | parsed=${txDate.toISOString()} | periodStart=${normalizedPeriodStart.toISOString()} | periodEnd=${normalizedPeriodEnd.toISOString()}`);
          }
        }
        
        return isInPeriod;
      })
      .map(t => {
        // userCategory is already in the transaction data from normalized table
        const userCategory = t.userCategory || null;
        // Use user's category to determine if it's income or expense
        // If categorized as "Income", treat as income regardless of amount sign
        // If user has assigned a category (and it's not "Income"), treat as expense regardless of amount sign
        // Otherwise fall back to Plaid convention: positive = expense, negative = income
        const isUserMarkedIncome = userCategory === 'Income';
        const hasUserCategory = userCategory && userCategory !== 'Uncategorized';
        
        // If user categorized it, respect their categorization
        // Income category = always income, any other category = always expense
        // If no category, use Plaid convention: positive = expense, negative = income
        let isExpense = false;
        let isIncome = false;
        
        if (isUserMarkedIncome) {
          // User explicitly marked as Income
          isIncome = true;
          isExpense = false;
        } else if (hasUserCategory) {
          // User assigned a category (not Income) = expense
          isExpense = true;
          isIncome = false;
        } else {
          // No category - use Plaid convention: positive = expense, negative = income
          if (t.amount > 0) {
            isExpense = true;
            isIncome = false;
          } else if (t.amount < 0) {
            isIncome = true;
            isExpense = false;
          } else {
            // Zero amount - skip
            isExpense = false;
            isIncome = false;
          }
        }
        
        return {
          ...t,
          userCategory,
          isExpense,
          isIncome,
          normalizedAmount: Math.abs(t.amount),
        };
      });
    
    // Debug: Log sample transactions to understand the data
    if (periodTransactions.length > 0) {
      const periodLabel = isLast12Months ? 'Last 12 Months' : year.toString();
      console.log(`\n🔍 DEBUG: Sample transactions for ${periodLabel}:`);
      const samples = periodTransactions.slice(0, 5);
      samples.forEach(t => {
        console.log(`  - ${t.name}: date=${t.date}, amount=${t.amount}, category=${t.userCategory || 'none'}, isExpense=${t.isExpense}, isIncome=${t.isIncome}, normalized=${t.normalizedAmount}`);
      });
      console.log(`  Total transactions in period: ${periodTransactions.length}`);
    } else {
      const periodLabel = isLast12Months ? 'Last 12 Months' : year.toString();
      console.log(`\n⚠️ WARNING: No transactions found for ${periodLabel}`);
      console.log(`  Total transactions in database: ${allTransactions.length}`);
      if (allTransactions.length > 0) {
        // Show transactions that might be in 2026
        const potential2026 = allTransactions.filter(t => {
          if (!t.date) return false;
          const txDate = typeof t.date === 'string' 
            ? (() => { const [y, m, d] = t.date.split('-').map(Number); return new Date(y, m - 1, d); })()
            : new Date(t.date);
          return txDate.getFullYear() === 2026;
        });
        console.log(`  Transactions with year 2026: ${potential2026.length}`);
        if (potential2026.length > 0) {
          console.log(`  Sample 2026 transactions:`, potential2026.slice(0, 5).map(t => ({
            id: t.transaction_id,
            name: t.name?.substring(0, 30),
            date: t.date,
            parsedYear: (() => {
              if (typeof t.date === 'string') {
                const [y] = t.date.split('-').map(Number);
                return y;
              }
              return new Date(t.date).getFullYear();
            })()
          })));
        }
        const sampleDates = allTransactions.slice(0, 10).map(t => {
          let parsedDate;
          if (typeof t.date === 'string') {
            const [y, m, d] = t.date.split('-').map(Number);
            parsedDate = new Date(y, m - 1, d);
          } else {
            parsedDate = new Date(t.date);
          }
          return { 
            date: t.date, 
            parsed: parsedDate.toISOString(),
            year: parsedDate.getFullYear(),
            month: parsedDate.getMonth() + 1,
            day: parsedDate.getDate()
          };
        });
        console.log(`  Sample dates from database:`, sampleDates);
      }
    }

    // Initialize monthly data structure
    // For last 12 months, create 12 months from periodStart
    // For calendar year, create 12 months for that year
    const months = [];
    if (isLast12Months) {
      // Create 12 months starting from periodStart
      for (let i = 0; i < 12; i++) {
        const monthDate = new Date(periodStart);
        monthDate.setMonth(monthDate.getMonth() + i);
        months.push({
          month: monthDate.getMonth(),
          monthName: monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
          shortName: monthDate.toLocaleString('en-US', { month: 'short' }),
          year: monthDate.getFullYear(),
          categories: {},
          totalExpenses: 0,
          totalIncome: 0,
          transactionCount: 0,
        });
      }
    } else {
      // Calendar year - 12 months
      for (let m = 0; m < 12; m++) {
        months.push({
          month: m,
          monthName: new Date(year, m, 1).toLocaleString('en-US', { month: 'long' }),
          shortName: new Date(year, m, 1).toLocaleString('en-US', { month: 'short' }),
          year: year,
          categories: {},
          totalExpenses: 0,
          totalIncome: 0,
          transactionCount: 0,
        });
      }
    }

    // Category totals for the year
    const categoryTotals = {};
    const categoryMonthlyData = {};
    const categoryTransactions = {}; // Store transactions per category
    let totalYearExpenses = 0;
    let totalYearIncome = 0;
    let uncategorizedTotal = 0;
    let uncategorizedCount = 0;

    // Debug: Count transactions by type
    let expenseCount = 0;
    let incomeCount = 0;
    let neitherCount = 0;
    
    // Process each transaction
    periodTransactions.forEach(t => {
      const txDate = new Date(t.date);
      // For last 12 months, find the month index based on periodStart
      // For calendar year, use the month index directly
      let monthIndex;
      if (isLast12Months) {
        // Find which of the 12 months this transaction belongs to
        const monthsSinceStart = (txDate.getFullYear() - periodStart.getFullYear()) * 12 + 
                                 (txDate.getMonth() - periodStart.getMonth());
        monthIndex = Math.max(0, Math.min(11, monthsSinceStart));
      } else {
        monthIndex = txDate.getMonth();
      }
      
      const category = t.userCategory || 'Uncategorized';
      const amount = t.normalizedAmount;
      const isTransfer = category === 'Transfer';

      // Update monthly data
      if (monthIndex >= 0 && monthIndex < months.length) {
        months[monthIndex].transactionCount++;
      
        // Debug counting
        if (t.isExpense) expenseCount++;
        else if (t.isIncome) incomeCount++;
        else neitherCount++;
        
        if (t.isExpense) {
          // Exclude transfers from expense totals (they're just moving money between accounts)
          if (!isTransfer) {
            months[monthIndex].totalExpenses += amount;
            totalYearExpenses += amount;
          }
          
          // Category tracking (exclude transfers from category totals, but keep them visible for drill-down)
          if (!months[monthIndex].categories[category]) {
            months[monthIndex].categories[category] = { total: 0, count: 0, transactions: [] };
          }
          // Only add to category totals if it's not a transfer
          if (!isTransfer) {
            months[monthIndex].categories[category].total += amount;
            months[monthIndex].categories[category].count++;
          }
          // Always store transactions for drill-down view (including transfers)
          months[monthIndex].categories[category].transactions.push({
            id: t.transaction_id,
            name: t.name,
            amount: amount,
            date: t.date,
            merchant: t.merchant_name,
          });

          // Year totals by category (exclude transfers from category totals)
          if (!categoryTotals[category]) {
            categoryTotals[category] = { total: 0, count: 0, isExpense: true };
          }
          // Only add to category totals if it's not a transfer
          if (!isTransfer) {
            categoryTotals[category].total += amount;
            categoryTotals[category].count++;
          }

          // Store transactions per category (for drill-down view, including transfers)
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

          // Monthly breakdown for each category (exclude transfers from totals)
          if (!categoryMonthlyData[category]) {
            categoryMonthlyData[category] = Array(12).fill(null).map(() => ({ total: 0, count: 0 }));
          }
          // Only add to monthly breakdown if it's not a transfer
          if (!isTransfer) {
            categoryMonthlyData[category][monthIndex].total += amount;
            categoryMonthlyData[category][monthIndex].count++;
          }

          if (category === 'Uncategorized' && !isTransfer) {
            uncategorizedTotal += amount;
            uncategorizedCount++;
          }
        } else {
          // Exclude transfers from income totals (they're just moving money between accounts)
          if (!isTransfer) {
            months[monthIndex].totalIncome += amount;
            totalYearIncome += amount;
          }

          // Track income categories (exclude transfers from category totals, but keep them visible)
          if (!categoryTotals[category]) {
            categoryTotals[category] = { total: 0, count: 0, isExpense: false };
          }
          // For income, track it separately; for transfers, only store transactions, don't add to totals
          if (category === 'Income' || isTransfer) {
            // Only add to category totals if it's not a transfer
            if (!isTransfer) {
              categoryTotals[category].total += amount;
              categoryTotals[category].count++;
            }
            categoryTotals[category].isExpense = false;
            
            // Store Income/Transfer transactions for drill-down view (including transfers)
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
            
            // Monthly breakdown for Income/Transfer category (exclude transfers from totals)
            if (!categoryMonthlyData[category]) {
              categoryMonthlyData[category] = Array(12).fill(null).map(() => ({ total: 0, count: 0 }));
            }
            // Only add to monthly breakdown if it's not a transfer
            if (!isTransfer) {
              categoryMonthlyData[category][monthIndex].total += amount;
              categoryMonthlyData[category][monthIndex].count++;
            }
          }
        }
      }
    });

    // Calculate category statistics
    // Include expenses, Income category, and Transfer category (transfers shown but excluded from totals)
    const categoryStats = Object.entries(categoryTotals)
      .filter(([cat, data]) => data.isExpense !== false || cat === 'Income' || cat === 'Transfer')
      .map(([category, data]) => {
        const monthlyAmounts = categoryMonthlyData[category] 
          ? categoryMonthlyData[category].map(m => m.total)
          : Array(12).fill(0);
        
        const nonZeroMonths = monthlyAmounts.filter(a => a > 0);
        // Calculate average per month: total / 12 months (not just average of non-zero months)
        // This matches the spending forecast calculation and gives true monthly average
        // If user spent $4,000 last year, that's $4,000/12 = $333.33/month, not $4,000/8 if only 8 months had spending
        const totalSpending = monthlyAmounts.reduce((a, b) => a + b, 0);
        const avgPerMonth = totalSpending / 12;
        
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

    // Debug: Log totals
    const periodLabel = isLast12Months ? 'Last 12 Months' : year.toString();
    console.log(`\n📊 DEBUG: Spending Analysis Totals for ${periodLabel}:`);
    console.log(`  Total transactions processed: ${periodTransactions.length}`);
    console.log(`  Classified as expenses: ${expenseCount}`);
    console.log(`  Classified as income: ${incomeCount}`);
    console.log(`  Not classified (neither): ${neitherCount}`);
    console.log(`  Total expenses: $${totalYearExpenses.toFixed(2)}`);
    console.log(`  Total income: $${totalYearIncome.toFixed(2)}`);
    console.log(`  Net change: $${(totalYearIncome - totalYearExpenses).toFixed(2)}`);
    
    // Calculate averages
    const monthsWithData = monthlySummary.filter(m => m.transactionCount > 0).length;
    const avgMonthlyExpenses = monthsWithData > 0 ? totalYearExpenses / monthsWithData : 0;
    const avgMonthlyIncome = monthsWithData > 0 ? totalYearIncome / monthsWithData : 0;

    // Get available years from all transactions
    // Extract years from transaction dates, handling both Date objects and date strings
    const transactionYears = allTransactions.map(t => {
      if (!t.date) return null;
      const txDate = new Date(t.date);
      if (isNaN(txDate.getTime())) {
        console.warn(`⚠️ Invalid date for transaction ${t.transaction_id}: ${t.date}`);
        return null;
      }
      return txDate.getFullYear();
    }).filter(y => y !== null);
    
    const availableYears = [...new Set(transactionYears)].sort((a, b) => b - a);
    
    // Debug: Log available years
    console.log(`\n📅 Available years from transactions:`, availableYears);
    console.log(`   Total transactions: ${allTransactions.length}`);
    console.log(`   Years found: ${availableYears.length}`);
    
    // Show sample dates to verify
    if (allTransactions.length > 0) {
      const sampleDates = allTransactions.slice(0, 10).map(t => ({
        id: t.transaction_id,
        date: t.date,
        year: new Date(t.date).getFullYear(),
        name: t.name?.substring(0, 30)
      }));
      console.log(`   Sample transaction dates:`, sampleDates);
    }
    
    // Ensure we always include current year and next year in the list (even if no data yet)
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const yearsToInclude = new Set(['last12months', ...availableYears]);
    // Always include current year and next year if we're in 2025 or later
    if (currentYear >= 2025) yearsToInclude.add(currentYear);
    if (currentYear >= 2025) yearsToInclude.add(nextYear);
    
    const finalAvailableYears = ['last12months', ...Array.from(yearsToInclude).filter(y => y !== 'last12months').sort((a, b) => {
      if (typeof a === 'string') return -1;
      if (typeof b === 'string') return 1;
      return b - a;
    })];
    
    console.log(`   Final available years for dropdown:`, finalAvailableYears);

    return NextResponse.json({
      success: true,
      year: isLast12Months ? 'last12months' : year,
      periodLabel: isLast12Months ? 'Last 12 Months' : year.toString(),
      isLast12Months,
      summary: {
        totalExpenses: Math.round(totalYearExpenses * 100) / 100,
        totalIncome: Math.round(totalYearIncome * 100) / 100,
        netChange: Math.round((totalYearIncome - totalYearExpenses) * 100) / 100,
        avgMonthlyExpenses: Math.round(avgMonthlyExpenses * 100) / 100,
        avgMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
        totalTransactions: periodTransactions.length,
        categorizedTransactions: periodTransactions.filter(t => t.userCategory).length,
        uncategorizedTransactions: uncategorizedCount,
        uncategorizedTotal: Math.round(uncategorizedTotal * 100) / 100,
        allUncategorizedTransactions: allUncategorizedCount,
        allUncategorizedTotal: Math.round(allUncategorizedTotal * 100) / 100,
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
      availableYears: finalAvailableYears,
      // Suggest the year with the most transactions
      suggestedYear: (() => {
        const yearCounts = {};
        allTransactions.forEach(t => {
          const txYear = new Date(t.date).getFullYear();
          yearCounts[txYear] = (yearCounts[txYear] || 0) + 1;
        });
        return Object.entries(yearCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || (year || new Date().getFullYear());
      })(),
    });
  } catch (error) {
    console.error('Error generating spending analysis:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

