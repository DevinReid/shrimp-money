import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';

/**
 * Check if there's an existing Plaid connection
 * Returns the item_id if connected, null otherwise
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
    const itemsData = readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';

    // Filter items by current environment
    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) {
        return currentEnv === 'sandbox';
      }
      return item.environment === currentEnv;
    });

    if (matchingItems.length === 0) {
      return NextResponse.json({
        connected: false,
        item_id: null,
        message: 'No Plaid connection found',
      });
    }

    // Get the most recent item
    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    return NextResponse.json({
      connected: true,
      item_id: item.item_id,
      created_at: item.created_at,
      environment: item.environment || currentEnv,
    });
  } catch (error) {
    console.error('Error checking connection status:', error);
    return NextResponse.json({
      connected: false,
      error: error.message,
    }, { status: 500 });
  }
}



