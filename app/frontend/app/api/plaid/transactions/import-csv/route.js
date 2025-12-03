import { NextResponse } from 'next/server';
import { requireMFA } from '@/lib/middleware/auth';
import { readItems } from '@/lib/plaid';
const prisma = require('@/lib/prisma');
const fs = require('fs');
const path = require('path');

// Helper to parse CSV line (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Convert CSV date (MM/DD/YY) to YYYY-MM-DD
function convertDate(csvDate) {
  const [month, day, year] = csvDate.split('/');
  // Handle 2-digit year: assume 20XX for all 2-digit years (00-99 -> 2000-2099)
  // This works for recent transactions (2020-2099)
  const yearNum = parseInt(year);
  const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Convert CSV row to Plaid transaction format
function csvRowToTransaction(row, accountId, index) {
  const [accountNumber, description, date, type, amount, balance] = row;
  
  // Convert amount: debits are negative, credits are positive
  const amountNum = parseFloat(amount);
  const plaidAmount = type === 'Debit' ? -Math.abs(amountNum) : Math.abs(amountNum);
  const balanceNum = parseFloat(balance) || null;
  
  // Extract merchant name from description (remove prefixes like "Debit Card Purchase - ")
  let merchantName = description;
  const prefixes = [
    'Debit Card Purchase - ',
    'Digital Card Purchase - ',
    'Withdrawal from ',
    'Deposit from ',
    'ATM Withdrawal - ',
    'Zelle money ',
    'Check Deposit (',
    'Wire Deposit',
    'Monthly Interest Paid',
    'Preauthorized Withdrawal to ',
    'Paper Payment to ',
    'Withdrawal to ',
    '360 Checking Card Adjustment Signature (Credit) ',
    '360 Checking Card Adjustment Signature (Debit) ',
  ];
  
  for (const prefix of prefixes) {
    if (merchantName.startsWith(prefix)) {
      merchantName = merchantName.substring(prefix.length);
      break;
    }
  }
  
  // Clean up merchant name (remove location info in parentheses, etc.)
  merchantName = merchantName.split(',')[0].trim();
  
  // Generate a unique transaction ID using balance for uniqueness (balance is unique per transaction)
  // This ensures re-importing the same CSV won't create duplicates
  const balanceStr = balanceNum ? balanceNum.toFixed(2).replace('.', '') : index;
  const transactionId = `csv_${accountNumber}_${convertDate(date).replace(/-/g, '')}_${balanceStr}`;
  
  return {
    transaction_id: transactionId,
    account_id: accountId,
    amount: plaidAmount,
    date: convertDate(date),
    name: description,
    merchant_name: merchantName || null,
    // Store balance for matching and deduplication
    csv_balance: balanceNum,
    category: null,
    category_id: null,
    transaction_type: type === 'Debit' ? 'place' : 'special',
    pending: false,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    location: {
      address: null,
      city: null,
      country: null,
      lat: null,
      lon: null,
      postal_code: null,
      region: null,
      store_number: null,
    },
    payment_meta: {
      by_order_of: null,
      payee: null,
      payer: null,
      payment_method: null,
      payment_processor: null,
      ppd_id: null,
      reason: null,
      reference_number: null,
    },
    personal_finance_category: {
      confidence_level: 'LOW',
      detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
      primary: 'GENERAL_MERCHANDISE',
      version: 'v1',
    },
    authorized_date: null,
    authorized_datetime: null,
    datetime: null,
    check_number: null,
    transaction_code: null,
    counterparties: [],
    logo_url: null,
    merchant_entity_id: null,
    website: null,
    personal_finance_category_icon_url: null,
  };
}

export async function POST(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error, requiresMFA: authResult.requiresMFA },
      { status: authResult.status }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const fileContent = await file.text();
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV file must have at least a header and one data row' },
        { status: 400 }
      );
    }

    // Parse CSV
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length >= 6) {
        rows.push(row);
      }
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid transaction rows found in CSV' },
        { status: 400 }
      );
    }

    // Get the current item
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

    // Get account ID - we'll use a default or try to get from accounts
    let accountId = 'default_account';
    if (prisma && prisma.plaidAccountData) {
      try {
        const accountData = await prisma.plaidAccountData.findUnique({
          where: { itemId: item.item_id },
        });
        if (accountData && accountData.accounts && Array.isArray(accountData.accounts)) {
          const firstAccount = accountData.accounts[0];
          if (firstAccount && firstAccount.account_id) {
            accountId = firstAccount.account_id;
          }
        }
      } catch (err) {
        console.log('⚠️ Could not get account ID from database, using default');
      }
    }

    // Convert CSV rows to transactions
    const transactions = rows.map((row, index) => 
      csvRowToTransaction(row, accountId, index)
    );

    // Sort by date (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get date range
    const dates = transactions.map(t => t.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    console.log(`📊 Importing ${transactions.length} transactions from CSV (${startDate} to ${endDate})`);

    // Save to database
    if (prisma && prisma.plaidTransactionData) {
      try {
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        
        await prisma.plaidTransactionData.upsert({
          where: { itemId: item.item_id },
          update: {
            transactions: transactions,
            totalTransactions: transactions.length,
            startDate: startDateObj,
            endDate: endDateObj,
            lastFetched: new Date(),
          },
          create: {
            itemId: item.item_id,
            transactions: transactions,
            totalTransactions: transactions.length,
            startDate: startDateObj,
            endDate: endDateObj,
            lastFetched: new Date(),
          },
        });

        console.log(`✅ Successfully imported ${transactions.length} transactions to database`);
      } catch (dbError) {
        console.error('❌ Error saving to database:', dbError);
        return NextResponse.json(
          { error: 'Failed to save transactions to database', details: dbError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${transactions.length} transactions`,
      count: transactions.length,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    });

  } catch (error) {
    console.error('❌ Error importing CSV:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV', details: error.message },
      { status: 500 }
    );
  }
}

