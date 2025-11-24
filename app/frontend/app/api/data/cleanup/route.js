import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { runAutomaticCleanup } from '@/lib/dataRetention';

export async function POST(req) {
  const authResult = authenticate(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const result = runAutomaticCleanup();

    return NextResponse.json({
      success: true,
      message: 'Automatic cleanup completed',
      ...result,
    });
  } catch (error) {
    console.error('Error running cleanup:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run cleanup' },
      { status: 500 }
    );
  }
}

