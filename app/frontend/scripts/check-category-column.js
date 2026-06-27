#!/usr/bin/env node
/**
 * Check what's actually in the category column
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking category column data...\n');

  // Get a sample of transactions
  const transactions = await prisma.plaidTransaction.findMany({
    take: 20,
    select: {
      transactionId: true,
      name: true,
      category: true,
      userCategory: true,
    },
  });

  console.log(`📊 Sample of ${transactions.length} transactions:\n`);

  let nullCount = 0;
  let nonNullCount = 0;
  let jsonCount = 0;
  let arrayCount = 0;

  transactions.forEach((t, i) => {
    const hasCategory = t.category !== null && t.category !== undefined;
    const categoryType = hasCategory ? typeof t.category : 'null';
    const isArray = Array.isArray(t.category);
    const isObject = !isArray && typeof t.category === 'object' && t.category !== null;

    if (!hasCategory) {
      nullCount++;
    } else {
      nonNullCount++;
      if (isArray) arrayCount++;
      if (isObject) jsonCount++;
    }

    console.log(`${i + 1}. ${t.name.substring(0, 40)}`);
    console.log(`   category: ${hasCategory ? JSON.stringify(t.category).substring(0, 100) : 'null'}`);
    console.log(`   userCategory: ${t.userCategory || 'null'}`);
    console.log(`   type: ${categoryType}, isArray: ${isArray}, isObject: ${isObject}`);
    console.log();
  });

  // Get full counts - need to check all transactions manually for JSON fields
  const total = await prisma.plaidTransaction.count();
  
  // Get all transactions to check category field
  const allTransactions = await prisma.plaidTransaction.findMany({
    select: { category: true },
  });

  let withCategory = 0;
  let withoutCategory = 0;
  let emptyArray = 0;
  let emptyObject = 0;
  let hasData = 0;

  allTransactions.forEach(t => {
    if (t.category === null || t.category === undefined) {
      withoutCategory++;
    } else {
      withCategory++;
      if (Array.isArray(t.category)) {
        if (t.category.length === 0) {
          emptyArray++;
        } else {
          hasData++;
        }
      } else if (typeof t.category === 'object') {
        if (Object.keys(t.category).length === 0) {
          emptyObject++;
        } else {
          hasData++;
        }
      }
    }
  });

  console.log(`\n📊 Full Statistics (all ${total} transactions):`);
  console.log(`   Total transactions: ${total}`);
  console.log(`   With category (not null): ${withCategory}`);
  console.log(`   Without category (null): ${withoutCategory}`);
  console.log(`   Empty arrays []: ${emptyArray}`);
  console.log(`   Empty objects {}: ${emptyObject}`);
  console.log(`   Has actual data: ${hasData}`);
  console.log(`\n   In sample (20 transactions):`);
  console.log(`   - Null: ${nullCount}`);
  console.log(`   - Non-null: ${nonNullCount}`);
  console.log(`   - Arrays: ${arrayCount}`);
  console.log(`   - Objects: ${jsonCount}`);

  // Check if category is actually being used
  const sampleWithCategory = await prisma.plaidTransaction.findFirst({
    where: { category: { not: null } },
    select: { category: true, name: true },
  });

  if (sampleWithCategory) {
    console.log(`\n📋 Example of non-null category:`);
    console.log(`   Transaction: ${sampleWithCategory.name}`);
    console.log(`   Category: ${JSON.stringify(sampleWithCategory.category, null, 2)}`);
  } else {
    console.log(`\n✅ No non-null categories found - safe to remove!`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

