/**
 * Test script to check what spending-analysis API returns
 * Run: node app/frontend/scripts/test-spending-analysis.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAnalysis() {
  try {
    console.log('🔍 Testing Spending Analysis Logic...\n');

    // Get all transactions
    const allTransactions = await prisma.plaidTransaction.findMany({
      orderBy: { date: 'desc' },
    });

    console.log(`📊 Total transactions: ${allTransactions.length}\n`);

    // Test year 2025
    const year = 2025;
    const yearStart = new Date(year, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    yearEnd.setHours(23, 59, 59, 999);

    console.log(`📅 Filtering for year ${year}:`);
    console.log(`   Start: ${yearStart.toISOString()}`);
    console.log(`   End: ${yearEnd.toISOString()}\n`);

    // Filter transactions for 2025
    const yearTransactions = allTransactions
      .filter(t => {
        if (!t.date) return false;
        const txDate = new Date(t.date);
        if (isNaN(txDate.getTime())) {
          console.warn(`⚠️  Invalid date for transaction ${t.transactionId}: ${t.date}`);
          return false;
        }
        return txDate >= yearStart && txDate <= yearEnd;
      })
      .map(t => {
        const userCategory = t.userCategory || null;
        const isUserMarkedIncome = userCategory === 'Income';
        
        return {
          transactionId: t.transactionId,
          date: t.date,
          amount: t.amount,
          userCategory,
          isExpense: !isUserMarkedIncome && t.amount > 0,
          isIncome: isUserMarkedIncome || t.amount < 0,
          normalizedAmount: Math.abs(t.amount),
        };
      });

    console.log(`✅ Transactions for ${year}: ${yearTransactions.length}\n`);

    // Check Bill category specifically
    const billTransactions = yearTransactions.filter(t => 
      t.userCategory === 'Bill' && t.isExpense
    );

    console.log(`💰 Bill transactions for ${year}:`);
    console.log(`   Count: ${billTransactions.length}`);
    console.log(`   Total: $${billTransactions.reduce((sum, t) => sum + t.normalizedAmount, 0).toFixed(2)}`);
    
    // Show monthly breakdown
    const billByMonth = {};
    billTransactions.forEach(t => {
      const month = t.date.getMonth();
      if (!billByMonth[month]) {
        billByMonth[month] = { count: 0, total: 0 };
      }
      billByMonth[month].count++;
      billByMonth[month].total += t.normalizedAmount;
    });

    console.log(`\n📅 Bill transactions by month:`);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    Object.keys(billByMonth).sort((a, b) => a - b).forEach(month => {
      const data = billByMonth[month];
      console.log(`   ${monthNames[month]}: ${data.count} transactions, $${data.total.toFixed(2)}`);
    });

    // Check date parsing issues
    console.log(`\n🔍 Checking for date parsing issues...`);
    const dateIssues = [];
    allTransactions.forEach(t => {
      if (!t.date) {
        dateIssues.push({ id: t.transactionId, issue: 'No date' });
      } else {
        const txDate = new Date(t.date);
        if (isNaN(txDate.getTime())) {
          dateIssues.push({ id: t.transactionId, issue: `Invalid date: ${t.date}` });
        } else {
          const year = txDate.getFullYear();
          if (year < 2020 || year > 2030) {
            dateIssues.push({ id: t.transactionId, issue: `Suspicious year: ${year}` });
          }
        }
      }
    });

    if (dateIssues.length > 0) {
      console.log(`   Found ${dateIssues.length} date issues:`);
      dateIssues.slice(0, 10).forEach(issue => {
        console.log(`   - ${issue.id}: ${issue.issue}`);
      });
    } else {
      console.log(`   ✅ No date parsing issues found`);
    }

    // Check all categories
    console.log(`\n📊 All categories for ${year}:`);
    const categoryTotals = {};
    yearTransactions.forEach(t => {
      if (t.isExpense) {
        const cat = t.userCategory || 'Uncategorized';
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = { count: 0, total: 0 };
        }
        categoryTotals[cat].count++;
        categoryTotals[cat].total += t.normalizedAmount;
      }
    });

    Object.entries(categoryTotals)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([cat, data]) => {
        console.log(`   ${cat}: ${data.count} transactions, $${data.total.toFixed(2)}`);
      });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAnalysis();

