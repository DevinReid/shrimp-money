#!/usr/bin/env node
/**
 * Download the transaction JSON blob to a file
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  console.log('📥 Downloading transaction blob...\n');

  // Get all transaction data records
  const transactionDataRecords = await prisma.plaidTransactionData.findMany();
  
  if (transactionDataRecords.length === 0) {
    console.log('❌ No transaction data found');
    await prisma.$disconnect();
    return;
  }

  for (const record of transactionDataRecords) {
    console.log(`📦 Processing itemId: ${record.itemId}`);
    console.log(`   Total transactions: ${record.totalTransactions}`);
    console.log(`   Date range: ${record.startDate.toISOString().split('T')[0]} to ${record.endDate.toISOString().split('T')[0]}`);
    
    // Extract transactions
    let transactions = [];
    if (record.transactions) {
      if (Array.isArray(record.transactions)) {
        transactions = record.transactions;
      } else if (record.transactions.transactions && Array.isArray(record.transactions.transactions)) {
        transactions = record.transactions.transactions;
      }
    }

    console.log(`   Transactions in blob: ${transactions.length}`);

    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, '..', 'exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save to file
    const filename = `transactions_${record.itemId}_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(outputDir, filename);
    
    const output = {
      itemId: record.itemId,
      totalTransactions: record.totalTransactions,
      startDate: record.startDate.toISOString(),
      endDate: record.endDate.toISOString(),
      lastFetched: record.lastFetched.toISOString(),
      transactionCount: transactions.length,
      transactions: transactions,
    };

    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
    console.log(`   ✅ Saved to: ${filepath}`);
    console.log(`   📊 File size: ${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB\n`);
  }

  await prisma.$disconnect();
  console.log('✅ Download complete!');
}

main().catch(console.error);

