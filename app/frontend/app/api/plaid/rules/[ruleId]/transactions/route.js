import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

/**
 * GET /api/plaid/rules/[ruleId]/transactions
 * Get all transactions that match a specific rule
 */
export async function GET(req, { params }) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    // Handle both sync and async params (Next.js 13+)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { ruleId } = resolvedParams;
    
    if (!ruleId) {
      return NextResponse.json(
        { error: 'Rule ID is required' },
        { status: 400 }
      );
    }

    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    // Get the rule
    const rule = await prisma.plaidCategorizationRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
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
      return NextResponse.json({
        success: true,
        transactions: [],
        message: 'No Plaid items found',
      });
    }

    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    // Get transactions
    const transactionData = await prisma.plaidTransactionData.findUnique({
      where: { itemId: item.item_id },
    });

    if (!transactionData || !transactionData.transactions) {
      return NextResponse.json({
        success: true,
        transactions: [],
        message: 'No transactions found',
      });
    }

    const transactions = transactionData.transactions;
    const patterns = Array.isArray(rule.patterns) ? rule.patterns : [rule.patterns];
    
    // Helper to check if a transaction matches the rule
    const matchesRule = (transaction) => {
      // First check if transaction is excluded
      if (rule.excludedTransactions) {
        const excluded = Array.isArray(rule.excludedTransactions) 
          ? rule.excludedTransactions 
          : [];
        if (excluded.includes(transaction.transaction_id)) {
          return false;
        }
      }
      
      const name = (transaction.name || '').toUpperCase();
      const merchantName = (transaction.merchant_name || '').toUpperCase();
      const searchText = `${name} ${merchantName}`;
      const patternLogic = rule.patternLogic || 'OR'; // Default to OR for backward compatibility

      // Check pattern matching based on AND/OR logic
      let patternMatches = false;
      
      if (patternLogic === 'AND') {
        // ALL patterns must match
        patternMatches = patterns.every(pattern => {
          const upperPattern = pattern.toUpperCase();
          
          switch (rule.matchType) {
            case 'exact':
              return name === upperPattern || merchantName === upperPattern;
            case 'startsWith':
              return name.startsWith(upperPattern) || merchantName.startsWith(upperPattern);
            case 'contains':
            default:
              return searchText.includes(upperPattern);
          }
        });
      } else {
        // OR: ANY pattern must match (default behavior)
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
      }
      
      if (!patternMatches) return false;
      
      // If rule has matchAmount, check that the transaction amount matches it
      if (rule.matchAmount !== null && rule.matchAmount !== undefined) {
        const transactionAmount = Math.abs(transaction.amount || 0);
        const ruleAmount = Math.abs(rule.matchAmount);
        // Allow for small floating point differences (within 1 cent)
        if (Math.abs(transactionAmount - ruleAmount) > 0.01) {
          return false;
        }
      }
      
      return true;
    };

    // Find all matching transactions
    const matching = transactions.filter(matchesRule);

    return NextResponse.json({
      success: true,
      transactions: matching,
      count: matching.length,
    });

  } catch (error) {
    console.error('Error fetching matching transactions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

