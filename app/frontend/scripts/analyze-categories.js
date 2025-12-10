#!/usr/bin/env node
/**
 * Quick script to analyze categories and spending in the database
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Analyzing categories and spending...\n');

  // Get all categories
  const categories = await prisma.plaidTransactionCategory.findMany();
  console.log(`📁 Total categorized transactions: ${categories.length}`);
  
  // Count by category
  const categoryCounts = {};
  categories.forEach(c => {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  });
  
  console.log('\n📊 Categories found:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} transactions`);
    });

  // Get transaction data
  const transactionData = await prisma.plaidTransactionData.findFirst();
  
  if (transactionData && transactionData.transactions) {
    const transactions = Array.isArray(transactionData.transactions) 
      ? transactionData.transactions 
      : (transactionData.transactions.transactions || []);
    
    console.log(`\n💳 Total transactions in database: ${transactions.length}`);
    
    // Build category map
    const categoryMap = {};
    categories.forEach(c => {
      categoryMap[c.transactionId] = c.category;
    });

    // Analyze by category with amounts
    const categoryTotals = {};
    let totalExpenses = 0;
    let totalIncome = 0;
    let uncategorizedExpenses = 0;
    let uncategorizedCount = 0;

    transactions.forEach(t => {
      const amount = Math.abs(t.amount);
      const isExpense = t.amount > 0; // Plaid: positive = expense
      const category = categoryMap[t.transaction_id] || 'NO_CATEGORY';
      
      if (isExpense) {
        totalExpenses += amount;
        if (!categoryTotals[category]) {
          categoryTotals[category] = { total: 0, count: 0, type: 'expense' };
        }
        categoryTotals[category].total += amount;
        categoryTotals[category].count++;
        
        if (category === 'NO_CATEGORY') {
          uncategorizedExpenses += amount;
          uncategorizedCount++;
        }
      } else {
        totalIncome += amount;
      }
    });

    console.log(`\n💰 Financial Summary:`);
    console.log(`   Total Expenses (amount > 0): $${totalExpenses.toFixed(2)}`);
    console.log(`   Total Income (amount < 0): $${totalIncome.toFixed(2)}`);
    console.log(`   Uncategorized Expenses: $${uncategorizedExpenses.toFixed(2)} (${uncategorizedCount} transactions)`);

    console.log(`\n📊 Expense Totals by Category:`);
    Object.entries(categoryTotals)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([cat, data]) => {
        const percent = ((data.total / totalExpenses) * 100).toFixed(1);
        console.log(`   ${cat}: $${data.total.toFixed(2)} (${percent}%) - ${data.count} txns`);
      });

    // Check for any large single transactions
    console.log(`\n🔎 Top 10 largest expense transactions:`);
    const expenseTransactions = transactions
      .filter(t => t.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    
    expenseTransactions.forEach((t, i) => {
      const cat = categoryMap[t.transaction_id] || 'NO_CATEGORY';
      console.log(`   ${i+1}. $${t.amount.toFixed(2)} - ${t.name} [${cat}] (${t.date})`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);

