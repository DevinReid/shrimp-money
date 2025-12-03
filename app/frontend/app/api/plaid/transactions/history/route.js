import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { client, readItems, saveTransactionData } from '@/lib/plaid';
const prisma = require('@/lib/prisma');

/**
 * Fetch up to 1 year of historical transactions
 * Handles pagination automatically
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

    // Get the most recent item
    const item = matchingItems.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];
    const access_token = item.access_token;

    // Get transactions from the last year
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    // Ensure dates are in YYYY-MM-DD format and end_date is not in the future
    const startDate = oneYearAgo.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];

    console.log(`📊 Fetching transactions from ${startDate} to ${endDate}`);

    // Plaid transactionsGet uses offset/count pagination (not cursors - that's transactionsSync)
    // Max 500 transactions per request
    const BATCH_SIZE = 500;
    let allTransactions = [];
    let offset = 0;
    let totalAvailable = null;
    let lastResponse = null;

    while (true) {
      try {
        console.log(`🔄 Fetching batch at offset ${offset}...`);
        
        const response = await client.transactionsGet({
          access_token: access_token,
          start_date: startDate,
          end_date: endDate,
          options: {
            count: BATCH_SIZE,
            offset: offset,
          },
        });
        
        lastResponse = response;
        const data = response.data;
        
        const fetchedCount = data.transactions?.length || 0;
        totalAvailable = data.total_transactions;
        
        allTransactions = allTransactions.concat(data.transactions || []);
        
        console.log(`📊 Fetched ${fetchedCount} transactions (total fetched: ${allTransactions.length} of ${totalAvailable})`);
        
        // Check if we've fetched all available transactions
        if (allTransactions.length >= totalAvailable) {
          console.log('✅ Fetched all available transactions');
          break;
        }
        
        // If we got fewer than requested, we're done
        if (fetchedCount < BATCH_SIZE) {
          console.log('✅ Reached end of transactions (got less than batch size)');
          break;
        }
        
        // Safety limit to prevent infinite loops
        if (allTransactions.length > 10000) {
          console.warn('⚠️ Reached 10,000 transaction limit, stopping pagination');
          break;
        }
        
        // Move to next page
        offset += fetchedCount;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (requestError) {
        console.error('❌ Error in transactionsGet request:', {
          error: requestError.message,
          status: requestError.response?.status,
          data: requestError.response?.data,
          offset: offset,
        });
        
        // If we got some transactions before the error, continue with what we have
        if (allTransactions.length > 0) {
          console.warn(`⚠️ Error during pagination, continuing with ${allTransactions.length} transactions fetched so far`);
          break;
        }
        
        throw requestError;
      }
    }

    console.log(`✅ Total transactions fetched: ${allTransactions.length}`);

    // Get categories for these transactions
    let categoryMap = {};
    if (prisma && prisma.plaidTransactionCategory) {
      try {
        const transactionIds = allTransactions.map(t => t.transaction_id);
        const categories = await prisma.plaidTransactionCategory.findMany({
          where: { transactionId: { in: transactionIds } },
        });
        categoryMap = categories.reduce((acc, cat) => {
          acc[cat.transactionId] = cat.category;
          return acc;
        }, {});
      } catch (catError) {
        console.log('⚠️ Could not load categories:', catError.message);
      }
    }

    // Merge category data into transactions
    const transactionsWithCategories = allTransactions.map(t => ({
      ...t,
      userCategory: categoryMap[t.transaction_id] || null,
    }));

    const transactionData = {
      ...(lastResponse?.data || {}),
      transactions: allTransactions,
      total_transactions: allTransactions.length,
    };

    // Save to database - MERGE with existing and preserve categories
    if (prisma && prisma.plaidTransactionData) {
      try {
        // Helper to normalize transaction name for comparison
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
          
          return normalized.substring(0, 20);
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

        // Create fingerprints with date tolerance (+/- 3 days)
        const createFingerprints = (t) => {
          const baseDate = new Date(t.date);
          const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
          const normalizedName = normalizeTransactionName(t.name || t.merchant_name);
          
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
        const createLooseFingerprint = (t) => {
          const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
          const normalizedName = normalizeTransactionName(t.name || t.merchant_name);
          return `${amount}|${normalizedName.substring(0, 10)}`;
        };

        const createFingerprint = (t) => {
          const date = t.date;
          const amount = Math.abs(parseFloat(t.amount)).toFixed(2);
          const normalizedName = normalizeTransactionName(t.name || t.merchant_name);
          return `${date}|${amount}|${normalizedName}`;
        };

        // Get existing data to preserve categories and merge with CSV imports
        const existingData = await prisma.plaidTransactionData.findUnique({
          where: { itemId: item.item_id },
        });

        // Get all existing categories (with date tolerance for matching)
        let existingCategoryMap = {};
        if (existingData && existingData.transactions) {
          existingData.transactions.forEach(t => {
            if (t.userCategory) {
              existingCategoryMap[t.transaction_id] = t.userCategory;
              // Also store by ALL fingerprint variants for CSV matching with date tolerance
              createFingerprints(t).forEach(fp => {
                existingCategoryMap[fp] = t.userCategory;
              });
            }
          });
        }

        // Merge categories from database
        Object.keys(categoryMap).forEach(id => {
          existingCategoryMap[id] = categoryMap[id];
        });

        // Apply categories to new transactions (check all fingerprint variants)
        const transactionsWithPreservedCategories = allTransactions.map(t => {
          // First check by transaction_id
          if (existingCategoryMap[t.transaction_id]) {
            return { ...t, userCategory: existingCategoryMap[t.transaction_id] };
          }
          // Then check by any fingerprint variant
          const fps = createFingerprints(t);
          for (const fp of fps) {
            if (existingCategoryMap[fp]) {
              return { ...t, userCategory: existingCategoryMap[fp] };
            }
          }
          return { ...t, userCategory: null };
        });

        // Merge with any CSV imports that are outside the Plaid date range
        let mergedTransactions = [...transactionsWithPreservedCategories];
        
        if (existingData && existingData.transactions) {
          // Build sets of ALL fingerprints from Plaid (with date tolerance)
          const plaidFingerprints = new Set();
          allTransactions.forEach(t => {
            createFingerprints(t).forEach(fp => plaidFingerprints.add(fp));
          });
          const plaidIds = new Set(allTransactions.map(t => t.transaction_id));
          
          // Add CSV transactions that Plaid doesn't have (older than 1 year or not in Plaid)
          let csvKept = 0;
          let csvReplaced = 0;
          existingData.transactions.forEach(existing => {
            const isCSV = existing.transaction_id?.startsWith('csv_');
            
            if (!isCSV) return; // Skip non-CSV transactions (they're already in Plaid data)
            
            // Check if ANY of this CSV transaction's fingerprints match a Plaid transaction
            const csvFingerprints = createFingerprints(existing);
            let hasPlaidMatch = csvFingerprints.some(fp => plaidFingerprints.has(fp)) || 
                                plaidIds.has(existing.transaction_id);
            
            // If no match, try name containment matching (same amount, similar name, within 1 month)
            if (!hasPlaidMatch) {
              const existingAmount = Math.abs(parseFloat(existing.amount)).toFixed(2);
              const existingDate = new Date(existing.date);
              const existingMonth = existingDate.getFullYear() * 12 + existingDate.getMonth();
              
              for (const plaidT of allTransactions) {
                const plaidAmount = Math.abs(parseFloat(plaidT.amount)).toFixed(2);
                if (plaidAmount !== existingAmount) continue;
                
                const plaidDate = new Date(plaidT.date);
                const plaidMonth = plaidDate.getFullYear() * 12 + plaidDate.getMonth();
                if (Math.abs(existingMonth - plaidMonth) > 1) continue;
                
                // Check name containment
                if (namesMatch(existing.name || existing.merchant_name, plaidT.name || plaidT.merchant_name)) {
                  hasPlaidMatch = true;
                  console.log(`🔍 Name match: "${existing.name}" <-> "${plaidT.name}" ($${existingAmount})`);
                  break;
                }
              }
            }
            
            // If it's a CSV import and Plaid doesn't have a matching transaction, keep it
            if (!hasPlaidMatch) {
              mergedTransactions.push(existing);
              csvKept++;
            } else {
              csvReplaced++;
            }
          });
          
          console.log(`📊 CSV merge: ${csvReplaced} replaced by Plaid data, ${csvKept} unique CSV transactions kept`);
        }

        // Sort by date (newest first)
        mergedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate date range
        const allDates = mergedTransactions.map(t => new Date(t.date));
        const mergedStartDate = new Date(Math.min(...allDates));
        const mergedEndDate = new Date(Math.max(...allDates));
        
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
        console.log(`✅ Saved ${mergedTransactions.length} transactions (${allTransactions.length} from Plaid + preserved CSV imports)`);
      } catch (dbError) {
        console.error('⚠️ Could not save to database, falling back to file storage:', dbError.message);
        saveTransactionData(item.item_id, transactionData);
      }
    } else {
      saveTransactionData(item.item_id, transactionData);
    }

    return NextResponse.json({
      accounts: lastResponse?.data?.accounts || [],
      transactions: transactionsWithCategories,
      total_transactions: allTransactions.length,
      request_id: lastResponse?.data?.request_id || null,
      dateRange: {
        start: oneYearAgo.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Error fetching historical transactions:', error);
    return NextResponse.json({
      error: {
        error_code: error.response?.data?.error_code,
        error_message: error.response?.data?.error_message || error.message,
      },
    }, { status: 500 });
  }
}

