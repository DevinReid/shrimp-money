import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * GET /api/plaid/rules
 * List all categorization rules
 */
export async function GET(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json({
        rules: [],
        message: 'Database not available. Run: npx prisma db push && npx prisma generate',
      });
    }

    const rules = await prisma.plaidCategorizationRule.findMany({
      orderBy: [
        { priority: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Error fetching rules:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/plaid/rules
 * Create a new categorization rule
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
    const { name, patterns, category, matchType = 'contains', matchAmounts, autoApply = true, priority = 0 } = body;

    if (!name || !patterns || !category) {
      return NextResponse.json(
        { error: 'Name, patterns, and category are required' },
        { status: 400 }
      );
    }

    // Ensure patterns is an array
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    
    if (patternsArray.length === 0) {
      return NextResponse.json(
        { error: 'At least one pattern is required' },
        { status: 400 }
      );
    }

    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json(
        { error: 'Database not available. Run: npx prisma db push && npx prisma generate' },
        { status: 500 }
      );
    }

    const ruleData = {
      name,
      patterns: patternsArray,
      category,
      matchType,
      autoApply,
      priority,
    };
    
    // Add matchAmounts if provided (array of amounts)
    if (matchAmounts && matchAmounts.length > 0) {
      ruleData.matchAmounts = matchAmounts.map(amt => parseFloat(amt)).filter(amt => !isNaN(amt));
    }

    const rule = await prisma.plaidCategorizationRule.create({
      data: ruleData,
    });

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('Error creating rule:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

