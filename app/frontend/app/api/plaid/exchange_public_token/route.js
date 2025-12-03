import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client, readItems, saveItems } from '@/lib/plaid';

export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const { public_token } = await req.json();

    if (!public_token) {
      return NextResponse.json(
        { error: 'public_token is required' },
        { status: 400 }
      );
    }

    const response = await client.itemPublicTokenExchange({
      public_token: public_token,
    });

    const { access_token, item_id } = response.data;

    // Save item information with environment tracking
    const itemsData = readItems();
    const existingItemIndex = itemsData.items.findIndex(
      (item) => item.item_id === item_id
    );

    const currentEnv = process.env.PLAID_ENV || 'sandbox';
    const itemData = {
      item_id,
      access_token,
      environment: currentEnv, // Track which environment this token is for
      created_at: new Date().toISOString(),
    };

    if (existingItemIndex >= 0) {
      itemsData.items[existingItemIndex] = itemData;
    } else {
      itemsData.items.push(itemData);
    }

    saveItems(itemsData);

    return NextResponse.json({
      success: true,
      item_id,
      message: 'Public token exchanged successfully',
    });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    return NextResponse.json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    }, { status: 500 });
  }
}

