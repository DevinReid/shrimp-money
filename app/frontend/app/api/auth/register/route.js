import { NextResponse } from 'next/server';
import { registerUser, generateToken } from '@/lib/auth';
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

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const user = await registerUser(username, password);
    const token = generateToken(user);

    return NextResponse.json({
      success: true,
      user,
      token,
      message: 'User registered successfully. Please set up MFA.',
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

