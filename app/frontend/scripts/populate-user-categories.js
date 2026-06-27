#!/usr/bin/env node
/**
 * Match categories from PlaidTransactionCategory to PlaidTransaction
 * This preserves all your hard work categorizing transactions!
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔗 Matching categories to transactions...\n');

  // Get all categories
  const categories = await prisma.plaidTransactionCategory.findMany();
  console.log(`📁 Found ${categories.length} category assignments`);

  // Build category map
  const categoryMap = {};
  categories.forEach(c => {
    categoryMap[c.transactionId] = c.category;
  });

  // Get all transactions
  const transactions = await prisma.plaidTransaction.findMany({
    select: { id: true, transactionId: true, userCategory: true },
  });
  console.log(`💳 Found ${transactions.length} transactions in normalized table\n`);

  let matched = 0;
  let updated = 0;
  let alreadySet = 0;
  let notFound = 0;

  // Match and update
  for (const txn of transactions) {
    const category = categoryMap[txn.transactionId];
    
    if (category) {
      matched++;
      
      // Only update if it's different or null
      if (txn.userCategory !== category) {
        await prisma.plaidTransaction.update({
          where: { id: txn.id },
          data: { userCategory: category },
        });
        updated++;
      } else {
        alreadySet++;
      }
    } else {
      notFound++;
    }
  }

  console.log('📊 Matching Results:');
  console.log(`   ✅ Matched categories: ${matched}`);
  console.log(`   🔄 Updated transactions: ${updated}`);
  console.log(`   ✓ Already set correctly: ${alreadySet}`);
  console.log(`   ❌ No category found: ${notFound}`);

  // Check for categories that don't match any transaction
  const transactionIds = new Set(transactions.map(t => t.transactionId));
  const orphanedCategories = categories.filter(c => !transactionIds.has(c.transactionId));
  
  console.log(`\n⚠️  Categories without matching transactions: ${orphanedCategories.length}`);
  if (orphanedCategories.length > 0) {
    console.log(`   (These are likely leftover from CSV cleanup)`);
    console.log(`   Sample IDs: ${orphanedCategories.slice(0, 3).map(c => c.transactionId).join(', ')}`);
  }

  // Verify the results
  const transactionsWithCategories = await prisma.plaidTransaction.count({
    where: { userCategory: { not: null } },
  });
  
  console.log(`\n✅ Final count: ${transactionsWithCategories} transactions now have user categories`);
  console.log(`   Coverage: ${((transactionsWithCategories / transactions.length) * 100).toFixed(1)}%`);

  await prisma.$disconnect();
  console.log('\n🎉 Category matching complete!');
}

main().catch(console.error);

