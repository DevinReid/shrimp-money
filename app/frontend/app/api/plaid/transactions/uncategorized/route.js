import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');
const { loadMergedTransactions } = require('@/lib/transactionStore');

/**
 * GET /api/plaid/transactions/uncategorized
 * Get all transactions that don't have a category assigned
 */
export async function GET(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const itemsData = await readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';

    if (itemsData.items.length === 0) {
      return NextResponse.json(
        { error: 'No items found. Please link an account first.' },
        { status: 404 }
      );
    }

    // Filter items by current environment
    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) {
        return currentEnv === 'sandbox';
      }
      return item.environment === currentEnv;
    });

    if (matchingItems.length === 0) {
      return NextResponse.json(
        { error: `No items found for ${currentEnv} environment.` },
        { status: 404 }
      );
    }

    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    // Single source of truth for transactions — see lib/transactionStore.js.
    // The store already fills userCategory from the category table, so a
    // transaction is uncategorized iff it has no userCategory.
    const { transactions: allTransactions } = await loadMergedTransactions(prisma);

    if (allTransactions.length === 0) {
      return NextResponse.json({
        transactions: [],
        total: 0,
        message: 'No transactions found. Please fetch transactions first.',
      });
    }

    const uncategorized = allTransactions.filter(t => {
      const cat = t.userCategory;
      return !cat || (typeof cat === 'string' && cat.trim() === '');
    });

    return NextResponse.json({
      transactions: uncategorized,
      total: uncategorized.length,
      totalTransactions: allTransactions.length,
    });
  } catch (error) {
    console.error('Error fetching uncategorized transactions:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

