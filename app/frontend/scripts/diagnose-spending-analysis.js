/**
 * Diagnostic script to check spending analysis data
 * Run: node app/frontend/scripts/diagnose-spending-analysis.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  try {
    console.log('🔍 Diagnosing Spending Analysis Data...\n');

    // Get all transactions
    const allTransactions = await prisma.plaidTransaction.findMany({
      orderBy: { date: 'asc' },
    });

    console.log(`📊 Total transactions in database: ${allTransactions.length}\n`);

    // Check date range
    if (allTransactions.length > 0) {
      const firstDate = allTransactions[0].date;
      const lastDate = allTransactions[allTransactions.length - 1].date;
      console.log(`📅 Date range: ${firstDate.toISOString().split('T')[0]} to ${lastDate.toISOString().split('T')[0]}\n`);

      // Group by year
      const byYear = {};
      allTransactions.forEach(t => {
        const year = t.date.getFullYear();
        if (!byYear[year]) {
          byYear[year] = { count: 0, total: 0, categorized: 0 };
        }
        byYear[year].count++;
        byYear[year].total += Math.abs(t.amount);
        if (t.userCategory) {
          byYear[year].categorized++;
        }
      });

      console.log('📈 Transactions by year:');
      Object.keys(byYear).sort().forEach(year => {
        const data = byYear[year];
        console.log(`  ${year}: ${data.count} transactions, ${data.categorized} categorized, $${data.total.toFixed(2)} total`);
      });
      console.log('');

      // Check by category
      const byCategory = {};
      allTransactions.forEach(t => {
        const cat = t.userCategory || 'Uncategorized';
        if (!byCategory[cat]) {
          byCategory[cat] = { count: 0, total: 0 };
        }
        byCategory[cat].count++;
        byCategory[cat].total += Math.abs(t.amount);
      });

      console.log('🏷️  Top 20 categories by transaction count:');
      Object.entries(byCategory)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .forEach(([cat, data]) => {
          console.log(`  ${cat}: ${data.count} transactions, $${data.total.toFixed(2)}`);
        });
      console.log('');

      // Check itemId distribution
      const byItemId = {};
      allTransactions.forEach(t => {
        if (!byItemId[t.itemId]) {
          byItemId[t.itemId] = 0;
        }
        byItemId[t.itemId]++;
      });

      console.log('🔑 Transactions by itemId:');
      Object.entries(byItemId).forEach(([itemId, count]) => {
        console.log(`  ${itemId}: ${count} transactions`);
      });
      console.log('');

      // Check for 2024 vs 2025
      const year2024 = allTransactions.filter(t => t.date.getFullYear() === 2024);
      const year2025 = allTransactions.filter(t => t.date.getFullYear() === 2025);
      console.log(`📅 2024: ${year2024.length} transactions`);
      console.log(`📅 2025: ${year2025.length} transactions`);
      console.log(`📅 Current year (${new Date().getFullYear()}): ${allTransactions.filter(t => t.date.getFullYear() === new Date().getFullYear()).length} transactions\n`);

    } else {
      console.log('❌ No transactions found in database!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();

