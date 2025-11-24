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
    const body = await req.json().catch(() => ({}));
    const oauthStateId = body.oauth_state_id;

    // Get the base URL for OAuth redirect
    // In production Plaid, redirect_uri MUST use HTTPS
    // For local testing, use ngrok or set PLAID_OAUTH_REDIRECT_URI to an HTTPS URL
    const baseUrl = process.env.PLAID_OAUTH_REDIRECT_URI || 
                    process.env.NEXT_PUBLIC_APP_URL ||
                    (req.headers.get('origin') || 
                     `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host') || 'localhost:4000'}`);
    
    const redirectUri = `${baseUrl}/api/plaid/oauth/callback`;
    
    // Check if we're in production mode and redirect URI is HTTP (not allowed)
    const isProduction = process.env.PLAID_ENV === 'production';
    const isHttp = redirectUri.startsWith('http://');
    
    if (isProduction && isHttp) {
      return NextResponse.json({
        error: {
          error_code: 'INVALID_REDIRECT_URI',
          error_message: 'Production Plaid requires HTTPS for OAuth redirect URIs. For local testing, use ngrok or set PLAID_OAUTH_REDIRECT_URI to an HTTPS URL. See docs for setup instructions.',
        },
      }, { status: 400 });
    }

    const request = {
      user: {
        client_user_id: 'user_' + Date.now(),
      },
      client_name: 'Bank Connect',
      products: ['transactions'], // Removed 'auth' - not available in production account
      language: 'en',
      country_codes: ['US'],
      redirect_uri: redirectUri,
    };

    // If we have an OAuth state ID, include it in the request
    // This is used when continuing an OAuth flow after redirect
    if (oauthStateId) {
      request.oauth_state_id = oauthStateId;
    }

    console.log('🔗 Creating Plaid link token...', { 
      hasOAuthStateId: !!oauthStateId,
      redirectUri,
      isProduction: isProduction 
    });
    
    const response = await client.linkTokenCreate(request);
    console.log('✅ Plaid link token created successfully');
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('❌ Error creating link token:', error);
    
    // Log more details for debugging
    if (error.response?.data) {
      console.error('❌ Plaid API Error:', JSON.stringify(error.response.data, null, 2));
    }
    
    // Check if it's a credentials issue
    const isProduction = process.env.PLAID_ENV === 'production';
    const hasCredentials = isProduction 
      ? (process.env.PLAID_CLIENT_ID && process.env.PLAID_PRODUCTION_SECRET)
      : (process.env.PLAID_CLIENT_ID && process.env.PLAID_SANDBOX_SECRET);
    
    if (!hasCredentials) {
      console.error('❌ Missing Plaid credentials');
      return NextResponse.json({
        error: {
          error_code: 'MISSING_CREDENTIALS',
          error_message: `Plaid credentials not configured. Please set PLAID_CLIENT_ID and ${isProduction ? 'PLAID_PRODUCTION_SECRET' : 'PLAID_SANDBOX_SECRET'} in environment variables`,
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

