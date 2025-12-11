/**
 * Script to fetch Plaid data for cron jobs
 * 
 * This script can be run from a cron job to automatically fetch
 * account balances and transactions without user interaction.
 * 
 * Usage:
 *   node scripts/fetch-plaid-data.js
 * 
 * Environment variables required:
 *   - DATABASE_URL (for authentication)
 *   - PLAID_CLIENT_ID
 *   - PLAID_PRODUCTION_SECRET or PLAID_SANDBOX_SECRET
 *   - PLAID_ENV (production or sandbox)
 *   - ADMIN_USERNAME
 *   - ADMIN_PASSWORD_HASH
 */

require('dotenv').config({ path: '.env' });
const path = require('path');
const { client, readItems, saveAccountData, saveTransactionData } = require('../lib/plaid');

async function fetchPlaidData() {
  try {
    console.log('🔄 Starting automated Plaid data fetch...\n');

    // Check if we have a connected item
    const itemsData = readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';

    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) {
        return currentEnv === 'sandbox';
      }
      return item.environment === currentEnv;
    });

    if (matchingItems.length === 0) {
      console.error('❌ No Plaid connection found. Please connect an account first.');
      console.error('   Run the app and connect your bank account through the UI.');
      process.exit(1);
    }

    // Get the most recent item
    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    console.log(`✅ Found connected item: ${item.item_id}`);
    console.log(`📅 Connection created: ${item.created_at}\n`);

    // Fetch accounts
    console.log('📊 Fetching account balances...');
    const accountsResponse = await client.accountsGet({
      access_token: item.access_token,
    });

    if (accountsResponse.data.accounts) {
      saveAccountData(item.item_id, accountsResponse.data);
      console.log(`✅ Fetched ${accountsResponse.data.accounts.length} account(s)`);
      
      // Display balances
      accountsResponse.data.accounts.forEach(account => {
        console.log(`   ${account.name}: $${(account.balances.available || 0).toFixed(2)} available`);
      });
    }

    // Fetch transactions (last 30 days)
    console.log('\n📊 Fetching transactions...');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let allTransactions = [];
    let hasMore = true;
    let cursor = null;

    while (hasMore) {
      const request = {
        access_token: item.access_token,
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
      };

      if (cursor) {
        request.cursor = cursor;
      }

      const response = await client.transactionsGet(request);
      const data = response.data;

      allTransactions = allTransactions.concat(data.transactions || []);
      hasMore = data.has_more || false;
      cursor = data.next_cursor || null;

      if (allTransactions.length > 10000) {
        console.warn('⚠️ Reached 10,000 transaction limit');
        break;
      }
    }

    saveTransactionData(item.item_id, {
      ...accountsResponse.data,
      transactions: allTransactions,
      total_transactions: allTransactions.length,
    });

    console.log(`✅ Fetched ${allTransactions.length} transaction(s)`);
    console.log(`\n✅ Data fetch completed successfully!`);
    console.log(`   Accounts saved to: lib/data/accounts_${item.item_id}.json`);
    console.log(`   Transactions saved to: lib/data/transactions_${item.item_id}.json`);

  } catch (error) {
    console.error('❌ Error fetching Plaid data:', error.message);
    
    if (error.response?.data) {
      console.error('   Error code:', error.response.data.error_code);
      console.error('   Error message:', error.response.data.error_message);
      
      // Handle common errors
      if (error.response.data.error_code === 'ITEM_LOGIN_REQUIRED') {
        console.error('\n⚠️  The bank connection requires re-authentication.');
        console.error('   Please reconnect your account through the UI.');
      } else if (error.response.data.error_code === 'RATE_LIMIT_EXCEEDED') {
        console.error('\n⚠️  Rate limit exceeded. Please wait before trying again.');
      }
    }
    
    process.exit(1);
  }
}

// Run the script
fetchPlaidData();







