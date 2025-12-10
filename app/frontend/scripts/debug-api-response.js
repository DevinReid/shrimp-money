#!/usr/bin/env node
/**
 * Debug what the API is actually returning
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Simulating API response for 2025...\n');

  const year = 2025;
  const yearStart = new Date(year, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  yearEnd.setHours(23, 59, 59, 999);

  // Get all transactions
  const transactionData = await prisma.plaidTransactionData.findFirst();
  if (!transactionData || !transactionData.transactions) {
    console.log('❌ No transaction data');
    await prisma.$disconnect();
    return;
  }

  const allTransactions = Array.isArray(transactionData.transactions) 
    ? transactionData.transactions 
    : (transactionData.transactions.transactions || []);

  // Get categories
  const categories = await prisma.plaidTransactionCategory.findMany();
  const categoryMap = {};
  categories.forEach(c => {
    categoryMap[c.transactionId] = c.category;
  });

  // Filter for 2025
  const yearTransactions = allTransactions.filter(t => {
    if (!t.date) return false;
    const txDate = new Date(t.date);
    if (isNaN(txDate.getTime())) return false;
    return txDate >= yearStart && txDate <= yearEnd;
  });

  console.log(`📅 Transactions in ${year}: ${yearTransactions.length}`);
  console.log(`📁 Total categories: ${categories.length}\n`);

  // Process like the API does
  const categoryTotals = {};
  const categoryTransactions = {};

  yearTransactions.forEach(t => {
    const userCategory = categoryMap[t.transaction_id] || null;
    const isUserMarkedIncome = userCategory === 'Income';
    const isExpense = !isUserMarkedIncome && t.amount > 0;
    const amount = Math.abs(t.amount);

    if (isExpense) {
      const category = userCategory || 'NO_CATEGORY';
      
      if (!categoryTotals[category]) {
        categoryTotals[category] = { total: 0, count: 0 };
      }
      categoryTotals[category].total += amount;
      categoryTotals[category].count++;

      if (!categoryTransactions[category]) {
        categoryTransactions[category] = [];
      }
      categoryTransactions[category].push({
        id: t.transaction_id,
        name: t.name,
        amount: amount,
        date: t.date,
      });
    }
  });

  console.log('📊 Category totals (expenses only):');
  Object.entries(categoryTotals)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([cat, data]) => {
      console.log(`   ${cat}: $${data.total.toFixed(2)} (${data.count} transactions)`);
    });

  console.log(`\n💰 Bill category specifically:`);
  if (categoryTotals['Bill']) {
    console.log(`   Total: $${categoryTotals['Bill'].total.toFixed(2)}`);
    console.log(`   Count: ${categoryTotals['Bill'].count} transactions`);
    console.log(`   Transaction IDs: ${categoryTransactions['Bill'].slice(0, 5).map(t => t.id).join(', ')}...`);
  } else {
    console.log('   ❌ No Bill transactions found!');
  }

  // Check for mismatches
  const billCategories = categories.filter(c => c.category === 'Bill');
  console.log(`\n🔍 Category table has ${billCategories.length} Bill categories`);
  
  const billCategoryIds = new Set(billCategories.map(c => c.transactionId));
  const billTransactionIds = new Set(
    categoryTransactions['Bill']?.map(t => t.id) || []
  );

  const missingInTransactions = billCategories.filter(
    c => !yearTransactions.find(t => t.transaction_id === c.transactionId)
  );

  console.log(`\n⚠️  Bill categories not found in 2025 transactions: ${missingInTransactions.length}`);
  if (missingInTransactions.length > 0) {
    console.log('   First 5 missing transaction IDs:');
    missingInTransactions.slice(0, 5).forEach(c => {
      console.log(`   - ${c.transactionId}`);
    });
    
    // Check if they exist in other years
    const missingTxn = allTransactions.find(t => 
      t.transaction_id === missingInTransactions[0].transactionId
    );
    if (missingTxn) {
      console.log(`\n   Found one in database with date: ${missingTxn.date}`);
      const txDate = new Date(missingTxn.date);
      console.log(`   Year: ${txDate.getFullYear()}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);

