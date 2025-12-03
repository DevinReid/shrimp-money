/**
 * Clear old sandbox items from items.json
 * Run with: node scripts/clear-sandbox-items.js
 */

require('dotenv').config({ path: '.env' });
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'lib', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

async function clearSandboxItems() {
  try {
    console.log('🧹 Clearing old sandbox items...\n');
    
    if (!fs.existsSync(ITEMS_FILE)) {
      console.log('📋 No items file found');
      return;
    }
    
    const itemsData = fs.readJsonSync(ITEMS_FILE);
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    
    console.log(`📋 Current environment: ${currentEnv}`);
    console.log(`📋 Total items: ${itemsData.items?.length || 0}\n`);
    
    if (!itemsData.items || itemsData.items.length === 0) {
      console.log('✅ No items to clear');
      return;
    }
    
    // Show current items
    itemsData.items.forEach((item, index) => {
      console.log(`   ${index + 1}. Item ID: ${item.item_id}`);
      console.log(`      Environment: ${item.environment || 'unknown (old format)'}`);
      console.log(`      Created: ${item.created_at}\n`);
    });
    
    // Filter out items that don't match current environment
    const originalCount = itemsData.items.length;
    itemsData.items = itemsData.items.filter(
      item => !item.environment || item.environment === currentEnv
    );
    
    const removedCount = originalCount - itemsData.items.length;
    
    if (removedCount > 0) {
      fs.writeJsonSync(ITEMS_FILE, itemsData, { spaces: 2 });
      console.log(`✅ Removed ${removedCount} item(s) from different environment`);
      console.log(`📋 Remaining items: ${itemsData.items.length}`);
    } else {
      console.log('✅ All items match current environment');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

clearSandboxItems();

