import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

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

    // Get all transactions from database or file
    let allTransactions = [];

    // Try database first
    if (prisma) {
      try {
        const dbData = await prisma.plaidTransactionData.findUnique({
          where: { itemId: item.item_id },
        });
        if (dbData && dbData.transactions) {
          allTransactions = Array.isArray(dbData.transactions) 
            ? dbData.transactions 
            : (dbData.transactions.transactions || []);
        }
      } catch (dbError) {
        console.log('⚠️ Could not read from database:', dbError.message);
      }
    }

    // Fallback to file storage
    if (allTransactions.length === 0) {
      const fileData = readTransactionData(item.item_id);
      if (fileData && fileData.transactions) {
        allTransactions = fileData.transactions || [];
      }
    }

    if (allTransactions.length === 0) {
      return NextResponse.json({
        transactions: [],
        total: 0,
        message: 'No transactions found. Please fetch transactions first.',
      });
    }

    // Get all categorized transaction IDs from database
    let categorizedIds = new Set();
    if (prisma && prisma.plaidTransactionCategory) {
      try {
        const categories = await prisma.plaidTransactionCategory.findMany({
          select: { transactionId: true },
        });
        categorizedIds = new Set(categories.map(c => c.transactionId));
      } catch (dbError) {
        console.log('⚠️ Could not read categories from database:', dbError.message);
      }
    } else if (prisma && !prisma.plaidTransactionCategory) {
      console.log('⚠️ Prisma client not regenerated - transaction categories model not available');
    }

    // Also enrich transactions with userCategory and notes from database (like the main transactions endpoint does)
    let categoryMap = {};
    let noteMap = {};
    if (prisma && prisma.plaidTransactionCategory) {
      try {
        const transactionIds = allTransactions.map(t => t.transaction_id);
        
        // Get categories
        const categories = await prisma.plaidTransactionCategory.findMany({
          where: { transactionId: { in: transactionIds } },
        });
        categoryMap = categories.reduce((acc, cat) => {
          acc[cat.transactionId] = cat.category;
          return acc;
        }, {});
        
        // Get notes
        if (prisma.plaidTransactionNote) {
          const notes = await prisma.plaidTransactionNote.findMany({
            where: { transactionId: { in: transactionIds } },
          });
          noteMap = notes.reduce((acc, note) => {
            acc[note.transactionId] = note.note;
            return acc;
          }, {});
        }
      } catch (catError) {
        console.log('⚠️ Could not load categories/notes for enrichment:', catError.message);
      }
    }

    // Enrich transactions with userCategory and notes
    const enrichedTransactions = allTransactions.map(t => ({
      ...t,
      userCategory: categoryMap[t.transaction_id] || t.userCategory || null,
      userNote: noteMap[t.transaction_id] || t.userNote || null,
    }));

    // Filter to only uncategorized transactions
    // A transaction is uncategorized if:
    // 1. It doesn't have a record in the category database table, AND
    // 2. It doesn't have a userCategory field set
    const uncategorized = enrichedTransactions.filter(
      transaction => {
        const hasDbCategory = categorizedIds.has(transaction.transaction_id);
        const hasUserCategory = transaction.userCategory && transaction.userCategory.trim() !== '';
        return !hasDbCategory && !hasUserCategory;
      }
    );

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

