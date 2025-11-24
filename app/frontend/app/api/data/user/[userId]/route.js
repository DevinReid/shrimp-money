import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/middleware/auth';
import { deleteUserAccount } from '@/lib/dataRetention';

export async function DELETE(req, { params }) {
  const authResult = authenticate(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const { userId } = params;
    const authenticatedUserId = authResult.user.userId;

    // Users can only delete their own account
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only delete your own account' },
        { status: 403 }
      );
    }

    const result = deleteUserAccount(userId);

    return NextResponse.json({
      success: true,
      message: 'User account and all associated data deleted successfully',
      deletedItems: result.deletedItems,
    });
  } catch (error) {
    console.error('Error deleting user account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user account' },
      { status: 500 }
    );
  }
}

