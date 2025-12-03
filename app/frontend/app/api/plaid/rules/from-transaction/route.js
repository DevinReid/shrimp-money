import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
const prisma = require('@/lib/prisma');

/**
 * POST /api/plaid/rules/from-transaction
 * Create a rule from a transaction (quick rule creation)
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
    const { transactionName, merchantName, category, autoApply = true, ruleName, matchAmount } = body;

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    if (!transactionName && !merchantName) {
      return NextResponse.json(
        { error: 'Either transactionName or merchantName is required' },
        { status: 400 }
      );
    }

    if (!prisma || !prisma.plaidCategorizationRule) {
      return NextResponse.json(
        { error: 'Database not available. Run: npx prisma db push && npx prisma generate' },
        { status: 500 }
      );
    }

    // Extract a good pattern from the transaction name
    const extractPattern = (name) => {
      if (!name) return null;
      
      // Remove common prefixes
      let pattern = name;
      const prefixes = [
        'Debit Card Purchase - ',
        'Digital Card Purchase - ',
        'Withdrawal from ',
        'Deposit from ',
        'ATM Withdrawal - ',
        'Check Deposit (',
      ];
      
      for (const prefix of prefixes) {
        if (pattern.startsWith(prefix)) {
          pattern = pattern.substring(prefix.length);
          break;
        }
      }
      
      // Remove location suffixes (city, state patterns like "NEW ORLEANS LA")
      pattern = pattern.replace(/\s+[A-Z]{2,}\s+[A-Z]{2}$/g, '').trim();
      pattern = pattern.replace(/\s+[A-Z]{2}$/g, '').trim();
      
      // Remove trailing numbers/codes (like "B26C99260")
      pattern = pattern.replace(/\s*[\*#][A-Z0-9]+$/gi, '').trim();
      
      // Take meaningful part (first 30 chars max)
      if (pattern.length > 30) {
        // Try to find a natural break point
        const spaceIndex = pattern.indexOf(' ', 15);
        if (spaceIndex > 0 && spaceIndex < 30) {
          pattern = pattern.substring(0, spaceIndex);
        } else {
          pattern = pattern.substring(0, 30);
        }
      }
      
      return pattern.trim();
    };

    // Build patterns array
    const patterns = [];
    
    // Add merchant name as pattern (usually cleaner)
    if (merchantName) {
      patterns.push(merchantName);
    }
    
    // Add extracted pattern from transaction name
    const extractedPattern = extractPattern(transactionName);
    if (extractedPattern && !patterns.includes(extractedPattern)) {
      patterns.push(extractedPattern);
    }
    
    // If we still have the full transaction name and it's different, add first significant word
    if (transactionName) {
      const words = transactionName.split(/\s+/).filter(w => w.length > 3);
      if (words.length > 0 && !patterns.some(p => p.toUpperCase().includes(words[0].toUpperCase()))) {
        // Don't add if it's a common word
        const commonWords = ['DEBIT', 'CARD', 'PURCHASE', 'WITHDRAWAL', 'FROM', 'PAYMENT'];
        if (!commonWords.includes(words[0].toUpperCase())) {
          patterns.push(words[0]);
        }
      }
    }

    if (patterns.length === 0) {
      return NextResponse.json(
        { error: 'Could not extract a pattern from the transaction' },
        { status: 400 }
      );
    }

    // Create a name for the rule (use provided name or generate one)
    const finalRuleName = ruleName || merchantName || extractedPattern || patterns[0];

    // Check if similar rule already exists
    const existingRules = await prisma.plaidCategorizationRule.findMany({
      where: { category },
    });

    for (const existing of existingRules) {
      const existingPatterns = Array.isArray(existing.patterns) ? existing.patterns : [];
      const matchesExisting = patterns.some(p => 
        existingPatterns.some(ep => 
          ep.toUpperCase().includes(p.toUpperCase()) || p.toUpperCase().includes(ep.toUpperCase())
        )
      );
      
      if (matchesExisting) {
        // Add new patterns to existing rule
        const newPatterns = [...new Set([...existingPatterns, ...patterns])];
        
        const updated = await prisma.plaidCategorizationRule.update({
          where: { id: existing.id },
          data: { patterns: newPatterns },
        });
        
        return NextResponse.json({
          success: true,
          action: 'updated',
          rule: updated,
          message: `Added patterns to existing rule "${existing.name}"`,
        });
      }
    }

    // Create new rule
    const ruleData = {
      name: finalRuleName,
      patterns,
      category,
      matchType: 'contains',
      autoApply,
      priority: matchAmount ? 10 : 0, // Give amount-specific rules higher priority
    };
    
    // If matchAmount is provided, add it to matchAmounts array (for subscription-like matching)
    if (matchAmount !== undefined && matchAmount !== null) {
      ruleData.matchAmounts = [parseFloat(matchAmount)];
    }
    
    const rule = await prisma.plaidCategorizationRule.create({
      data: ruleData,
    });

    return NextResponse.json({
      success: true,
      action: 'created',
      rule,
      message: `Created new rule "${finalRuleName}" for category "${category}"${matchAmount ? ` (amount: $${matchAmount})` : ''}`,
    });

  } catch (error) {
    console.error('Error creating rule from transaction:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

