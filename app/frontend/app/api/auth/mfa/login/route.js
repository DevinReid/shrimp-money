import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { verifyMFAToken, findUserById, generateMFAToken } from '@/lib/auth';

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

    if (!token) {
      return NextResponse.json(
        { error: 'MFA token is required' },
        { status: 400 }
      );
    }

    const isValid = verifyMFAToken(userId, token);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid MFA token' },
        { status: 400 }
      );
    }

    // Generate new token with MFA verified flag
    const user = findUserById(userId);
    const { password, mfaSecret, ...userWithoutSecrets } = user;
    const mfaToken = generateMFAToken(userWithoutSecrets);

    return NextResponse.json({
      success: true,
      user: userWithoutSecrets,
      token: mfaToken,
      message: 'MFA verified successfully',
    });
  } catch (error) {
    console.error('MFA login verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify MFA token' },
      { status: 500 }
    );
  }
}

