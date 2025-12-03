import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client, readItems, saveTransactionData, readTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

export async function GET(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

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
    const access_token = item.access_token;

    // Try to get cached data from database first
    if (!forceRefresh && prisma) {
      try {
        const cachedData = await prisma.plaidTransactionData.findUnique({
          where: { itemId: item.item_id },
        });

        if (cachedData && cachedData.transactions) {
          console.log('📦 Returning cached transaction data from database');
          // Handle both array format and object format
          const transactions = Array.isArray(cachedData.transactions) 
            ? cachedData.transactions 
            : (cachedData.transactions.transactions || []);
          
          // Get categories and notes for these transactions
          let categoryMap = {};
          let noteMap = {};
          if (prisma && prisma.plaidTransactionCategory) {
            try {
              const transactionIds = transactions.map(t => t.transaction_id);
              
              // Get categories
              const categories = await prisma.plaidTransactionCategory.findMany({
                where: { transactionId: { in: transactionIds } },
              });
              categoryMap = categories.reduce((acc, cat) => {
                acc[cat.transactionId] = cat.category;
                return acc;
              }, {});
              
              // Get notes
              if (prisma.plaidTransactionNote) {
                const notes = await prisma.plaidTransactionNote.findMany({
                  where: { transactionId: { in: transactionIds } },
                });
                noteMap = notes.reduce((acc, note) => {
                  acc[note.transactionId] = note.note;
                  return acc;
                }, {});
              }
            } catch (catError) {
              console.log('⚠️ Could not load categories/notes:', catError.message);
            }
          }

          // Merge category and note data into transactions
          const transactionsWithCategories = transactions.map(t => ({
            ...t,
            userCategory: categoryMap[t.transaction_id] || null,
            userNote: noteMap[t.transaction_id] || null,
          }));
          
          return NextResponse.json({
            accounts: Array.isArray(cachedData.transactions) ? [] : (cachedData.transactions.accounts || []),
            transactions: transactionsWithCategories,
            total_transactions: cachedData.totalTransactions || transactions.length,
            cached: true,
            lastFetched: cachedData.lastFetched,
          });
        }
      } catch (dbError) {
        console.log('⚠️ Could not read from database:', dbError.message);
      }
    }

    // Try file storage as fallback (if not forcing refresh)
    if (!forceRefresh) {
      const fileData = readTransactionData(item.item_id);
      if (fileData && fileData.transactions) {
        console.log('📦 Returning cached transaction data from file storage');
        
        // Get categories and notes for these transactions
        let categoryMap = {};
        let noteMap = {};
        if (prisma) {
          try {
            const transactions = fileData.transactions || [];
            const transactionIds = transactions.map(t => t.transaction_id);
            
            // Get categories
            const categories = await prisma.plaidTransactionCategory.findMany({
              where: { transactionId: { in: transactionIds } },
            });
            categoryMap = categories.reduce((acc, cat) => {
              acc[cat.transactionId] = cat.category;
              return acc;
            }, {});
            
            // Get notes
            if (prisma.plaidTransactionNote) {
              const notes = await prisma.plaidTransactionNote.findMany({
                where: { transactionId: { in: transactionIds } },
              });
              noteMap = notes.reduce((acc, note) => {
                acc[note.transactionId] = note.note;
                return acc;
              }, {});
            }
          } catch (catError) {
            console.log('⚠️ Could not load categories/notes:', catError.message);
          }
        }

        // Merge category and note data into transactions
        const transactionsWithCategories = (fileData.transactions || []).map(t => ({
          ...t,
          userCategory: categoryMap[t.transaction_id] || null,
          userNote: noteMap[t.transaction_id] || null,
        }));
        
        return NextResponse.json({
          accounts: fileData.accounts || [],
          transactions: transactionsWithCategories,
          total_transactions: fileData.total_transactions || (fileData.transactions?.length || 0),
          cached: true,
          lastFetched: fileData.lastFetched || fileData.lastUpdated,
        });
      }
    }

    // If no cached data and not forcing refresh, return error
    if (!forceRefresh) {
      return NextResponse.json(
        { 
          error: 'No cached transaction data found. Please click "Refresh Transactions from Plaid" to fetch data.',
          requiresRefresh: true,
        },
        { status: 404 }
      );
    }

    // ONLY fetch from Plaid if explicitly requested (refresh=true)
    console.log('\n' + '='.repeat(60));
    console.log('🔴 PULLING INFORMATION FROM PLAID API');
    console.log('='.repeat(60));
    console.log('⚠️  This will incur API costs!');
    console.log('='.repeat(60) + '\n');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const response = await client.transactionsGet({
      access_token: access_token,
      start_date: thirtyDaysAgo.toISOString().split('T')[0],
      end_date: now.toISOString().split('T')[0],
    });

    const transactionData = response.data;

    // Save to database - MERGE with existing transactions instead of replacing
    // Uses smart duplicate detection: date + amount + normalized name
    if (prisma) {
      try {
        // Helper to normalize transaction name for comparison
        // Handles differences like "Debit Card Purchase - TST ANNAS BAR NEW ORLEANS LA" vs "TST ANNAS BAR"
        const normalizeTransactionName = (name) => {
          if (!name) return '';
          let normalized = name.toUpperCase();
          
          // Remove common prefixes from CSV imports
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
          
          // Remove location suffixes (city, state patterns)
          // e.g., "TST ANNAS BAR NEW ORLEANS LA" -> "TST ANNAS BAR"
          normalized = normalized.replace(/\s+[A-Z]{2,}\s+[A-Z]{2}$/g, '');
          normalized = normalized.replace(/\s+[A-Z]{2}$/g, '');
          
          // Remove special characters and extra spaces
          normalized = normalized.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          
          // Take first 20 chars for comparison (merchant name core)
          return normalized.substring(0, 20);
        };

        // Get full normalized name for containment matching
        const getFullNormalizedName = (name) => {
          if (!name) return '';
          return name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        };

        // Check if two transactions match by name containment
        // e.g., "Amazon" matches "AMAZON.COM*B26C99260 SEATTLE WA US"
        const namesMatch = (name1, name2) => {
          const full1 = getFullNormalizedName(name1);
          const full2 = getFullNormalizedName(name2);
          const short1 = normalizeTransactionName(name1);
          const short2 = normalizeTransactionName(name2);
          
          // Exact match on short names
          if (short1 === short2) return true;
          
          // One contains the other (for Plaid short names vs CSV long names)
          if (full1.includes(short2) || full2.includes(short1)) return true;
          if (full1.includes(full2) || full2.includes(full1)) return true;
          
          // Check if the first significant word matches (e.g., "AMAZON" in both)
          const words1 = short1.split(' ').filter(w => w.length > 3);
          const words2 = short2.split(' ').filter(w => w.length > 3);
          if (words1.length > 0 && words2.length > 0 && words1[0] === words2[0]) return true;
          
          return false;
        };

        // Create fingerprints for smart matching
        // We create multiple fingerprints with date tolerance (+/- 3 days) to handle
        // differences between transaction date (CSV) and posted date (Plaid)
        const createFingerprints = (t) => {
          const baseDate = new Date(t.date);
          const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
          const normalizedName = normalizeTransactionName(t.name || t.merchant_name);
          
          // Create fingerprints for the exact date and +/- 3 days
          const fingerprints = [];
          for (let dayOffset = -3; dayOffset <= 3; dayOffset++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + dayOffset);
            const dateStr = date.toISOString().split('T')[0];
            fingerprints.push(`${dateStr}|${amount}|${normalizedName}`);
          }
          return fingerprints;
        };
        
        // Loose fingerprint - just amount + short name (for fallback matching)
        // This catches cases where dates differ significantly
        const createLooseFingerprint = (t) => {
          const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
          const normalizedName = normalizeTransactionName(t.name || t.merchant_name);
          // Use first 10 chars for looser matching
          const shortName = normalizedName.substring(0, 10);
          return `${amount}|${shortName}`;
        };
        
        // Primary fingerprint (exact date)
        const createFingerprint = (t) => {
          const date = t.date;
          const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
          const normalizedName = normalizeTransactionName(t.name || t.merchant_name);
          return `${date}|${amount}|${normalizedName}`;
        };

        // Get existing transactions to merge with
        const existingData = await prisma.plaidTransactionData.findUnique({
          where: { itemId: item.item_id },
        });

        const newTransactions = transactionData.transactions || [];
        let mergedTransactions = [];
        let mergedStartDate = thirtyDaysAgo;
        let mergedEndDate = now;
        let duplicatesReplaced = 0;
        let newAdded = 0;

        if (existingData && existingData.transactions && Array.isArray(existingData.transactions)) {
          // Create maps for both transaction_id and fingerprint matching
          const existingById = new Map();
          const existingByFingerprint = new Map();
          const existingByLooseFingerprint = new Map(); // For fallback matching
          const existingByBalance = new Map(); // For CSV balance matching
          
          existingData.transactions.forEach(t => {
            existingById.set(t.transaction_id, t);
            
            // Store by all fingerprint variants (with date tolerance)
            const fps = createFingerprints(t);
            fps.forEach(fp => {
              if (!existingByFingerprint.has(fp)) {
                existingByFingerprint.set(fp, t);
              }
            });
            
            // Store by loose fingerprint (amount + short name)
            const looseFp = createLooseFingerprint(t);
            if (!existingByLooseFingerprint.has(looseFp)) {
              existingByLooseFingerprint.set(looseFp, []);
            }
            existingByLooseFingerprint.get(looseFp).push(t);
            
            // Store by CSV balance if available (very reliable for CSV matching)
            if (t.csv_balance) {
              const balanceKey = `${t.csv_balance.toFixed(2)}|${Math.abs(parseFloat(t.amount)).toFixed(2)}`;
              existingByBalance.set(balanceKey, t);
            }
          });

          // Helper to find matching existing transaction
          const findMatchingExisting = (newT) => {
            // 1. Check by date-tolerant fingerprint (most reliable)
            const fps = createFingerprints(newT);
            for (const fp of fps) {
              if (existingByFingerprint.has(fp)) {
                return existingByFingerprint.get(fp);
              }
            }
            
            // 2. Fallback: Check by amount + name containment within date range
            const newAmount = Math.abs(parseFloat(newT.amount)).toFixed(2);
            const newDate = new Date(newT.date);
            const newMonth = newDate.getFullYear() * 12 + newDate.getMonth();
            
            // Check all existing transactions for amount + name match
            for (const [id, existing] of existingById) {
              const existingAmount = Math.abs(parseFloat(existing.amount)).toFixed(2);
              
              // Must have same amount
              if (existingAmount !== newAmount) continue;
              
              // Must be within 1 month
              const existingDate = new Date(existing.date);
              const existingMonth = existingDate.getFullYear() * 12 + existingDate.getMonth();
              if (Math.abs(newMonth - existingMonth) > 1) continue;
              
              // Check if names match (containment or similarity)
              if (namesMatch(newT.name || newT.merchant_name, existing.name || existing.merchant_name)) {
                console.log(`🔍 Name containment match: "${existing.name}" <-> "${newT.name}" ($${newAmount})`);
                return existing;
              }
            }
            
            return null;
          };

          // Process new transactions
          newTransactions.forEach(newT => {
            // Check if this is a duplicate by transaction_id
            if (existingById.has(newT.transaction_id)) {
              // Direct match by ID - replace with new data but preserve userCategory
              const existing = existingById.get(newT.transaction_id);
              existingById.set(newT.transaction_id, {
                ...newT,
                userCategory: existing.userCategory || null, // Preserve category
              });
              duplicatesReplaced++;
            }
            // Check if this is a duplicate by fingerprint with date tolerance (CSV vs Plaid)
            else {
              const matchingExisting = findMatchingExisting(newT);
              if (matchingExisting) {
                // Replace CSV import with Plaid data (better quality) but preserve category
                // Remove the old CSV entry and add the new Plaid entry
                existingById.delete(matchingExisting.transaction_id);
                existingById.set(newT.transaction_id, {
                  ...newT,
                  userCategory: matchingExisting.userCategory || null, // Preserve category from CSV
                });
                console.log(`🔄 Replacing CSV entry with Plaid data: "${matchingExisting.name}" -> "${newT.name}"`);
                duplicatesReplaced++;
              } else {
                // New transaction - add it
                existingById.set(newT.transaction_id, newT);
                // Also add to fingerprint map for future matching
                const fps = createFingerprints(newT);
                fps.forEach(fp => {
                  if (!existingByFingerprint.has(fp)) {
                    existingByFingerprint.set(fp, newT);
                  }
                });
                newAdded++;
              }
            }
          });

          // Convert map back to array
          mergedTransactions = Array.from(existingById.values());

          // Update date range to include all transactions
          const allDates = mergedTransactions.map(t => new Date(t.date));
          mergedStartDate = new Date(Math.min(...allDates));
          mergedEndDate = new Date(Math.max(...allDates));

          console.log(`📊 Merge result: ${existingData.transactions.length} existing, ${newTransactions.length} new`);
          console.log(`   → ${duplicatesReplaced} duplicates replaced, ${newAdded} new added`);
          console.log(`   → ${mergedTransactions.length} total transactions`);
        } else {
          // No existing data, just use new transactions
          mergedTransactions = newTransactions;
          console.log(`📊 No existing transactions found, saving ${mergedTransactions.length} new transactions`);
        }

        // Sort by date (newest first)
        mergedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        await prisma.plaidTransactionData.upsert({
          where: { itemId: item.item_id },
          update: {
            transactions: mergedTransactions,
            totalTransactions: mergedTransactions.length,
            startDate: mergedStartDate,
            endDate: mergedEndDate,
            lastFetched: new Date(),
          },
          create: {
            itemId: item.item_id,
            transactions: mergedTransactions,
            totalTransactions: mergedTransactions.length,
            startDate: mergedStartDate,
            endDate: mergedEndDate,
            lastFetched: new Date(),
          },
        });
        console.log('✅ Saved merged transaction data to database');
      } catch (dbError) {
        console.error('⚠️ Could not save to database, falling back to file storage:', dbError.message);
        saveTransactionData(item.item_id, transactionData);
      }
    } else {
      saveTransactionData(item.item_id, transactionData);
    }

    // Get categories and notes for these transactions
    let categoryMap = {};
    let noteMap = {};
    if (prisma) {
      try {
        const transactions = transactionData.transactions || [];
        const transactionIds = transactions.map(t => t.transaction_id);
        
        // Get categories
        const categories = await prisma.plaidTransactionCategory.findMany({
          where: { transactionId: { in: transactionIds } },
        });
        categoryMap = categories.reduce((acc, cat) => {
          acc[cat.transactionId] = cat.category;
          return acc;
        }, {});
        
        // Get notes
        if (prisma.plaidTransactionNote) {
          const notes = await prisma.plaidTransactionNote.findMany({
            where: { transactionId: { in: transactionIds } },
          });
          noteMap = notes.reduce((acc, note) => {
            acc[note.transactionId] = note.note;
            return acc;
          }, {});
        }
      } catch (catError) {
        console.log('⚠️ Could not load categories/notes:', catError.message);
      }
    }

    // Merge category and note data into transactions
    const transactionsWithCategories = (transactionData.transactions || []).map(t => ({
      ...t,
      userCategory: categoryMap[t.transaction_id] || null,
      userNote: noteMap[t.transaction_id] || null,
    }));

    return NextResponse.json({
      ...transactionData,
      transactions: transactionsWithCategories,
      cached: false,
      lastFetched: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    }, { status: 500 });
  }
}
