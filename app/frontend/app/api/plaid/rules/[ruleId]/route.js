import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * GET /api/plaid/rules/[ruleId]
 * Get a single rule
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
    const { ruleId } = resolvedParams;

    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const rule = await prisma.plaidCategorizationRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Error fetching rule:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/plaid/rules/[ruleId]
 * Update a rule
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
    const { ruleId } = resolvedParams;
    
    if (!ruleId) {
      return NextResponse.json(
        { error: 'Rule ID is required' },
        { status: 400 }
      );
    }
    
    const body = await req.json();
    const { name, patterns, category, matchType, matchAmounts, excludedTransactions, autoApply, priority, isActive } = body;

    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (patterns !== undefined) updateData.patterns = Array.isArray(patterns) ? patterns : [patterns];
    if (category !== undefined) updateData.category = category;
    if (matchType !== undefined) updateData.matchType = matchType;
    // matchAmounts should be an array of numbers, or null to clear
    if (matchAmounts !== undefined) {
      updateData.matchAmounts = matchAmounts && matchAmounts.length > 0 
        ? matchAmounts.map(amt => parseFloat(amt)).filter(amt => !isNaN(amt))
        : null;
    }
    // excludedTransactions should be an array
    if (excludedTransactions !== undefined) {
      updateData.excludedTransactions = Array.isArray(excludedTransactions) 
        ? excludedTransactions 
        : (excludedTransactions ? [excludedTransactions] : []);
    }
    if (autoApply !== undefined) updateData.autoApply = autoApply;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    const rule = await prisma.plaidCategorizationRule.update({
      where: { id: ruleId },
      data: updateData,
    });

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('Error updating rule:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/plaid/rules/[ruleId]
 * Delete a rule
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
    const { ruleId } = resolvedParams;

    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    await prisma.plaidCategorizationRule.delete({
      where: { id: ruleId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting rule:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

