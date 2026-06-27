import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { findUserById, generateMFASecret, saveMFASecret, generateQRCode } from '@/lib/auth';

export async function POST(req) {
  const authResult = authenticate(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const userId = authResult.user.userId;
    console.log(`🔐 MFA setup request - User ID: ${userId}`);
    
    const user = await findUserById(userId);

    if (!user) {
      console.error(`❌ User not found: ${userId}`);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log(`📋 User MFA status - Enabled: ${user.mfaEnabled}, Has Secret: ${!!user.mfaSecret}`);
    
    if (user.mfaEnabled) {
      console.error(`❌ MFA already enabled for user: ${userId}`);
      return NextResponse.json(
        { error: 'MFA is already enabled for this user' },
        { status: 400 }
      );
    }
    
    console.log(`✅ MFA setup allowed - proceeding to generate secret`);

    const { secret, qrCodeUrl } = generateMFASecret(user.username);
    await saveMFASecret(userId, secret);

    // Generate QR code image
    const qrCodeDataUrl = await generateQRCode(qrCodeUrl);

    return NextResponse.json({
      success: true,
      secret, // For manual entry if QR code fails
      qrCode: qrCodeDataUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a code.',
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return NextResponse.json(
      { error: 'Failed to set up MFA' },
      { status: 500 }
    );
  }
}

