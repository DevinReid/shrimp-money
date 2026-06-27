const fs = require('fs-extra');
const path = require('path');
const { decrypt } = require('./encryption');

const DATA_DIR = path.join(process.cwd(), 'lib', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const RETENTION_LOG = path.join(DATA_DIR, 'deletion_log.json');

// Retention periods (in milliseconds)
const RETENTION_PERIODS = {
  ACCOUNT_DATA: 90 * 24 * 60 * 60 * 1000, // 90 days
  TRANSACTION_DATA: 365 * 24 * 60 * 60 * 1000, // 1 year
};

// Ensure deletion log exists
if (!fs.existsSync(RETENTION_LOG)) {
  fs.writeJsonSync(RETENTION_LOG, { deletions: [] });
}

/**
 * Log a deletion event for audit purposes
 */
function logDeletion(type, details) {
  try {
    const log = fs.readJsonSync(RETENTION_LOG);
    log.deletions.push({
      type,
      timestamp: new Date().toISOString(),
      ...details,
    });
    fs.writeJsonSync(RETENTION_LOG, log, { spaces: 2 });
  } catch (error) {
    console.error('Error logging deletion:', error);
  }
}

/**
 * Delete user account and all associated data
 */
function deleteUserAccount(userId) {
  try {
    // Read users
    const usersData = fs.readJsonSync(USERS_FILE);
    const user = usersData.users.find(u => u.id === userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Get all items for this user (if we track user-item relationships)
    // For now, we'll delete all items since this is a single-user tool
    const itemsData = fs.readJsonSync(ITEMS_FILE);
    const items = itemsData.items || [];

    // Delete all associated account and transaction data
    items.forEach(item => {
      deleteItemData(item.item_id);
    });

    // Remove user from users.json
    usersData.users = usersData.users.filter(u => u.id !== userId);
    fs.writeJsonSync(USERS_FILE, usersData, { spaces: 2 });

    // Log deletion
    logDeletion('USER_ACCOUNT', {
      userId,
      username: user.username,
      itemsDeleted: items.length,
    });

    return { success: true, deletedItems: items.length };
  } catch (error) {
    console.error('Error deleting user account:', error);
    throw error;
  }
}

/**
 * Delete Plaid item and all associated data
 */
function deleteItemData(itemId) {
  try {
    // Read items
    const itemsData = fs.readJsonSync(ITEMS_FILE);
    const item = itemsData.items.find(i => i.item_id === itemId);
    
    if (!item) {
      throw new Error('Item not found');
    }

    // Delete account data file
    const accountFile = path.join(DATA_DIR, `accounts_${itemId}.json`);
    if (fs.existsSync(accountFile)) {
      fs.removeSync(accountFile);
    }

    // Delete transaction data file
    const transactionFile = path.join(DATA_DIR, `transactions_${itemId}.json`);
    if (fs.existsSync(transactionFile)) {
      fs.removeSync(transactionFile);
    }

    // Remove item from items.json
    itemsData.items = itemsData.items.filter(i => i.item_id !== itemId);
    fs.writeJsonSync(ITEMS_FILE, itemsData, { spaces: 2 });

    // Log deletion
    logDeletion('PLAID_ITEM', {
      itemId,
      accessToken: item.access_token ? '***' : null,
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting item data:', error);
    throw error;
  }
}

/**
 * Clean up old account data (older than retention period)
 */
function cleanupOldAccountData() {
  try {
    const itemsData = fs.readJsonSync(ITEMS_FILE);
    const items = itemsData.items || [];
    const now = Date.now();
    let deletedCount = 0;

    items.forEach(item => {
      const accountFile = path.join(DATA_DIR, `accounts_${item.item_id}.json`);
      
      if (fs.existsSync(accountFile)) {
        let accountData;
        try {
          // Try to read and decrypt
          const encryptedData = fs.readFileSync(accountFile, 'utf8');
          const decryptedData = decrypt(encryptedData);
          accountData = JSON.parse(decryptedData);
        } catch (error) {
          // If decryption fails, try reading as plain JSON (legacy)
          try {
            accountData = fs.readJsonSync(accountFile);
          } catch (jsonError) {
            // File is corrupted, skip it
            return;
          }
        }
        
        const lastUpdated = accountData.lastUpdated 
          ? new Date(accountData.lastUpdated).getTime()
          : new Date(item.created_at).getTime();
        
        const age = now - lastUpdated;
        
        if (age > RETENTION_PERIODS.ACCOUNT_DATA) {
          fs.removeSync(accountFile);
          deletedCount++;
          
          logDeletion('AUTO_CLEANUP_ACCOUNT', {
            itemId: item.item_id,
            ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
          });
        }
      }
    });

    return { success: true, deletedCount };
  } catch (error) {
    console.error('Error cleaning up old account data:', error);
    throw error;
  }
}

/**
 * Clean up old transaction data (older than retention period)
 */
function cleanupOldTransactionData() {
  try {
    const itemsData = fs.readJsonSync(ITEMS_FILE);
    const items = itemsData.items || [];
    const now = Date.now();
    let deletedCount = 0;

    items.forEach(item => {
      const transactionFile = path.join(DATA_DIR, `transactions_${item.item_id}.json`);
      
      if (fs.existsSync(transactionFile)) {
        let transactionData;
        try {
          // Try to read and decrypt
          const encryptedData = fs.readFileSync(transactionFile, 'utf8');
          const decryptedData = decrypt(encryptedData);
          transactionData = JSON.parse(decryptedData);
        } catch (error) {
          // If decryption fails, try reading as plain JSON (legacy)
          try {
            transactionData = fs.readJsonSync(transactionFile);
          } catch (jsonError) {
            // File is corrupted, skip it
            return;
          }
        }
        
        const lastFetched = transactionData.lastFetched 
          ? new Date(transactionData.lastFetched).getTime()
          : new Date(item.created_at).getTime();
        
        const age = now - lastFetched;
        
        if (age > RETENTION_PERIODS.TRANSACTION_DATA) {
          fs.removeSync(transactionFile);
          deletedCount++;
          
          logDeletion('AUTO_CLEANUP_TRANSACTION', {
            itemId: item.item_id,
            ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
          });
        }
      }
    });

    return { success: true, deletedCount };
  } catch (error) {
    console.error('Error cleaning up old transaction data:', error);
    throw error;
  }
}

/**
 * Run all automatic cleanup tasks
 */
function runAutomaticCleanup() {
  try {
    const accountCleanup = cleanupOldAccountData();
    const transactionCleanup = cleanupOldTransactionData();
    
    return {
      success: true,
      accountDataDeleted: accountCleanup.deletedCount,
      transactionDataDeleted: transactionCleanup.deletedCount,
    };
  } catch (error) {
    console.error('Error running automatic cleanup:', error);
    throw error;
  }
}

/**
 * Get deletion log (for audit purposes)
 */
function getDeletionLog(limit = 100) {
  try {
    const log = fs.readJsonSync(RETENTION_LOG);
    const deletions = log.deletions || [];
    return deletions.slice(-limit).reverse(); // Most recent first
  } catch (error) {
    console.error('Error reading deletion log:', error);
    return [];
  }
}

module.exports = {
  deleteUserAccount,
  deleteItemData,
  cleanupOldAccountData,
  cleanupOldTransactionData,
  runAutomaticCleanup,
  getDeletionLog,
  RETENTION_PERIODS,
};

