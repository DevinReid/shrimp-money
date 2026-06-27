import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

/**
 * POST /api/plaid/transactions/deduplicate
 * Remove duplicate transactions from the database
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
    const itemsData = await readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';

    const matchingItems = itemsData.items.filter(item => {
      if (!item.environment) {
        return currentEnv === 'sandbox';
      }
      return item.environment === currentEnv;
    });

    if (matchingItems.length === 0) {
      return NextResponse.json(
        { error: `No items found for ${currentEnv} environment.` },
        { status: 404 }
      );
    }

    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    if (!prisma || !prisma.plaidTransactionData) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    // Get existing transactions
    const existingData = await prisma.plaidTransactionData.findUnique({
      where: { itemId: item.item_id },
    });

    if (!existingData || !existingData.transactions) {
      return NextResponse.json({
        success: true,
        message: 'No transactions to deduplicate',
        before: 0,
        after: 0,
        removed: 0,
      });
    }

    const transactions = existingData.transactions;
    const beforeCount = transactions.length;

    // Helper to normalize transaction name
    const normalizeTransactionName = (name) => {
      if (!name) return '';
      let normalized = name.toUpperCase();
      
      const prefixes = [
        'DEBIT CARD PURCHASE - ',
        'DIGITAL CARD PURCHASE - ',
        'WITHDRAWAL FROM ',
        'DEPOSIT FROM ',
        'ATM WITHDRAWAL - ',
        'ZELLE MONEY ',
        'CHECK DEPOSIT (',
        'WIRE DEPOSIT',
        'MONTHLY INTEREST PAID',
        'PREAUTHORIZED WITHDRAWAL TO ',
        'PAPER PAYMENT TO ',
        'WITHDRAWAL TO ',
        '360 CHECKING CARD ADJUSTMENT SIGNATURE (CREDIT) ',
        '360 CHECKING CARD ADJUSTMENT SIGNATURE (DEBIT) ',
      ];
      
      for (const prefix of prefixes) {
        if (normalized.startsWith(prefix)) {
          normalized = normalized.substring(prefix.length);
          break;
        }
      }
      
      normalized = normalized.replace(/\s+[A-Z]{2,}\s+[A-Z]{2}$/g, '');
      normalized = normalized.replace(/\s+[A-Z]{2}$/g, '');
      normalized = normalized.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      
      return normalized.substring(0, 15);
    };

    // Get full normalized name for containment matching
    const getFullNormalizedName = (name) => {
      if (!name) return '';
      return name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    };

    // Check if two transactions match by name containment
    const namesMatch = (name1, name2) => {
      const full1 = getFullNormalizedName(name1);
      const full2 = getFullNormalizedName(name2);
      const short1 = normalizeTransactionName(name1);
      const short2 = normalizeTransactionName(name2);
      
      if (short1 === short2) return true;
      if (full1.includes(short2) || full2.includes(short1)) return true;
      if (full1.includes(full2) || full2.includes(full1)) return true;
      
      const words1 = short1.split(' ').filter(w => w.length > 3);
      const words2 = short2.split(' ').filter(w => w.length > 3);
      if (words1.length > 0 && words2.length > 0 && words1[0] === words2[0]) return true;
      
      return false;
    };

    // Create fingerprint for matching (amount + month for grouping)
    const createFingerprint = (t) => {
      const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return `${monthKey}|${amount}`;
    };

    // Group transactions by fingerprint (month + amount), then check name matching within groups
    const fingerprints = new Map();
    const duplicates = [];
    const unique = [];

    transactions.forEach(t => {
      const fp = createFingerprint(t);
      
      if (!fingerprints.has(fp)) {
        fingerprints.set(fp, []);
      }
      fingerprints.get(fp).push(t);
    });

    // For each fingerprint group, further group by name matching
    fingerprints.forEach((group, fp) => {
      if (group.length === 1) {
        unique.push(group[0]);
        return;
      }
      
      // Within same month+amount group, find name-based duplicates
      const nameGroups = [];
      
      group.forEach(t => {
        // Try to find an existing name group that matches
        let foundGroup = null;
        for (const ng of nameGroups) {
          if (namesMatch(t.name || t.merchant_name, ng[0].name || ng[0].merchant_name)) {
            foundGroup = ng;
            break;
          }
        }
        
        if (foundGroup) {
          foundGroup.push(t);
        } else {
          nameGroups.push([t]);
        }
      });
      
      // Process each name group
      nameGroups.forEach(nameGroup => {
        if (nameGroup.length === 1) {
          unique.push(nameGroup[0]);
        } else {
          // Sort: Plaid first, then by category presence, then by date
          nameGroup.sort((a, b) => {
            const aIsCSV = a.transaction_id?.startsWith('csv_') ? 1 : 0;
            const bIsCSV = b.transaction_id?.startsWith('csv_') ? 1 : 0;
            if (aIsCSV !== bIsCSV) return aIsCSV - bIsCSV; // Plaid first
            
            const aHasCategory = a.userCategory ? 0 : 1;
            const bHasCategory = b.userCategory ? 0 : 1;
            if (aHasCategory !== bHasCategory) return aHasCategory - bHasCategory; // Category first
            
            return new Date(b.date) - new Date(a.date); // Newer first
          });

          // Keep the first one (best), merge category if needed
          const best = { ...nameGroup[0] };
          
          // If best doesn't have category, find one from duplicates
          if (!best.userCategory) {
            for (const dup of nameGroup) {
              if (dup.userCategory) {
                best.userCategory = dup.userCategory;
                break;
              }
            }
          }
          
          unique.push(best);
          duplicates.push(...nameGroup.slice(1));
          
          console.log(`🔄 Dedup: Keeping "${best.name}" ($${Math.abs(best.amount).toFixed(2)}), removing ${nameGroup.length - 1} duplicate(s)`);
        }
      });
    });

    // Sort by date
    unique.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Save deduplicated transactions
    const allDates = unique.map(t => new Date(t.date));
    const startDate = new Date(Math.min(...allDates));
    const endDate = new Date(Math.max(...allDates));

    await prisma.plaidTransactionData.update({
      where: { itemId: item.item_id },
      data: {
        transactions: unique,
        totalTransactions: unique.length,
        startDate,
        endDate,
        lastFetched: new Date(),
      },
    });

    console.log(`✅ Deduplication complete: ${beforeCount} -> ${unique.length} (removed ${duplicates.length})`);

    // Log some examples of removed duplicates
    const examples = duplicates.slice(0, 5).map(d => ({
      name: d.name,
      amount: d.amount,
      date: d.date,
    }));

    return NextResponse.json({
      success: true,
      message: `Removed ${duplicates.length} duplicate transactions`,
      before: beforeCount,
      after: unique.length,
      removed: duplicates.length,
      examples,
    });

  } catch (error) {
    console.error('Error deduplicating transactions:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

