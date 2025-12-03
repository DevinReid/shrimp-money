import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

/**
 * DELETE /api/plaid/transactions/:transactionId
 * Remove a transaction from the database
 */
export async function DELETE(req, { params }) {
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
    const { transactionId } = resolvedParams;

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    if (!prisma || !prisma.plaidTransactionData) {
      return NextResponse.json(
        { error: 'Database not available. Run: npx prisma db push && npx prisma generate' },
        { status: 500 }
      );
    }

    // Get the current item
    const itemsData = readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) {
        return currentEnv === 'sandbox';
      }
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

    // Get existing transaction data
    const existingData = await prisma.plaidTransactionData.findUnique({
      where: { itemId: item.item_id },
    });

    if (!existingData || !existingData.transactions) {
      return NextResponse.json(
        { error: 'Transaction data not found' },
        { status: 404 }
      );
    }

    // Find the transaction to delete
    const transactions = existingData.transactions;
    const transactionIndex = transactions.findIndex(
      t => t.transaction_id === transactionId
    );

    if (transactionIndex === -1) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const transactionToDelete = transactions[transactionIndex];

    // Remove the transaction from the array
    const updatedTransactions = transactions.filter(
      t => t.transaction_id !== transactionId
    );

    // Also delete the category if it exists
    try {
      await prisma.plaidTransactionCategory.deleteMany({
        where: { transactionId },
      });
    } catch (e) {
      // Category might not exist, that's fine
      console.log('No category to delete for transaction:', transactionId);
    }

    // Also delete any suggestions
    try {
      await prisma.plaidCategorySuggestion.deleteMany({
        where: { transactionId },
      });
    } catch (e) {
      // Suggestion might not exist, that's fine
      console.log('No suggestion to delete for transaction:', transactionId);
    }

    // Update the transaction data
    const allDates = updatedTransactions.map(t => new Date(t.date));
    const startDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : null;
    const endDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : null;

    await prisma.plaidTransactionData.update({
      where: { itemId: item.item_id },
      data: {
        transactions: updatedTransactions,
        totalTransactions: updatedTransactions.length,
        startDate,
        endDate,
        lastFetched: existingData.lastFetched,
      },
    });

    console.log(`🗑️ Deleted transaction: ${transactionToDelete.name || transactionToDelete.merchant_name} (${transactionId})`);

    return NextResponse.json({
      success: true,
      message: 'Transaction deleted successfully',
      transactionId,
      deletedTransaction: {
        name: transactionToDelete.name || transactionToDelete.merchant_name,
        amount: transactionToDelete.amount,
        date: transactionToDelete.date,
      },
    });

  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}


