import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

/**
 * POST /api/plaid/rules/apply
 * Apply categorization rules to uncategorized transactions
 */
export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    if (!prisma || !prisma.plaidCategorizationRule || !prisma.plaidTransactionData) {
      return NextResponse.json(
        { error: 'Database not available. Run: npx prisma db push && npx prisma generate' },
        { status: 500 }
      );
    }

    // Get the current item
    const itemsData = readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) return currentEnv === 'sandbox';
      return item.environment === currentEnv;
    });

    if (matchingItems.length === 0) {
      return NextResponse.json(
        { error: 'No Plaid items found' },
        { status: 404 }
      );
    }

    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    // Get all active rules
    const rules = await prisma.plaidCategorizationRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    if (rules.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No rules defined',
        applied: 0,
        suggested: 0,
      });
    }

    // Get transactions
    const transactionData = await prisma.plaidTransactionData.findUnique({
      where: { itemId: item.item_id },
    });

    if (!transactionData || !transactionData.transactions) {
      return NextResponse.json({
        success: true,
        message: 'No transactions found',
        applied: 0,
        suggested: 0,
      });
    }

    const transactions = transactionData.transactions;
    let applied = 0;
    let suggested = 0;
    const updatedTransactions = [];

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
        // Check if transaction amount matches any of the specified amounts
        const matchesAmount = rule.matchAmounts.some(ruleAmount => {
          const amount = Math.abs(ruleAmount);
          // Allow for small floating point differences (within 1 cent)
          return Math.abs(transactionAmount - amount) <= 0.01;
        });
        
        if (!matchesAmount) {
          return false;
        }
      }
      
      return true;
    };

    // Process each transaction
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
          
          // Also save to the category table
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
          } catch (e) {
            console.log('Could not save category:', e.message);
          }
          
          applied++;
          console.log(`✅ Auto-applied "${matchedRule.category}" to "${transaction.name}"`);
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
            console.log('Could not save suggestion:', e.message);
          }
          
          suggested++;
          console.log(`💡 Suggested "${matchedRule.category}" for "${transaction.name}"`);
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

    return NextResponse.json({
      success: true,
      applied,
      suggested,
      total: transactions.length,
      message: `Applied ${applied} categories, suggested ${suggested} for review`,
    });

  } catch (error) {
    console.error('Error applying rules:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

