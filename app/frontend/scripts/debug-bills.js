#!/usr/bin/env node
/**
 * Debug script to find Bill transactions
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Debugging Bill transactions...\n');

  // Get all Bill categories
  const billCategories = await prisma.plaidTransactionCategory.findMany({
    where: { category: 'Bill' }
  });
  console.log(`📁 Total transactions categorized as "Bill": ${billCategories.length}\n`);

  // Get transaction data
  const transactionData = await prisma.plaidTransactionData.findFirst();
  
  if (!transactionData || !transactionData.transactions) {
    console.log('❌ No transaction data found');
    await prisma.$disconnect();
    return;
  }

  const transactions = Array.isArray(transactionData.transactions) 
    ? transactionData.transactions 
    : (transactionData.transactions.transactions || []);
  
  console.log(`💳 Total transactions in database: ${transactions.length}\n`);

  // Build category map
  const categoryMap = {};
  billCategories.forEach(c => {
    categoryMap[c.transactionId] = c.category;
  });

  // Find Bill transactions
  const billTransactions = transactions.filter(t => 
    categoryMap[t.transaction_id] === 'Bill'
  );

  console.log(`💰 Bill transactions found in transaction data: ${billTransactions.length}\n`);

  if (billTransactions.length === 0) {
    console.log('⚠️  PROBLEM: Categories say there are Bill transactions, but they\'re not in the transaction data!');
    console.log('\n🔍 Checking for transaction ID mismatches...\n');
    
    // Check first few category transaction IDs
    console.log('First 5 Bill category transaction IDs:');
    billCategories.slice(0, 5).forEach(c => {
      console.log(`   ${c.transactionId}`);
    });
    
    console.log('\nFirst 5 transaction IDs in database:');
    transactions.slice(0, 5).forEach(t => {
      console.log(`   ${t.transaction_id}`);
    });
    
    // Check if any match
    const sampleCategoryId = billCategories[0]?.transactionId;
    const matchingTransaction = transactions.find(t => t.transaction_id === sampleCategoryId);
    console.log(`\nDoes first category ID exist in transactions? ${matchingTransaction ? 'YES ✓' : 'NO ✗'}`);
  } else {
    console.log('✅ Bill transactions found! Here are the details:\n');
    
    // Group by date
    const byYear = {};
    billTransactions.forEach(t => {
      const year = new Date(t.date).getFullYear();
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(t);
    });
    
    Object.entries(byYear).sort().forEach(([year, txns]) => {
      const total = txns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      console.log(`📅 ${year}: ${txns.length} transactions, $${total.toFixed(2)} total`);
      
      // Show first few
      txns.slice(0, 3).forEach(t => {
        console.log(`   - $${Math.abs(t.amount).toFixed(2)} - ${t.name} (${t.date})`);
      });
      if (txns.length > 3) {
        console.log(`   ... and ${txns.length - 3} more`);
      }
      console.log();
    });
    
    // Show all Bill transactions
    console.log('\n📋 All Bill transactions:');
    billTransactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach((t, i) => {
        console.log(`${i+1}. $${Math.abs(t.amount).toFixed(2)} - ${t.name} (${t.date})`);
      });
  }

  await prisma.$disconnect();
}

main().catch(console.error);

