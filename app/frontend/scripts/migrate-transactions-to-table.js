#!/usr/bin/env node
/**
 * Migrate transactions from JSON blob to normalized PlaidTransaction table
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrating transactions from JSON blob to normalized table...\n');

  // Get all transaction data records
  const transactionDataRecords = await prisma.plaidTransactionData.findMany();
  
  if (transactionDataRecords.length === 0) {
    console.log('❌ No transaction data found');
    await prisma.$disconnect();
    return;
  }

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const record of transactionDataRecords) {
    console.log(`📦 Processing itemId: ${record.itemId}`);
    
    // Extract transactions from JSON
    let transactions = [];
    if (record.transactions) {
      if (Array.isArray(record.transactions)) {
        transactions = record.transactions;
      } else if (record.transactions.transactions && Array.isArray(record.transactions.transactions)) {
        transactions = record.transactions.transactions;
      }
    }

    console.log(`   Found ${transactions.length} transactions in JSON blob`);

    // Check how many already exist
    const existingCount = await prisma.plaidTransaction.count({
      where: { itemId: record.itemId }
    });
    console.log(`   Already in table: ${existingCount}`);

    // Process each transaction
    for (const txn of transactions) {
      try {
        // Check if transaction already exists
        const existing = await prisma.plaidTransaction.findUnique({
          where: { transactionId: txn.transaction_id }
        });

        if (existing) {
          totalSkipped++;
          continue;
        }

        // Extract data
        const transactionData = {
          transactionId: txn.transaction_id,
          itemId: record.itemId,
          accountId: txn.account_id || '',
          name: txn.name || '',
          merchantName: txn.merchant_name || null,
          amount: parseFloat(txn.amount) || 0,
          date: new Date(txn.date),
          category: txn.category ? JSON.parse(JSON.stringify(txn.category)) : null,
          isoCurrencyCode: txn.iso_currency_code || null,
          pending: txn.pending || false,
          transactionCode: txn.transaction_code || null,
          rawData: JSON.parse(JSON.stringify(txn)), // Store full original data
        };

        // Insert into normalized table
        await prisma.plaidTransaction.create({
          data: transactionData
        });

        totalMigrated++;
      } catch (error) {
        console.error(`   ❌ Error processing transaction ${txn.transaction_id}:`, error.message);
        totalErrors++;
      }
    }

    console.log(`   ✅ Migrated ${totalMigrated} new transactions`);
    if (totalSkipped > 0) {
      console.log(`   ⏭️  Skipped ${totalSkipped} duplicates`);
    }
    if (totalErrors > 0) {
      console.log(`   ⚠️  ${totalErrors} errors`);
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Total migrated: ${totalMigrated}`);
  console.log(`   Total skipped (duplicates): ${totalSkipped}`);
  console.log(`   Total errors: ${totalErrors}`);

  // Verify
  const totalInTable = await prisma.plaidTransaction.count();
  console.log(`\n✅ Total transactions in normalized table: ${totalInTable}`);

  await prisma.$disconnect();
}

main().catch(console.error);

