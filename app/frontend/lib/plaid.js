const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fs = require('fs-extra');
const path = require('path');
const { encrypt, decrypt, encryptObject, decryptObject } = require('./encryption');

// Load environment variables explicitly as fallback (Next.js loads .env and .env.local automatically)
// This ensures variables are loaded even if Next.js doesn't pick them up
if (typeof require !== 'undefined') {
  try {
    const dotenv = require('dotenv');
    const envPath = path.join(process.cwd(), '.env');
    const envLocalPath = path.join(process.cwd(), '.env.local');
    
    // Try .env.local first (higher priority), then .env
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath });
    } else if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  } catch (error) {
    // dotenv might not be available or already loaded, that's okay
  }
}

// In Next.js API routes, process.env is available, but we should verify the values
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SANDBOX_SECRET = process.env.PLAID_SANDBOX_SECRET;
const PLAID_PRODUCTION_SECRET = process.env.PLAID_PRODUCTION_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

// Determine which environment and secret to use
const isProduction = PLAID_ENV === 'production';
const plaidSecret = isProduction ? PLAID_PRODUCTION_SECRET : PLAID_SANDBOX_SECRET;
const plaidBasePath = isProduction ? PlaidEnvironments.production : PlaidEnvironments.sandbox;

// Validate credentials
if (!PLAID_CLIENT_ID) {
  console.warn('⚠️  WARNING: PLAID_CLIENT_ID not found in environment variables!');
  console.warn('   Make sure PLAID_CLIENT_ID is set in .env or .env.local in the app/frontend directory');
}

if (!plaidSecret) {
  const secretType = isProduction ? 'PLAID_PRODUCTION_SECRET' : 'PLAID_SANDBOX_SECRET';
  console.warn(`⚠️  WARNING: ${secretType} not found in environment variables!`);
  console.warn(`   Current environment: ${PLAID_ENV}`);
  console.warn(`   Make sure ${secretType} is set in .env or .env.local in the app/frontend directory`);
}

if (PLAID_CLIENT_ID && plaidSecret) {
  console.log(`✅ Plaid configured for ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);
}

// Initialize Plaid client
const configuration = new Configuration({
  basePath: plaidBasePath,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': plaidSecret,
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

// Helper function to read items (with decryption)
function readItems() {
  try {
    const data = fs.readJsonSync(ITEMS_FILE);
    // Decrypt access tokens when reading
    if (data.items && Array.isArray(data.items)) {
      data.items = data.items.map(item => 
        decryptObject(item, ['access_token'])
      );
    }
    return data;
  } catch (error) {
    return { items: [] };
  }
}

// Helper function to save items (with encryption)
function saveItems(data) {
  // Encrypt access tokens before saving
  const dataToSave = {
    ...data,
    items: data.items ? data.items.map(item => 
      encryptObject(item, ['access_token'])
    ) : []
  };
  fs.writeJsonSync(ITEMS_FILE, dataToSave, { spaces: 2 });
}

// Helper function to save account data (with encryption)
function saveAccountData(itemId, accountData) {
  const accountFile = path.join(DATA_DIR, `accounts_${itemId}.json`);
  const dataWithTimestamp = {
    ...accountData,
    lastUpdated: new Date().toISOString(),
  };
  
  // Encrypt the entire account data file
  const encryptedData = encrypt(JSON.stringify(dataWithTimestamp));
  fs.writeFileSync(accountFile, encryptedData, 'utf8');
}

// Helper function to save transaction data (with encryption)
function saveTransactionData(itemId, transactionData) {
  const transactionFile = path.join(DATA_DIR, `transactions_${itemId}.json`);
  const dataWithTimestamp = {
    ...transactionData,
    lastFetched: new Date().toISOString(),
  };
  
  // Encrypt the entire transaction data file
  const encryptedData = encrypt(JSON.stringify(dataWithTimestamp));
  fs.writeFileSync(transactionFile, encryptedData, 'utf8');
}

// Helper function to read account data (with decryption)
function readAccountData(itemId) {
  const accountFile = path.join(DATA_DIR, `accounts_${itemId}.json`);
  
  if (!fs.existsSync(accountFile)) {
    return null;
  }

  try {
    const encryptedData = fs.readFileSync(accountFile, 'utf8');
    const decryptedData = decrypt(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    // If decryption fails, try reading as plain JSON (legacy unencrypted data)
    try {
      return fs.readJsonSync(accountFile);
    } catch (jsonError) {
      console.error('Error reading account data:', error);
      return null;
    }
  }
}

// Helper function to read transaction data (with decryption)
function readTransactionData(itemId) {
  const transactionFile = path.join(DATA_DIR, `transactions_${itemId}.json`);
  
  if (!fs.existsSync(transactionFile)) {
    return null;
  }

  try {
    const encryptedData = fs.readFileSync(transactionFile, 'utf8');
    const decryptedData = decrypt(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    // If decryption fails, try reading as plain JSON (legacy unencrypted data)
    try {
      return fs.readJsonSync(transactionFile);
    } catch (jsonError) {
      console.error('Error reading transaction data:', error);
      return null;
    }
  }
}

module.exports = {
  client,
  readItems,
  saveItems,
  saveAccountData,
  saveTransactionData,
  readAccountData,
  readTransactionData,
};

