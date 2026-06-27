#!/usr/bin/env node
/**
 * Sync all categories from PlaidTransactionCategory to PlaidTransaction.userCategory
 * This ensures the normalized table has all categories
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Syncing categories from PlaidTransactionCategory to PlaidTransaction table...\n');

  try {
    // Get all categories
    const allCategories = await prisma.plaidTransactionCategory.findMany();
    console.log(`📊 Found ${allCategories.length} categories in PlaidTransactionCategory table`);

    // Batch update by grouping categories
    // Process in batches of 100 for better performance
    const batchSize = 100;
    let synced = 0;
    let notFound = 0;
    let errors = 0;

    for (let i = 0; i < allCategories.length; i += batchSize) {
      const batch = allCategories.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} categories)...`);
      
      // Update each category in the batch
      const updatePromises = batch.map(async (cat) => {
        try {
          const result = await prisma.plaidTransaction.updateMany({
            where: { transactionId: cat.transactionId },
            data: { userCategory: cat.category },
          });

          if (result.count > 0) {
            synced++;
            return { success: true };
          } else {
            notFound++;
            return { success: false, reason: 'not_found' };
          }
        } catch (error) {
          errors++;
          return { success: false, error: error.message };
        }
      });

      await Promise.all(updatePromises);
    }

    console.log(`\n📊 Sync Summary:`);
    console.log(`   ✅ Synced: ${synced} categories`);
    console.log(`   ⏭️  Transactions not in normalized table: ${notFound}`);
    console.log(`   ❌ Errors: ${errors}`);

    // Verify
    const totalWithCategories = await prisma.plaidTransaction.count({
      where: { userCategory: { not: null } },
    });
    console.log(`\n✅ Total transactions with categories in normalized table: ${totalWithCategories}`);

  } catch (error) {
    console.error('❌ Error syncing categories:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
