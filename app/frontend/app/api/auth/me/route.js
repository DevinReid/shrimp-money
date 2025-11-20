import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { findUserById } from '@/lib/auth';

export async function GET(req) {
  const authResult = authenticate(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const user = findUserById(authResult.user.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const { password, mfaSecret, ...userWithoutSecrets } = user;
    return NextResponse.json({
      success: true,
      user: userWithoutSecrets,
      mfaVerified: authResult.user.mfaVerified || false,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user information' },
      { status: 500 }
    );
  }
}

