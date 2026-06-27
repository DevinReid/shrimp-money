#!/usr/bin/env node
/**
 * Quick verification that categories are properly matched
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('✅ Verifying category matching...\n');

  // Count transactions with categories
  const withCategories = await prisma.plaidTransaction.count({
    where: { userCategory: { not: null } },
  });

  const total = await prisma.plaidTransaction.count();
  
  console.log(`📊 Category Coverage:`);
  console.log(`   Total transactions: ${total}`);
  console.log(`   With user categories: ${withCategories}`);
  console.log(`   Coverage: ${((withCategories / total) * 100).toFixed(1)}%\n`);

  // Show sample categorized transactions
  const samples = await prisma.plaidTransaction.findMany({
    where: { userCategory: { not: null } },
    take: 10,
    orderBy: { date: 'desc' },
    select: {
      name: true,
      amount: true,
      date: true,
      userCategory: true,
    },
  });

  console.log('📋 Sample categorized transactions:');
  samples.forEach(t => {
    console.log(`   ${t.date.toISOString().split('T')[0]} - ${t.name} - $${Math.abs(t.amount).toFixed(2)} [${t.userCategory}]`);
  });

  // Count by category
  const byCategory = await prisma.plaidTransaction.groupBy({
    by: ['userCategory'],
    where: { userCategory: { not: null } },
    _count: true,
  });

  console.log(`\n📊 Transactions by category:`);
  byCategory
    .sort((a, b) => b._count - a._count)
    .slice(0, 10)
    .forEach(cat => {
      console.log(`   ${cat.userCategory}: ${cat._count} transactions`);
    });

  await prisma.$disconnect();
  console.log('\n✅ Verification complete!');
}

main().catch(console.error);

