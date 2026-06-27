import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

const RECURRING_CATEGORIES = ['Income', 'Subscription', 'Bill', 'Credit Card'];

/**
 * Calculate next payment date based on frequency
 */
function calculateNextPaymentDate(lastPaymentDate, frequency, frequencyDays, dayOfMonth, dayOfWeek) {
  const last = new Date(lastPaymentDate);
  const next = new Date(last);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'bi-weekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'custom':
      next.setDate(next.getDate() + (frequencyDays || 30));
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  
  return next;
}

/**
 * GET /api/plaid/recurring-payments/[id]
 * Get a specific recurring payment
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
    const { id } = await params;
    
    const recurringPayment = await prisma.plaidRecurringPayment.findUnique({
      where: { id },
    });

    if (!recurringPayment) {
      return NextResponse.json({
        error: 'Recurring payment not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      recurringPayment: {
        ...recurringPayment,
        startDate: recurringPayment.startDate?.toISOString(),
        endDate: recurringPayment.endDate?.toISOString(),
        lastPaymentDate: recurringPayment.lastPaymentDate?.toISOString(),
        nextPaymentDate: recurringPayment.nextPaymentDate?.toISOString(),
        createdAt: recurringPayment.createdAt?.toISOString(),
        updatedAt: recurringPayment.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching recurring payment:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * PUT /api/plaid/recurring-payments/[id]
 * Update a recurring payment
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
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      merchantName,
      merchantAliases,
      addAlias, // New field: add a single alias to existing aliases
      category,
      amount,
      frequency,
      frequencyDays,
      dayOfMonth,
      dayOfWeek,
      startDate,
      endDate,
      lastPaymentDate,
      nextPaymentDate,
      isActive,
      notes,
    } = body;

    // Check if payment exists
    const existing = await prisma.plaidRecurringPayment.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({
        error: 'Recurring payment not found',
      }, { status: 404 });
    }

    // Build update data
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (merchantName !== undefined) updateData.merchantName = merchantName;
    
    // Handle merchant aliases
    if (merchantAliases !== undefined) {
      // Replace all aliases
      updateData.merchantAliases = merchantAliases;
    } else if (addAlias) {
      // Add a new alias to existing ones
      const currentAliases = existing.merchantAliases || [];
      const aliasArray = Array.isArray(currentAliases) ? currentAliases : [];
      const newAlias = addAlias.toLowerCase().trim();
      
      // Only add if not already present
      if (!aliasArray.some(a => a.toLowerCase() === newAlias)) {
        updateData.merchantAliases = [...aliasArray, addAlias.trim()];
      }
    }
    
    if (category !== undefined) {
      if (!RECURRING_CATEGORIES.includes(category)) {
        return NextResponse.json({
          error: `Category must be one of: ${RECURRING_CATEGORIES.join(', ')}`,
        }, { status: 400 });
      }
      updateData.category = category;
    }
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (frequency !== undefined) updateData.frequency = frequency;
    if (frequencyDays !== undefined) updateData.frequencyDays = frequencyDays ? parseInt(frequencyDays) : null;
    if (dayOfMonth !== undefined) updateData.dayOfMonth = dayOfMonth ? parseInt(dayOfMonth) : null;
    if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek ? parseInt(dayOfWeek) : null;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (lastPaymentDate !== undefined) updateData.lastPaymentDate = lastPaymentDate ? new Date(lastPaymentDate) : null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (notes !== undefined) updateData.notes = notes;

    // Recalculate next payment date if relevant fields changed
    if (nextPaymentDate !== undefined) {
      updateData.nextPaymentDate = nextPaymentDate ? new Date(nextPaymentDate) : null;
    } else if (lastPaymentDate !== undefined || frequency !== undefined || frequencyDays !== undefined) {
      const lastDate = lastPaymentDate 
        ? new Date(lastPaymentDate) 
        : existing.lastPaymentDate 
        || existing.startDate;
      
      updateData.nextPaymentDate = calculateNextPaymentDate(
        lastDate,
        frequency || existing.frequency,
        frequencyDays !== undefined ? frequencyDays : existing.frequencyDays,
        dayOfMonth !== undefined ? dayOfMonth : existing.dayOfMonth,
        dayOfWeek !== undefined ? dayOfWeek : existing.dayOfWeek
      );
    }

    const updated = await prisma.plaidRecurringPayment.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      recurringPayment: {
        ...updated,
        startDate: updated.startDate?.toISOString(),
        endDate: updated.endDate?.toISOString(),
        lastPaymentDate: updated.lastPaymentDate?.toISOString(),
        nextPaymentDate: updated.nextPaymentDate?.toISOString(),
        createdAt: updated.createdAt?.toISOString(),
        updatedAt: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating recurring payment:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * DELETE /api/plaid/recurring-payments/[id]
 * Delete a recurring payment (or mark as inactive)
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
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get('permanent') === 'true';

    // Check if payment exists
    const existing = await prisma.plaidRecurringPayment.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({
        error: 'Recurring payment not found',
      }, { status: 404 });
    }

    if (permanent) {
      // Permanently delete
      await prisma.plaidRecurringPayment.delete({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        message: 'Recurring payment permanently deleted',
      });
    } else {
      // Soft delete (mark as inactive)
      await prisma.plaidRecurringPayment.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        message: 'Recurring payment marked as inactive',
      });
    }
  } catch (error) {
    console.error('Error deleting recurring payment:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

