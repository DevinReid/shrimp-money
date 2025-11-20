import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client } from '@/lib/plaid';

export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const request = {
      user: {
        client_user_id: 'user_' + Date.now(),
      },
      client_name: 'Bank Connect',
      products: ['transactions', 'auth'],
      language: 'en',
      country_codes: ['US'],
    };

    const response = await client.linkTokenCreate(request);
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', error);
    
    // Log more details for debugging
    if (error.response?.data) {
      console.error('Plaid API Error:', error.response.data);
    }
    
    // Check if it's a credentials issue
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SANDBOX_SECRET) {
      return NextResponse.json({
        error: {
          error_code: 'MISSING_CREDENTIALS',
          error_message: 'Plaid credentials not configured. Please set PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET in .env.local',
        },
      }, { status: 500 });
    }
    
    return NextResponse.json({
      error: {
        error_code: error.response?.data?.error_code || 'PLAID_ERROR',
        error_message: error.response?.data?.error_message || error.message,
      },
    }, { status: 500 });
  }
}

