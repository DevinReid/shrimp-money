#!/usr/bin/env node
/**
 * Verify the normalized transaction table is working correctly
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('✅ Verifying normalized transaction table...\n');

  // Count transactions
  const totalCount = await prisma.plaidTransaction.count();
  console.log(`📊 Total transactions in normalized table: ${totalCount}`);

  // Count by itemId
  const byItem = await prisma.plaidTransaction.groupBy({
    by: ['itemId'],
    _count: true,
  });
  console.log(`\n📦 Transactions by itemId:`);
  byItem.forEach(item => {
    console.log(`   ${item.itemId}: ${item._count} transactions`);
  });

  // Count by year
  const transactions = await prisma.plaidTransaction.findMany({
    select: { date: true },
  });
  const byYear = {};
  transactions.forEach(t => {
    const year = t.date.getFullYear();
    byYear[year] = (byYear[year] || 0) + 1;
  });
  console.log(`\n📅 Transactions by year:`);
  Object.entries(byYear).sort().forEach(([year, count]) => {
    console.log(`   ${year}: ${count} transactions`);
  });

  // Check for categories
  const categories = await prisma.plaidTransactionCategory.findMany();
  const categoryMap = {};
  categories.forEach(c => {
    categoryMap[c.transactionId] = c.category;
  });

  const transactionsWithCategories = transactions.filter(t => {
    // We need to check by transactionId, but we only have date here
    // Let's get a sample
    return false;
  });

  const sampleTransactions = await prisma.plaidTransaction.findMany({
    take: 5,
    orderBy: { date: 'desc' },
  });

  console.log(`\n🔍 Sample transactions (most recent 5):`);
  sampleTransactions.forEach(t => {
    const category = categoryMap[t.transactionId] || 'Uncategorized';
    console.log(`   ${t.date.toISOString().split('T')[0]} - ${t.name} - $${Math.abs(t.amount).toFixed(2)} [${category}]`);
  });

  // Check category matching - get all transaction IDs properly
  const allTransactions = await prisma.plaidTransaction.findMany({
    select: { transactionId: true },
  });
  const transactionIds = new Set(allTransactions.map(t => t.transactionId));
  const matchingCategories = categories.filter(c => transactionIds.has(c.transactionId));
  const orphanedCategories = categories.filter(c => !transactionIds.has(c.transactionId));

  console.log(`\n🔗 Category Matching:`);
  console.log(`   Total categories: ${categories.length}`);
  console.log(`   Categories matching transactions: ${matchingCategories.length}`);
  console.log(`   Orphaned categories: ${orphanedCategories.length}`);

  if (orphanedCategories.length > 0) {
    console.log(`\n   ⚠️  Sample orphaned category IDs:`);
    orphanedCategories.slice(0, 5).forEach(c => {
      console.log(`      - ${c.transactionId}`);
    });
  }

  await prisma.$disconnect();
  console.log(`\n✅ Verification complete!`);
}

main().catch(console.error);

