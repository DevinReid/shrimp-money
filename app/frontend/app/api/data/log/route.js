import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { getDeletionLog } from '@/lib/dataRetention';

export async function GET(req) {
  const authResult = authenticate(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    const log = getDeletionLog(limit);

    return NextResponse.json({
      success: true,
      log,
      count: log.length,
    });
  } catch (error) {
    console.error('Error getting deletion log:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get deletion log' },
      { status: 500 }
    );
  }
}

