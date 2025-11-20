import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client, readItems, saveAccountData } from '@/lib/plaid';

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

    if (itemsData.items.length === 0) {
      return NextResponse.json(
        { error: 'No items found. Please link an account first.' },
        { status: 404 }
      );
    }

    // Get the first item (you can modify this to support multiple items)
    const item = itemsData.items[0];
    const access_token = item.access_token;

    const response = await client.accountsGet({
      access_token: access_token,
    });

    // Save account data
    saveAccountData(item.item_id, response.data);

    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    }, { status: 500 });
  }
}

