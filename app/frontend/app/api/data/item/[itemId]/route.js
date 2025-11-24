import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { deleteItemData } from '@/lib/dataRetention';

export async function DELETE(req, { params }) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const { itemId } = params;
    deleteItemData(itemId);

    return NextResponse.json({
      success: true,
      message: 'Plaid item and all associated data deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete item' },
      { status: 500 }
    );
  }
}

