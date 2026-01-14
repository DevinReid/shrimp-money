import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

const PREDEFINED_CATEGORIES = [
  'Subscription',
  'One-time Purchase',
  'Bill',
  'Transfer',
  'Income',
  'Other',
  'Uncategorized',
];

/**
 * PUT /api/plaid/transactions/:transactionId/category
 * Update or set category for a transaction
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
    const { category } = await req.json();

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    const trimmedCategory = category.trim();

    // Determine if it's a custom category
    const isCustom = !PREDEFINED_CATEGORIES.includes(trimmedCategory);

    if (!prisma || !prisma.plaidTransactionCategory) {
      return NextResponse.json(
        { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
        { status: 500 }
      );
    }

    // Upsert the category assignment in PlaidTransactionCategory table
    const result = await prisma.plaidTransactionCategory.upsert({
      where: { transactionId },
      update: {
        category: trimmedCategory,
        isCustom,
        updatedAt: new Date(),
      },
      create: {
        transactionId,
        category: trimmedCategory,
        isCustom,
      },
    });

    // ALSO update the normalized PlaidTransaction table to keep userCategory in sync
    // This ensures spending analysis and other features see the category immediately
    if (prisma && prisma.plaidTransaction) {
      try {
        await prisma.plaidTransaction.updateMany({
          where: { transactionId },
          data: { userCategory: trimmedCategory },
        });
        console.log(`✅ Synced category "${trimmedCategory}" to PlaidTransaction table for ${transactionId}`);
      } catch (syncError) {
        // Transaction might not exist in normalized table yet - that's okay
        // It will be synced when the transaction is migrated
        console.log(`⚠️ Could not sync category to PlaidTransaction table: ${syncError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      category: result.category,
      isCustom: result.isCustom,
    });
  } catch (error) {
    console.error('Error updating transaction category:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * DELETE /api/plaid/transactions/:transactionId/category
 * Remove category from a transaction (set to uncategorized)
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

    if (!prisma || !prisma.plaidTransactionCategory) {
      return NextResponse.json(
        { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
        { status: 500 }
      );
    }

    await prisma.plaidTransactionCategory.delete({
      where: { transactionId },
    });

    // ALSO update the normalized PlaidTransaction table to remove the category
    if (prisma && prisma.plaidTransaction) {
      try {
        await prisma.plaidTransaction.updateMany({
          where: { transactionId },
          data: { userCategory: null },
        });
        console.log(`✅ Removed category from PlaidTransaction table for ${transactionId}`);
      } catch (syncError) {
        // Transaction might not exist in normalized table yet - that's okay
        console.log(`⚠️ Could not remove category from PlaidTransaction table: ${syncError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Category removed',
    });
  } catch (error) {
    // If record doesn't exist, that's fine - it's already uncategorized
    if (error.code === 'P2025') {
      return NextResponse.json({
        success: true,
        message: 'Category removed',
      });
    }

    console.error('Error removing transaction category:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

