const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fs = require('fs-extra');
const path = require('path');

// Load environment variables (Next.js loads .env.local automatically, but we need to ensure they're available)
// In Next.js API routes, process.env is available, but we should verify the values
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SANDBOX_SECRET = process.env.PLAID_SANDBOX_SECRET;

if (!PLAID_CLIENT_ID || !PLAID_SANDBOX_SECRET) {
  console.warn('⚠️  WARNING: Plaid credentials not found in environment variables!');
  console.warn('   Make sure PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET are set in .env.local');
}

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SANDBOX_SECRET,
    },
  },
});

const client = new PlaidApi(configuration);
module.exports.client = client;

// Data storage directory
const DATA_DIR = path.join(process.cwd(), 'lib', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.ensureDirSync(DATA_DIR);
}
if (!fs.existsSync(ITEMS_FILE)) {
  fs.writeJsonSync(ITEMS_FILE, { items: [] });
}

// Helper function to read items
function readItems() {
  try {
    return fs.readJsonSync(ITEMS_FILE);
  } catch (error) {
    return { items: [] };
  }
}

// Helper function to save items
function saveItems(data) {
  fs.writeJsonSync(ITEMS_FILE, data, { spaces: 2 });
}

// Helper function to save account data
function saveAccountData(itemId, accountData) {
  const accountFile = path.join(DATA_DIR, `accounts_${itemId}.json`);
  fs.writeJsonSync(accountFile, accountData, { spaces: 2 });
}

// Helper function to save transaction data
function saveTransactionData(itemId, transactionData) {
  const transactionFile = path.join(DATA_DIR, `transactions_${itemId}.json`);
  fs.writeJsonSync(transactionFile, transactionData, { spaces: 2 });
}

module.exports = {
  client,
  readItems,
  saveItems,
  saveAccountData,
  saveTransactionData,
};

