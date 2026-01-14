#!/usr/bin/env node

/**
 * Apply categorization rules to all uncategorized transactions
 * 
 * This script backfills categorization for all existing uncategorized transactions
 * that match active rules. Useful for one-time backfill operations.
 * 
 * Usage: node scripts/apply-rules-to-uncategorized.js
 */

const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Load environment variables (if dotenv is available)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available, assume env vars are set externally
}

async function main() {
  const prisma = new PrismaClient();

  try {
    log('\n' + '='.repeat(60), 'cyan');
    log('🚀 Applying Rules to Uncategorized Transactions', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');

    // Check database connection
    await prisma.$connect();
    log('✅ Connected to database\n', 'green');

    // Get Plaid items
    const fs = require('fs');
    const itemsPath = path.join(__dirname, '..', 'app', 'frontend', 'lib', 'plaid_items.json');
    
    if (!fs.existsSync(itemsPath)) {
      log('❌ Plaid items file not found. Please link an account first.', 'red');
      process.exit(1);
    }

    const itemsData = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    
    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) return currentEnv === 'sandbox';
      return item.environment === currentEnv;
    });

    if (matchingItems.length === 0) {
      log('❌ No Plaid items found for the current environment', 'red');
      process.exit(1);
    }

    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    log(`📦 Using Plaid item: ${item.item_id} (${currentEnv})\n`, 'blue');

    // Get all active rules
    const rules = await prisma.plaidCategorizationRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    if (rules.length === 0) {
      log('⚠️  No active rules found. Create some rules first!', 'yellow');
      process.exit(0);
    }

    log(`📋 Found ${rules.length} active rule(s)\n`, 'blue');

    // Get transactions
    const transactionData = await prisma.plaidTransactionData.findUnique({
      where: { itemId: item.item_id },
    });

    if (!transactionData || !transactionData.transactions) {
      log('❌ No transactions found', 'red');
      process.exit(1);
    }

    const transactions = transactionData.transactions;
    const uncategorizedCount = transactions.filter(t => !t.userCategory).length;
    
    log(`📊 Total transactions: ${transactions.length}`, 'blue');
    log(`📊 Uncategorized: ${uncategorizedCount}\n`, uncategorizedCount > 0 ? 'yellow' : 'green');

    if (uncategorizedCount === 0) {
      log('✅ All transactions are already categorized!', 'green');
      process.exit(0);
    }

    // Helper to check if a transaction matches a rule
    const matchesRule = (transaction, rule) => {
      // First check if transaction is excluded
      if (rule.excludedTransactions) {
        const excluded = Array.isArray(rule.excludedTransactions) 
          ? rule.excludedTransactions 
          : [];
        if (excluded.includes(transaction.transaction_id)) {
          return false;
        }
      }
      
      const patterns = Array.isArray(rule.patterns) ? rule.patterns : [rule.patterns];
      const name = (transaction.name || '').toUpperCase();
      const merchantName = (transaction.merchant_name || '').toUpperCase();
      const searchText = `${name} ${merchantName}`;

      // Check pattern matching (OR logic - any pattern matches)
      let patternMatches = false;
      for (const pattern of patterns) {
        const upperPattern = pattern.toUpperCase();
        
        switch (rule.matchType) {
          case 'exact':
            if (name === upperPattern || merchantName === upperPattern) {
              patternMatches = true;
              break;
            }
            break;
          case 'startsWith':
            if (name.startsWith(upperPattern) || merchantName.startsWith(upperPattern)) {
              patternMatches = true;
              break;
            }
            break;
          case 'contains':
          default:
            if (searchText.includes(upperPattern)) {
              patternMatches = true;
              break;
            }
            break;
        }
        if (patternMatches) break;
      }
      
      if (!patternMatches) return false;
      
      // If rule has matchAmounts, check that the transaction amount matches one of them
      if (rule.matchAmounts && Array.isArray(rule.matchAmounts) && rule.matchAmounts.length > 0) {
        const transactionAmount = Math.abs(transaction.amount || 0);
        const matchesAmount = rule.matchAmounts.some(ruleAmount => {
          const amount = Math.abs(ruleAmount);
          return Math.abs(transactionAmount - amount) <= 0.01;
        });
        
        if (!matchesAmount) {
          return false;
        }
      }
      
      return true;
    };

    // Process each transaction
    let applied = 0;
    let suggested = 0;
    const updatedTransactions = [];

    log('🔄 Processing transactions...\n', 'cyan');

    for (const transaction of transactions) {
      // Skip if already categorized
      if (transaction.userCategory) {
        updatedTransactions.push(transaction);
        continue;
      }

      // Find matching rule (first match wins due to priority ordering)
      let matchedRule = null;
      for (const rule of rules) {
        if (matchesRule(transaction, rule)) {
          matchedRule = rule;
          break;
        }
      }

      if (matchedRule) {
        if (matchedRule.autoApply) {
          // Auto-apply the category
          updatedTransactions.push({
            ...transaction,
            userCategory: matchedRule.category,
            autoAppliedRule: matchedRule.id,
          });
          
          // Save to the category table
          try {
            await prisma.plaidTransactionCategory.upsert({
              where: { transactionId: transaction.transaction_id },
              update: { category: matchedRule.category },
              create: {
                transactionId: transaction.transaction_id,
                category: matchedRule.category,
                isCustom: false,
              },
            });
            
            // ALSO sync to the normalized PlaidTransaction table
            if (prisma.plaidTransaction) {
              try {
                await prisma.plaidTransaction.updateMany({
                  where: { transactionId: transaction.transaction_id },
                  data: { userCategory: matchedRule.category },
                });
              } catch (syncError) {
                // Transaction might not exist in normalized table yet - that's okay
              }
            }
          } catch (e) {
            log(`⚠️  Could not save category for ${transaction.transaction_id}: ${e.message}`, 'yellow');
          }
          
          applied++;
          log(`  ✅ "${matchedRule.category}" → "${transaction.name}"`, 'green');
        } else {
          // Create a suggestion
          updatedTransactions.push({
            ...transaction,
            suggestedCategory: matchedRule.category,
            suggestedByRule: matchedRule.id,
          });
          
          // Save suggestion to database
          try {
            await prisma.plaidCategorySuggestion.upsert({
              where: { transactionId: transaction.transaction_id },
              update: {
                category: matchedRule.category,
                ruleId: matchedRule.id,
                status: 'pending',
              },
              create: {
                transactionId: transaction.transaction_id,
                ruleId: matchedRule.id,
                category: matchedRule.category,
                status: 'pending',
              },
            });
          } catch (e) {
            log(`⚠️  Could not save suggestion for ${transaction.transaction_id}: ${e.message}`, 'yellow');
          }
          
          suggested++;
          log(`  💡 Suggested "${matchedRule.category}" for "${transaction.name}"`, 'yellow');
        }
      } else {
        updatedTransactions.push(transaction);
      }
    }

    // Save updated transactions
    if (applied > 0) {
      await prisma.plaidTransactionData.update({
        where: { itemId: item.item_id },
        data: {
          transactions: updatedTransactions,
          lastFetched: new Date(),
        },
      });
    }

    // Summary
    log('\n' + '='.repeat(60), 'cyan');
    log('📊 Summary', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`✅ Auto-categorized: ${applied} transaction${applied !== 1 ? 's' : ''}`, applied > 0 ? 'green' : 'reset');
    log(`💡 Suggested for review: ${suggested} transaction${suggested !== 1 ? 's' : ''}`, suggested > 0 ? 'yellow' : 'reset');
    log(`📊 Total processed: ${transactions.length}`, 'blue');
    log(`📊 Remaining uncategorized: ${transactions.length - applied - suggested - (transactions.length - uncategorizedCount)}`, 'blue');
    log('='.repeat(60) + '\n', 'cyan');

    if (applied > 0 || suggested > 0) {
      log('✅ Rules applied successfully!', 'green');
    } else {
      log('ℹ️  No transactions matched any rules.', 'yellow');
    }

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
