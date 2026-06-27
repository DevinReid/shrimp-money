import { NextResponse } from 'next/server';
import { loginUser, generateToken } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

// More lenient rate limiting for development - 10 attempts per 15 minutes
const authLimiter = rateLimit(15 * 60 * 1000, 10);

export async function POST(req) {
  // Check rate limit
  const rateLimitError = await authLimiter(req);
  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.error },
      { status: rateLimitError.status }
    );
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await loginUser(username, password);
    const token = generateToken(user);

    return NextResponse.json({
      success: true,
      user,
      token,
      mfaRequired: user.mfaEnabled,
      message: user.mfaEnabled 
        ? 'Please verify MFA code' 
        : 'Login successful. Please set up MFA for enhanced security.',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    );
  }
}

