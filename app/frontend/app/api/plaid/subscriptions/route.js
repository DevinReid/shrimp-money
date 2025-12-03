import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client, readItems, readTransactionData } from '@/lib/plaid';
const { detectSubscriptions, predictUpcomingPayments } = require('@/lib/subscriptionDetector');
const prisma = require('@/lib/prisma');

/**
 * Analyze transactions and detect subscriptions
 * Optionally fetches historical data if not already cached
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
    const { searchParams } = new URL(req.url);
    const fetchHistory = searchParams.get('fetch_history') === 'true';
    const predictionDays = parseInt(searchParams.get('prediction_days') || '30');

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

    let transactions = [];

    // Try to read from cache first (database)
    if (prisma) {
      try {
        const dbData = await prisma.plaidTransactionData.findUnique({
          where: { itemId: item.item_id },
        });
        if (dbData && dbData.transactions) {
          transactions = Array.isArray(dbData.transactions) 
            ? dbData.transactions 
            : (dbData.transactions.transactions || []);
          console.log(`📊 Using ${transactions.length} cached transactions from database`);
        }
      } catch (dbError) {
        console.log('⚠️ Could not read from database:', dbError.message);
      }
    }

    // Try file storage as fallback
    if (transactions.length === 0) {
      const cachedData = readTransactionData(item.item_id);
      if (cachedData && cachedData.transactions) {
        transactions = cachedData.transactions;
        console.log(`📊 Using ${transactions.length} cached transactions from file storage`);
      }
    }

    // If fetch_history is true, fetch from Plaid (explicit permission)
    if (fetchHistory) {
      console.log('\n' + '='.repeat(60));
      console.log('🔴 PULLING INFORMATION FROM PLAID API');
      console.log('='.repeat(60));
      console.log('⚠️  This will incur API costs!');
      console.log('='.repeat(60) + '\n');
      
      const now = new Date();
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      let allTransactions = [];
      let hasMore = true;
      let cursor = null;

      while (hasMore) {
        const request = {
          access_token: item.access_token,
          start_date: oneYearAgo.toISOString().split('T')[0],
          end_date: now.toISOString().split('T')[0],
        };

        if (cursor) {
          request.cursor = cursor;
        }

        const response = await client.transactionsGet(request);
        const data = response.data;

        allTransactions = allTransactions.concat(data.transactions || []);
        hasMore = data.has_more || false;
        cursor = data.next_cursor || null;

        if (allTransactions.length > 10000) {
          console.warn('⚠️ Reached 10,000 transaction limit');
          break;
        }
      }

      transactions = allTransactions;
      console.log(`✅ Fetched ${transactions.length} transactions from Plaid`);
    }

    // If no cached data and not explicitly requesting history, return error
    if (transactions.length === 0 && !fetchHistory) {
      return NextResponse.json(
        { 
          error: 'No cached transaction data found. Please click "Refresh with Full History" to fetch data from Plaid.',
          requiresRefresh: true,
        },
        { status: 404 }
      );
    }

    // If still no data after explicit fetch, return error
    if (transactions.length === 0) {
      return NextResponse.json(
        { error: 'No transactions found. Please link an account and wait for transactions to sync.' },
        { status: 404 }
      );
    }

    // Detect subscriptions
    const subscriptions = detectSubscriptions(transactions);

    // Predict upcoming payments
    const predictionEndDate = new Date();
    predictionEndDate.setDate(predictionEndDate.getDate() + predictionDays);
    const predictions = predictUpcomingPayments(subscriptions, predictionEndDate);

    return NextResponse.json({
      success: true,
      subscriptions: subscriptions,
      predictions: predictions,
      analysis: {
        totalTransactions: transactions.length,
        subscriptionCount: subscriptions.length,
        totalMonthlySubscriptions: subscriptions
          .filter(s => s.frequency === 'monthly')
          .reduce((sum, s) => sum + s.amount, 0),
      },
    });
  } catch (error) {
    console.error('Error analyzing subscriptions:', error);
    return NextResponse.json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    }, { status: 500 });
  }
}

