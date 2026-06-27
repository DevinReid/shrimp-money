import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * POST /api/plaid/recurring-payments/suggestions/dismiss
 * Dismiss a recurring payment suggestion (mark as invalid/not needed)
 */
export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const body = await req.json();
    const { merchant, category } = body;

    if (!merchant || !category) {
      return NextResponse.json({
        error: 'Merchant and category are required',
      }, { status: 400 });
    }

    // Check if already dismissed
    const existing = await prisma.plaidDismissedSuggestion.findFirst({
      where: {
        merchant: merchant.trim(),
        category: category.trim(),
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'Suggestion already dismissed',
        dismissedSuggestion: existing,
      });
    }

    // Create dismissed suggestion record
    const dismissedSuggestion = await prisma.plaidDismissedSuggestion.create({
      data: {
        merchant: merchant.trim(),
        category: category.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Suggestion dismissed',
      dismissedSuggestion: {
        ...dismissedSuggestion,
        createdAt: dismissedSuggestion.createdAt?.toISOString(),
        updatedAt: dismissedSuggestion.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error dismissing suggestion:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

