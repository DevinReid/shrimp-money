import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client, readItems, saveAccountData, readAccountData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

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
    const forceRefresh = searchParams.get('refresh') === 'true';

    const itemsData = readItems();
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

    // Try to get cached data from database first
    if (!forceRefresh && prisma) {
      try {
        const cachedData = await prisma.plaidAccountData.findUnique({
          where: { itemId: item.item_id },
        });

        if (cachedData && cachedData.accounts) {
          console.log('📦 Returning cached account data from database');
          return NextResponse.json({
            ...cachedData.accounts,
            cached: true,
            lastFetched: cachedData.lastFetched,
          });
        }
      } catch (dbError) {
        console.log('⚠️ Could not read from database:', dbError.message);
      }
    }

    // Try file storage as fallback (if not forcing refresh)
    if (!forceRefresh) {
      const fileData = readAccountData(item.item_id);
      if (fileData && fileData.accounts) {
        console.log('📦 Returning cached account data from file storage');
        return NextResponse.json({
          ...fileData.accounts,
          cached: true,
          lastFetched: fileData.lastUpdated,
        });
      }
    }

    // If no cached data and not forcing refresh, return error
    if (!forceRefresh) {
      return NextResponse.json(
        { 
          error: 'No cached account data found. Please click "Refresh Accounts from Plaid" to fetch data.',
          requiresRefresh: true,
        },
        { status: 404 }
      );
    }

    // ONLY fetch from Plaid if explicitly requested (refresh=true)
    console.log('\n' + '='.repeat(60));
    console.log('🔴 PULLING INFORMATION FROM PLAID API');
    console.log('='.repeat(60));
    console.log('⚠️  This will incur API costs!');
    console.log('='.repeat(60) + '\n');

    const response = await client.accountsGet({
      access_token: item.access_token,
    });

    const accountData = response.data;

    // Save to database
    if (prisma) {
      try {
        await prisma.plaidAccountData.upsert({
          where: { itemId: item.item_id },
          update: {
            accounts: accountData,
            lastFetched: new Date(),
          },
          create: {
            itemId: item.item_id,
            accounts: accountData,
            lastFetched: new Date(),
          },
        });
        console.log('✅ Saved account data to database');
      } catch (dbError) {
        console.error('⚠️ Could not save to database, falling back to file storage:', dbError.message);
        saveAccountData(item.item_id, accountData);
      }
    } else {
      saveAccountData(item.item_id, accountData);
    }

    return NextResponse.json({
      ...accountData,
      cached: false,
      lastFetched: new Date().toISOString(),
    });
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
