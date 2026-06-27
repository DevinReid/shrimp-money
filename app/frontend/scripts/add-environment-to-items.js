/**
 * Add environment field to items that don't have it
 * Run with: node scripts/add-environment-to-items.js
 */

require('dotenv').config({ path: '.env' });
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'lib', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

async function addEnvironmentToItems() {
  try {
    console.log('🔧 Adding environment tracking to items...\n');
    
    if (!fs.existsSync(ITEMS_FILE)) {
      console.log('📋 No items file found');
      return;
    }
    
    const itemsData = fs.readJsonSync(ITEMS_FILE);
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    
    console.log(`📋 Current environment: ${currentEnv}`);
    console.log(`📋 Total items: ${itemsData.items?.length || 0}\n`);
    
    if (!itemsData.items || itemsData.items.length === 0) {
      console.log('✅ No items to update');
      return;
    }
    
    let updated = 0;
    itemsData.items.forEach((item, index) => {
      if (!item.environment) {
        // Assume items created today or recently are for current environment
        // Older items are likely sandbox
        const itemDate = new Date(item.created_at);
        const daysOld = (Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
        
        // If item is from today and we're in production, assume production
        // Otherwise, assume sandbox for old items
        const assumedEnv = (daysOld < 1 && currentEnv === 'production') ? 'production' : 'sandbox';
        item.environment = assumedEnv;
        updated++;
        console.log(`   ${index + 1}. Item ${item.item_id}: Added environment "${assumedEnv}"`);
      } else {
        console.log(`   ${index + 1}. Item ${item.item_id}: Already has environment "${item.environment}"`);
      }
    });
    
    if (updated > 0) {
      fs.writeJsonSync(ITEMS_FILE, itemsData, { spaces: 2 });
      console.log(`\n✅ Updated ${updated} item(s) with environment tracking`);
    } else {
      console.log('\n✅ All items already have environment tracking');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addEnvironmentToItems();

