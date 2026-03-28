import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';
const prisma = require('@/lib/prisma');
const { buildCategoryHistory, fuzzyMatchTransaction } = require('@/lib/merchantMatcher');

/**
 * POST /api/plaid/rules/apply
 * Apply categorization rules to uncategorized transactions,
 * then fuzzy-match remaining against categorized history
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
    const itemsData = await readItems();
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
        fuzzyApplied: 0,
      });
    }

    const transactions = transactionData.transactions;
    let applied = 0;
    let suggested = 0;
    let fuzzyApplied = 0;
    const updatedTransactions = [];
    const categoryUpserts = [];
    const suggestionUpserts = [];

    // Helper to check if a transaction matches a rule
    const matchesRule = (transaction, rule) => {
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

      if (rule.matchAmounts && Array.isArray(rule.matchAmounts) && rule.matchAmounts.length > 0) {
        const transactionAmount = Math.abs(transaction.amount || 0);
        const matchesAmount = rule.matchAmounts.some(ruleAmount => {
          const amount = Math.abs(ruleAmount);
          return Math.abs(transactionAmount - amount) <= 0.01;
        });

        if (!matchesAmount) return false;
      }

      return true;
    };

    // Phase 1: Apply rules to uncategorized transactions
    for (const transaction of transactions) {
      if (transaction.userCategory) {
        updatedTransactions.push(transaction);
        continue;
      }

      let matchedRule = null;
      if (rules.length > 0) {
        for (const rule of rules) {
          if (matchesRule(transaction, rule)) {
            matchedRule = rule;
            break;
          }
        }
      }

      if (matchedRule) {
        if (matchedRule.autoApply) {
          updatedTransactions.push({
            ...transaction,
            userCategory: matchedRule.category,
            autoAppliedRule: matchedRule.id,
          });
          categoryUpserts.push({
            transactionId: transaction.transaction_id,
            category: matchedRule.category,
          });
          applied++;
          console.log(`✅ Auto-applied "${matchedRule.category}" to "${transaction.name}"`);
        } else {
          updatedTransactions.push({
            ...transaction,
            suggestedCategory: matchedRule.category,
            suggestedByRule: matchedRule.id,
          });
          suggestionUpserts.push({
            transactionId: transaction.transaction_id,
            ruleId: matchedRule.id,
            category: matchedRule.category,
          });
          suggested++;
          console.log(`💡 Suggested "${matchedRule.category}" for "${transaction.name}"`);
        }
      } else {
        updatedTransactions.push(transaction);
      }
    }

    // Phase 2: Fuzzy-match remaining uncategorized against history
    try {
      const existingCategories = await prisma.plaidTransactionCategory.findMany();
      const existingCategoryMap = existingCategories.reduce((acc, cat) => {
        acc[cat.transactionId] = cat.category;
        return acc;
      }, {});
      const categoryHistory = buildCategoryHistory(updatedTransactions, existingCategoryMap);

      if (categoryHistory.length > 0) {
        for (let i = 0; i < updatedTransactions.length; i++) {
          const transaction = updatedTransactions[i];
          if (transaction.userCategory) continue;

          const fuzzyMatch = fuzzyMatchTransaction(transaction, categoryHistory);
          if (fuzzyMatch) {
            updatedTransactions[i] = {
              ...transaction,
              userCategory: fuzzyMatch.category,
              autoAppliedFuzzy: true,
            };
            categoryUpserts.push({
              transactionId: transaction.transaction_id,
              category: fuzzyMatch.category,
            });
            fuzzyApplied++;
            console.log(`🔍 Fuzzy-matched "${transaction.name}" → "${fuzzyMatch.category}" (${(fuzzyMatch.score * 100).toFixed(0)}% ${fuzzyMatch.reason}, matched: "${fuzzyMatch.matchedMerchant}")`);
          }
        }
      }
    } catch (fuzzyError) {
      console.log('⚠️ Fuzzy matching failed, continuing:', fuzzyError.message);
    }

    // Phase 3: Batch save all category assignments
    if (categoryUpserts.length > 0) {
      try {
        await prisma.$transaction(
          categoryUpserts.map(({ transactionId, category }) =>
            prisma.plaidTransactionCategory.upsert({
              where: { transactionId },
              update: { category },
              create: { transactionId, category, isCustom: false },
            })
          )
        );

        if (prisma.plaidTransaction) {
          await prisma.$transaction(
            categoryUpserts.map(({ transactionId, category }) =>
              prisma.plaidTransaction.updateMany({
                where: { transactionId },
                data: { userCategory: category },
              })
            )
          ).catch(e => console.log('PlaidTransaction sync skipped:', e.message));
        }
      } catch (e) {
        console.log('Could not batch save categories:', e.message);
      }
    }

    // Batch save suggestions
    if (suggestionUpserts.length > 0) {
      try {
        await prisma.$transaction(
          suggestionUpserts.map(({ transactionId, ruleId, category }) =>
            prisma.plaidCategorySuggestion.upsert({
              where: { transactionId },
              update: { category, ruleId, status: 'pending' },
              create: { transactionId, ruleId, category, status: 'pending' },
            })
          )
        );
      } catch (e) {
        console.log('Could not batch save suggestions:', e.message);
      }
    }

    // Save updated transactions
    const totalChanged = applied + fuzzyApplied;
    if (totalChanged > 0) {
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
      fuzzyApplied,
      total: transactions.length,
      message: `Applied ${applied} by rules, ${fuzzyApplied} by fuzzy matching, suggested ${suggested} for review`,
    });

  } catch (error) {
    console.error('Error applying rules:', error.message);
    return NextResponse.json({ error: 'Failed to apply rules' }, { status: 500 });
  }
}
