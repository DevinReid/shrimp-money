/**
 * Migration script to move Plaid items from local files to database
 * Run this from the app/frontend directory: node scripts/migrate-items-to-db.js
 */

const path = require('path');
const fs = require('fs-extra');
const prisma = require('../lib/prisma');
const { encrypt, decrypt, decryptObject } = require('../lib/encryption');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'lib', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

async function migrateItemsToDatabase() {
  if (!prisma) {
    console.error('❌ Database not available. Make sure DATABASE_URL is set.');
    process.exit(1);
  }

  console.log('🔄 Starting migration of Plaid items from files to database...\n');

  // Read items from file
  let fileItems = [];
  try {
    if (fs.existsSync(ITEMS_FILE)) {
      const data = fs.readJsonSync(ITEMS_FILE);
      if (data.items && Array.isArray(data.items)) {
        // Decrypt items from file
        fileItems = data.items.map(item => 
          decryptObject(item, ['access_token'])
        );
        console.log(`📁 Found ${fileItems.length} item(s) in ${ITEMS_FILE}`);
      }
    } else {
      console.log(`ℹ️  No items file found at ${ITEMS_FILE}`);
    }
  } catch (error) {
    console.error('❌ Error reading items file:', error.message);
    process.exit(1);
  }

  if (fileItems.length === 0) {
    console.log('✅ No items to migrate. Database is up to date.');
    process.exit(0);
  }

  // Check what's already in database
  const dbItems = await prisma.plaidItem.findMany();
  console.log(`📊 Found ${dbItems.length} item(s) already in database\n`);

  // Migrate each item
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of fileItems) {
    try {
      const encryptedToken = encrypt(item.access_token);
      const environment = item.environment || process.env.PLAID_ENV || 'sandbox';

      // Check if item already exists
      const existing = await prisma.plaidItem.findUnique({
        where: { itemId: item.item_id },
      });

      if (existing) {
        console.log(`⏭️  Item ${item.item_id} already exists in database, skipping...`);
        skipped++;
        continue;
      }

      // Create new item in database
      await prisma.plaidItem.create({
        data: {
          itemId: item.item_id,
          accessToken: encryptedToken,
          environment: environment,
        },
      });

      console.log(`✅ Migrated item ${item.item_id} to database`);
      migrated++;
    } catch (error) {
      console.error(`❌ Error migrating item ${item.item_id}:`, error.message);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('='.repeat(60));

  if (migrated > 0) {
    console.log('\n✅ Migration complete! Items are now stored in the database.');
    console.log('   You can continue using the app - items will be read from the database.');
  }

  await prisma.$disconnect();
}

// Run migration
migrateItemsToDatabase()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });




