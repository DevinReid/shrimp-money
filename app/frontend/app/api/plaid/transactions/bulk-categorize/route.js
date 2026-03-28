import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');
const { normalizeMerchantName, areMerchantsSimilar } = require('@/lib/merchantMatcher');

const PREDEFINED_CATEGORIES = [
  'Subscription',
  'One-time Purchase',
  'Bill',
  'Transfer',
  'Income',
  'Other',
  'Uncategorized',
];

/**
 * POST /api/plaid/transactions/bulk-categorize
 * Find uncategorized transactions matching a merchant name and optionally bulk update them
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
    const body = await req.json();
    const { merchantName, category, transactionId, action, selectedTransactionIds } = body;

    if (!merchantName || !transactionId) {
      return NextResponse.json(
        { error: 'Merchant name and transaction ID are required' },
        { status: 400 }
      );
    }

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

    // Get all transactions
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
      return NextResponse.json(
        { error: 'No transactions found. Please fetch transactions first.' },
        { status: 404 }
      );
    }

    // Get all categorized transaction IDs
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
    }

    // Find the reference transaction to get its merchant name
    const referenceTransaction = allTransactions.find(
      t => t.transaction_id === transactionId
    );

    if (!referenceTransaction) {
      return NextResponse.json(
        { error: 'Reference transaction not found' },
        { status: 404 }
      );
    }

    // Get the merchant name to match against (use merchant_name if available, otherwise name)
    const referenceMerchantName = referenceTransaction.merchant_name || referenceTransaction.name;

    // Find all uncategorized transactions from the same merchant with fuzzy matching
    const matchingTransactions = allTransactions
      .map(transaction => {
        // Skip the reference transaction itself
        if (transaction.transaction_id === transactionId) return null;
        
        // Skip already categorized transactions
        if (categorizedIds.has(transaction.transaction_id)) return null;
        
        // Match by merchant name with fuzzy matching
        const transactionMerchantName = transaction.merchant_name || transaction.name;
        const matchResult = areMerchantsSimilar(referenceMerchantName, transactionMerchantName);
        
        if (matchResult.match) {
          return {
            ...transaction,
            matchScore: matchResult.score,
            matchReason: matchResult.reason,
          };
        }
        return null;
      })
      .filter(t => t !== null)
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by match confidence (best matches first)

    // If action is 'apply', bulk update selected transactions
    if (action === 'apply' && category) {
      if (!prisma || !prisma.plaidTransactionCategory) {
        return NextResponse.json(
          { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
          { status: 500 }
        );
      }

      // selectedTransactionIds is already extracted from body above
      
      // Use selectedTransactionIds if provided, otherwise apply to all matching
      const transactionsToCategorize = selectedTransactionIds && selectedTransactionIds.length > 0
        ? matchingTransactions.filter(t => selectedTransactionIds.includes(t.transaction_id))
        : matchingTransactions;

      if (transactionsToCategorize.length === 0) {
        return NextResponse.json({
          error: 'No transactions selected to categorize',
        }, { status: 400 });
      }

      const trimmedCategory = category.trim();
      const isCustom = !PREDEFINED_CATEGORIES.includes(trimmedCategory);

      // Bulk update selected transactions in PlaidTransactionCategory table
      const updatePromises = transactionsToCategorize.map(transaction =>
        prisma.plaidTransactionCategory.upsert({
          where: { transactionId: transaction.transaction_id },
          update: {
            category: trimmedCategory,
            isCustom,
            updatedAt: new Date(),
          },
          create: {
            transactionId: transaction.transaction_id,
            category: trimmedCategory,
            isCustom,
          },
        })
      );

      await Promise.all(updatePromises);

      // ALSO sync categories to the normalized PlaidTransaction table
      if (prisma && prisma.plaidTransaction) {
        try {
          const transactionIds = transactionsToCategorize.map(t => t.transaction_id);
          await prisma.plaidTransaction.updateMany({
            where: { transactionId: { in: transactionIds } },
            data: { userCategory: trimmedCategory },
          });
          console.log(`✅ Synced ${transactionIds.length} categories to PlaidTransaction table`);
        } catch (syncError) {
          console.log(`⚠️ Could not sync categories to PlaidTransaction table: ${syncError.message}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully categorized ${transactionsToCategorize.length} transaction(s)`,
        count: transactionsToCategorize.length,
        transactionIds: transactionsToCategorize.map(t => t.transaction_id),
      });
    }

    // Otherwise, just return the matching transactions for preview
    return NextResponse.json({
      success: true,
      count: matchingTransactions.length,
      transactions: matchingTransactions.map(t => ({
        transaction_id: t.transaction_id,
        name: t.name,
        merchant_name: t.merchant_name,
        amount: t.amount,
        date: t.date,
        matchScore: t.matchScore,
        matchReason: t.matchReason,
      })),
      referenceMerchantName,
    });
  } catch (error) {
    console.error('Error in bulk categorize:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

