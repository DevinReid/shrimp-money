const path = require('path');
// Load .env from app directory (parent directory)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET,
    },
  },
});

const client = new PlaidApi(configuration);

// Data storage directory
const DATA_DIR = path.join(__dirname, 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// Initialize items storage if it doesn't exist
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

// Create link token
app.post('/api/create_link_token', async (req, res) => {
  try {
    const request = {
      user: {
        client_user_id: 'user_' + Date.now(),
      },
      client_name: 'Plaid Connect',
      products: ['transactions', 'auth'],
      language: 'en',
      country_codes: ['US'],
      // Sandbox-specific: Use test credentials, no phone validation needed
      // For sandbox, you should use: username: user_good, password: pass_good
    };

    const response = await client.linkTokenCreate(request);
    res.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    });
  }
});

// Exchange public token for access token
app.post('/api/exchange_public_token', async (req, res) => {
  try {
    const { public_token } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: 'public_token is required' });
    }

    const response = await client.itemPublicTokenExchange({
      public_token: public_token,
    });

    const { access_token, item_id } = response.data;

    // Save item information
    const itemsData = readItems();
    const existingItemIndex = itemsData.items.findIndex(
      (item) => item.item_id === item_id
    );

    const itemData = {
      item_id,
      access_token,
      created_at: new Date().toISOString(),
    };

    if (existingItemIndex >= 0) {
      itemsData.items[existingItemIndex] = itemData;
    } else {
      itemsData.items.push(itemData);
    }

    saveItems(itemsData);

    res.json({
      success: true,
      item_id,
      message: 'Public token exchanged successfully',
    });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    });
  }
});

// Get accounts (balance information)
app.get('/api/accounts', async (req, res) => {
  try {
    const itemsData = readItems();

    if (itemsData.items.length === 0) {
      return res.status(404).json({ error: 'No items found. Please link an account first.' });
    }

    // Get the first item (you can modify this to support multiple items)
    const item = itemsData.items[0];
    const access_token = item.access_token;

    const response = await client.accountsGet({
      access_token: access_token,
    });

    // Save account data
    saveAccountData(item.item_id, response.data);

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    });
  }
});

// Get transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const itemsData = readItems();

    if (itemsData.items.length === 0) {
      return res.status(404).json({ error: 'No items found. Please link an account first.' });
    }

    const item = itemsData.items[0];
    const access_token = item.access_token;

    // Get transactions from the last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const response = await client.transactionsGet({
      access_token: access_token,
      start_date: thirtyDaysAgo.toISOString().split('T')[0],
      end_date: now.toISOString().split('T')[0],
    });

    // Save transaction data
    saveTransactionData(item.item_id, response.data);

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    });
  }
});

// Get all stored items
app.get('/api/items', (req, res) => {
  try {
    const itemsData = readItems();
    res.json(itemsData);
  } catch (error) {
    console.error('Error reading items:', error);
    res.status(500).json({ error: 'Error reading items' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Make sure PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET are set in .env`);
});

