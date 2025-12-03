import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems, readTransactionData } from '@/lib/plaid';
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
 * Normalize merchant name for matching
 * This helps match transactions that might have slightly different descriptions
 */
function normalizeMerchantName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove common prefixes
    .replace(/^(debit card purchase|digital card purchase|withdrawal from|deposit from)\s*-\s*/i, '')
    // Remove location suffixes (states, cities, etc.)
    .replace(/\s+[A-Z]{2}\s*$/, '') // Remove state codes
    .replace(/\s+US\s*$/, '')
    // Remove phone numbers
    .replace(/\s+\d{3}\s+\d{3}\s+\d{4}/g, '')
    .replace(/\s+\d{10,}/g, '')
    // Remove transaction IDs and codes (e.g., *B26C99260, #1234)
    .replace(/[*#]\w+/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns similarity score (0 = identical, higher = more different)
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function stringSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Extract key words from merchant name (removes common words)
 */
function extractKeyWords(name) {
  const commonWords = new Set(['the', 'and', 'or', 'of', 'from', 'to', 'in', 'on', 'at', 'a', 'an']);
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w));
  return words.sort().join(' ');
}

/**
 * Check if two merchant names are similar enough to be considered the same vendor
 * Uses multiple fuzzy matching strategies
 */
function areMerchantsSimilar(name1, name2) {
  const normalized1 = normalizeMerchantName(name1);
  const normalized2 = normalizeMerchantName(name2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return { match: true, score: 1.0, reason: 'exact' };
  
  // Extract main merchant name (before special characters/IDs)
  const extractMain = (str) => {
    return str
      .split(/[*#]/)[0]  // Remove transaction IDs
      .split(/\s+\d/)[0]  // Remove trailing numbers
      .trim();
  };
  
  const main1 = extractMain(normalized1);
  const main2 = extractMain(normalized2);
  
  // Check if main names match exactly
  if (main1 === main2 && main1.length > 3) {
    return { match: true, score: 0.95, reason: 'main_name_exact' };
  }
  
  // Calculate string similarity using Levenshtein distance
  const similarity = stringSimilarity(main1, main2);
  if (similarity >= 0.75 && main1.length > 5 && main2.length > 5) {
    return { match: true, score: similarity, reason: 'fuzzy_similarity' };
  }
  
  // Check if one contains the other (substring match)
  if (main1.length > 5 && main2.length > 5) {
    if (main1.includes(main2) || main2.includes(main1)) {
      const overlap = Math.min(main1.length, main2.length);
      const coverage = overlap / Math.max(main1.length, main2.length);
      if (coverage >= 0.6) {
        return { match: true, score: coverage, reason: 'substring' };
      }
    }
  }
  
  // Word-based matching - check if they share significant key words
  const keyWords1 = extractKeyWords(main1);
  const keyWords2 = extractKeyWords(main2);
  if (keyWords1 && keyWords2) {
    const words1 = new Set(keyWords1.split(' '));
    const words2 = new Set(keyWords2.split(' '));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    const wordSimilarity = intersection.size / union.size;
    
    // If they share at least 60% of key words and have at least 2 words in common
    if (wordSimilarity >= 0.6 && intersection.size >= 2) {
      return { match: true, score: wordSimilarity, reason: 'key_words' };
    }
  }
  
  return { match: false, score: 0, reason: 'no_match' };
}

/**
 * POST /api/plaid/transactions/bulk-categorize
 * Find uncategorized transactions matching a merchant name and optionally bulk update them
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
    const { merchantName, category, transactionId, action, selectedTransactionIds } = body;

    if (!merchantName || !transactionId) {
      return NextResponse.json(
        { error: 'Merchant name and transaction ID are required' },
        { status: 400 }
      );
    }

    const itemsData = readItems();
    const currentEnv = process.env.PLAID_ENV || 'sandbox';

    if (itemsData.items.length === 0) {
      return NextResponse.json(
        { error: 'No items found. Please link an account first.' },
        { status: 404 }
      );
    }

    // Filter items by current environment
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

    // Get all transactions
    let allTransactions = [];

    // Try database first
    if (prisma) {
      try {
        const dbData = await prisma.plaidTransactionData.findUnique({
          where: { itemId: item.item_id },
        });
        if (dbData && dbData.transactions) {
          allTransactions = Array.isArray(dbData.transactions) 
            ? dbData.transactions 
            : (dbData.transactions.transactions || []);
        }
      } catch (dbError) {
        console.log('⚠️ Could not read from database:', dbError.message);
      }
    }

    // Fallback to file storage
    if (allTransactions.length === 0) {
      const fileData = readTransactionData(item.item_id);
      if (fileData && fileData.transactions) {
        allTransactions = fileData.transactions || [];
      }
    }

    if (allTransactions.length === 0) {
      return NextResponse.json(
        { error: 'No transactions found. Please fetch transactions first.' },
        { status: 404 }
      );
    }

    // Get all categorized transaction IDs
    let categorizedIds = new Set();
    if (prisma && prisma.plaidTransactionCategory) {
      try {
        const categories = await prisma.plaidTransactionCategory.findMany({
          select: { transactionId: true },
        });
        categorizedIds = new Set(categories.map(c => c.transactionId));
      } catch (dbError) {
        console.log('⚠️ Could not read categories from database:', dbError.message);
      }
    }

    // Find the reference transaction to get its merchant name
    const referenceTransaction = allTransactions.find(
      t => t.transaction_id === transactionId
    );

    if (!referenceTransaction) {
      return NextResponse.json(
        { error: 'Reference transaction not found' },
        { status: 404 }
      );
    }

    // Get the merchant name to match against (use merchant_name if available, otherwise name)
    const referenceMerchantName = referenceTransaction.merchant_name || referenceTransaction.name;

    // Find all uncategorized transactions from the same merchant with fuzzy matching
    const matchingTransactions = allTransactions
      .map(transaction => {
        // Skip the reference transaction itself
        if (transaction.transaction_id === transactionId) return null;
        
        // Skip already categorized transactions
        if (categorizedIds.has(transaction.transaction_id)) return null;
        
        // Match by merchant name with fuzzy matching
        const transactionMerchantName = transaction.merchant_name || transaction.name;
        const matchResult = areMerchantsSimilar(referenceMerchantName, transactionMerchantName);
        
        if (matchResult.match) {
          return {
            ...transaction,
            matchScore: matchResult.score,
            matchReason: matchResult.reason,
          };
        }
        return null;
      })
      .filter(t => t !== null)
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by match confidence (best matches first)

    // If action is 'apply', bulk update selected transactions
    if (action === 'apply' && category) {
      if (!prisma || !prisma.plaidTransactionCategory) {
        return NextResponse.json(
          { error: 'Database not available or Prisma client needs regeneration. Please restart the dev server after running: npx prisma generate' },
          { status: 500 }
        );
      }

      // selectedTransactionIds is already extracted from body above
      
      // Use selectedTransactionIds if provided, otherwise apply to all matching
      const transactionsToCategorize = selectedTransactionIds && selectedTransactionIds.length > 0
        ? matchingTransactions.filter(t => selectedTransactionIds.includes(t.transaction_id))
        : matchingTransactions;

      if (transactionsToCategorize.length === 0) {
        return NextResponse.json({
          error: 'No transactions selected to categorize',
        }, { status: 400 });
      }

      const trimmedCategory = category.trim();
      const isCustom = !PREDEFINED_CATEGORIES.includes(trimmedCategory);

      // Bulk update selected transactions
      const updatePromises = transactionsToCategorize.map(transaction =>
        prisma.plaidTransactionCategory.upsert({
          where: { transactionId: transaction.transaction_id },
          update: {
            category: trimmedCategory,
            isCustom,
            updatedAt: new Date(),
          },
          create: {
            transactionId: transaction.transaction_id,
            category: trimmedCategory,
            isCustom,
          },
        })
      );

      await Promise.all(updatePromises);

      return NextResponse.json({
        success: true,
        message: `Successfully categorized ${transactionsToCategorize.length} transaction(s)`,
        count: transactionsToCategorize.length,
        transactionIds: transactionsToCategorize.map(t => t.transaction_id),
      });
    }

    // Otherwise, just return the matching transactions for preview
    return NextResponse.json({
      success: true,
      count: matchingTransactions.length,
      transactions: matchingTransactions.map(t => ({
        transaction_id: t.transaction_id,
        name: t.name,
        merchant_name: t.merchant_name,
        amount: t.amount,
        date: t.date,
        matchScore: t.matchScore,
        matchReason: t.matchReason,
      })),
      referenceMerchantName,
    });
  } catch (error) {
    console.error('Error in bulk categorize:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

