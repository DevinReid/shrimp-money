import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { verifyMFAToken, enableMFA, findUserById, generateMFAToken } from '@/lib/auth';

export async function POST(req) {
  const authResult = authenticate(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const { token } = await req.json();
    const userId = authResult.user.userId;

    console.log(`🔐 MFA verify request - User ID: ${userId}, Token provided: ${!!token}`);

    if (!token) {
      console.error('❌ MFA token is required');
      return NextResponse.json(
        { error: 'MFA token is required' },
        { status: 400 }
      );
    }

    const isValid = await verifyMFAToken(userId, token);

    if (!isValid) {
      console.error(`❌ MFA token verification failed for user: ${userId}`);
      return NextResponse.json(
        { error: 'Invalid MFA token' },
        { status: 400 }
      );
    }
    
    console.log(`✅ MFA token verified successfully for user: ${userId}`);

    // Enable MFA for user
    await enableMFA(userId);

    // Generate new token with MFA verified flag
    const user = await findUserById(userId);
    const { password, mfaSecret, ...userWithoutSecrets } = user;
    const mfaToken = generateMFAToken(userWithoutSecrets);

    return NextResponse.json({
      success: true,
      user: userWithoutSecrets,
      token: mfaToken,
      message: 'MFA verified and enabled successfully',
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify MFA token' },
      { status: 500 }
    );
  }
}

