#!/usr/bin/env node
/**
 * Analyze the actual data structure to understand what we're working with
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Analyzing Data Structure...\n');

  // 1. Check PlaidTransactionCategory
  const categories = await prisma.plaidTransactionCategory.findMany();
  console.log(`📁 PlaidTransactionCategory: ${categories.length} records`);
  console.log(`   (These are category assignments, NOT transaction data)\n`);

  // 2. Check PlaidTransactionData
  const transactionDataRecords = await prisma.plaidTransactionData.findMany();
  console.log(`💾 PlaidTransactionData: ${transactionDataRecords.length} record(s)`);
  
  transactionDataRecords.forEach((record, idx) => {
    console.log(`\n   Record ${idx + 1}:`);
    console.log(`   - itemId: ${record.itemId}`);
    console.log(`   - totalTransactions: ${record.totalTransactions}`);
    console.log(`   - Date range: ${record.startDate.toISOString().split('T')[0]} to ${record.endDate.toISOString().split('T')[0]}`);
    console.log(`   - Last fetched: ${record.lastFetched.toISOString()}`);
    
    // Check the actual transactions array
    let transactions = [];
    if (record.transactions) {
      if (Array.isArray(record.transactions)) {
        transactions = record.transactions;
      } else if (record.transactions.transactions && Array.isArray(record.transactions.transactions)) {
        transactions = record.transactions.transactions;
      }
    }
    
    console.log(`   - Transactions in JSON: ${transactions.length}`);
    
    // Check transaction IDs
    const transactionIds = new Set(transactions.map(t => t.transaction_id));
    console.log(`   - Unique transaction IDs: ${transactionIds.size}`);
    
    // Check how many categories match these transactions
    const matchingCategories = categories.filter(c => 
      transactionIds.has(c.transactionId)
    );
    console.log(`   - Categories matching these transactions: ${matchingCategories.length}`);
    
    // Check for orphaned categories
    const orphanedCategories = categories.filter(c => 
      !transactionIds.has(c.transactionId)
    );
    console.log(`   - Orphaned categories (no matching transaction): ${orphanedCategories.length}`);
    
    if (orphanedCategories.length > 0) {
      console.log(`\n   ⚠️  Sample orphaned category transaction IDs:`);
      orphanedCategories.slice(0, 5).forEach(c => {
        console.log(`      - ${c.transactionId}`);
      });
    }
    
    // Check date distribution
    const dates = transactions.map(t => new Date(t.date).getFullYear());
    const byYear = {};
    dates.forEach(year => {
      byYear[year] = (byYear[year] || 0) + 1;
    });
    console.log(`\n   📅 Transactions by year:`);
    Object.entries(byYear).sort().forEach(([year, count]) => {
      console.log(`      ${year}: ${count} transactions`);
    });
  });

  // 3. Check if there are multiple itemIds
  const allItemIds = transactionDataRecords.map(r => r.itemId);
  const uniqueItemIds = [...new Set(allItemIds)];
  console.log(`\n🔑 Unique itemIds: ${uniqueItemIds.length}`);
  uniqueItemIds.forEach(id => {
    console.log(`   - ${id}`);
  });

  // 4. Summary
  console.log(`\n📊 Summary:`);
  console.log(`   Total categories: ${categories.length}`);
  console.log(`   Total transaction data records: ${transactionDataRecords.length}`);
  
  const totalTransactionsInData = transactionDataRecords.reduce((sum, record) => {
    let transactions = [];
    if (record.transactions) {
      if (Array.isArray(record.transactions)) {
        transactions = record.transactions;
      } else if (record.transactions.transactions) {
        transactions = record.transactions.transactions;
      }
    }
    return sum + transactions.length;
  }, 0);
  
  console.log(`   Total transactions in JSON blobs: ${totalTransactionsInData}`);
  console.log(`   Category coverage: ${((categories.length / totalTransactionsInData) * 100).toFixed(1)}%`);

  await prisma.$disconnect();
}

main().catch(console.error);

