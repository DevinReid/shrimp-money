import { NextResponse } from 'next/server';

/**
 * OAuth Callback Route for Plaid
 * 
 * This route handles the OAuth redirect from Plaid after a user
 * authenticates with an OAuth-enabled institution.
 * 
 * Flow:
 * 1. User selects OAuth institution in Plaid Link
 * 2. Plaid redirects to institution's OAuth page
 * 3. Institution redirects back here with oauth_state_id
 * 4. We redirect to the frontend with the oauth_state_id
 * 5. Frontend continues the Plaid Link flow
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const oauthStateId = searchParams.get('oauth_state_id');
  const error = searchParams.get('error');
  const errorMessage = searchParams.get('error_message');

  // Handle OAuth errors
  if (error) {
    const errorUrl = new URL('/', req.url);
    errorUrl.searchParams.set('oauth_error', 'true');
    if (errorMessage) {
      errorUrl.searchParams.set('error_message', errorMessage);
    }
    return NextResponse.redirect(errorUrl);
  }

  // If no oauth_state_id, redirect to home
  if (!oauthStateId) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Redirect to frontend with oauth_state_id
  // The frontend will handle continuing the Plaid Link flow
  const redirectUrl = new URL('/', req.url);
  redirectUrl.searchParams.set('oauth_state_id', oauthStateId);
  
  return NextResponse.redirect(redirectUrl);
}

