import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * PUT /api/plaid/transactions/:transactionId/note
 * Update or set note for a transaction
 */
export async function PUT(req, { params }) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    // Handle both sync and async params (Next.js 13+)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { transactionId } = resolvedParams;
    const { note } = await req.json();

    if (note === undefined || note === null) {
      return NextResponse.json(
        { error: 'Note is required' },
        { status: 400 }
      );
    }

    // Allow empty string to clear note
    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    if (!prisma || !prisma.plaidTransactionNote) {
      return NextResponse.json(
        { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
        { status: 500 }
      );
    }

    // If note is empty, delete the record
    if (trimmedNote === '') {
      try {
        await prisma.plaidTransactionNote.delete({
          where: { transactionId },
        });
      } catch (deleteError) {
        // If record doesn't exist, that's fine - it's already cleared
        if (deleteError.code !== 'P2025') {
          throw deleteError;
        }
      }

      return NextResponse.json({
        success: true,
        transactionId,
        note: null,
        message: 'Note cleared',
      });
    }

    // Upsert the note
    const result = await prisma.plaidTransactionNote.upsert({
      where: { transactionId },
      update: {
        note: trimmedNote,
        updatedAt: new Date(),
      },
      create: {
        transactionId,
        note: trimmedNote,
      },
    });

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      note: result.note,
    });
  } catch (error) {
    console.error('Error updating transaction note:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * GET /api/plaid/transactions/:transactionId/note
 * Get note for a transaction
 */
export async function GET(req, { params }) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    // Handle both sync and async params (Next.js 13+)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { transactionId } = resolvedParams;

    if (!prisma || !prisma.plaidTransactionNote) {
      return NextResponse.json(
        { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
        { status: 500 }
      );
    }

    const noteRecord = await prisma.plaidTransactionNote.findUnique({
      where: { transactionId },
    });

    return NextResponse.json({
      success: true,
      transactionId,
      note: noteRecord?.note || null,
    });
  } catch (error) {
    console.error('Error fetching transaction note:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * DELETE /api/plaid/transactions/:transactionId/note
 * Remove note from a transaction
 */
export async function DELETE(req, { params }) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    // Handle both sync and async params (Next.js 13+)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { transactionId } = resolvedParams;

    if (!prisma || !prisma.plaidTransactionNote) {
      return NextResponse.json(
        { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
        { status: 500 }
      );
    }

    await prisma.plaidTransactionNote.delete({
      where: { transactionId },
    });

    return NextResponse.json({
      success: true,
      message: 'Note removed',
    });
  } catch (error) {
    // If record doesn't exist, that's fine - it's already removed
    if (error.code === 'P2025') {
      return NextResponse.json({
        success: true,
        message: 'Note removed',
      });
    }

    console.error('Error removing transaction note:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}




