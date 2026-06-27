#!/usr/bin/env node
/**
 * Analyze bank transactions CSV to identify bills and recurring payments.
 */

const fs = require('fs');
const path = require('path');

// Keywords that suggest recurring bills
const BILL_KEYWORDS = [
  'AUTO PAY', 'AUTOPAY', 'AUTO PYMT', 'AUTO PAYMENT',
  'BILL', 'PAYMENT', 'PAYROLLIN', 'SUBSCRIPTION', 'SUBSCR', 'SUB'
];

// Common bill/service providers to look for
const KNOWN_BILL_MERCHANTS = [
  'COX COMM', 'COX COMMUNICATIONS',
  'SWBNO', 'UTILITY', 'SEWERAGE', 'WATER',
  'NETFLIX', 'HULU', 'DISNEY', 'STREAMING',
  'APPLE COM BILL', 'APPLE', 'ICLOUD',
  'SPOTIFY', 'YOUTUBE', 'PREMIUM',
  'OPENAI', 'CHATGPT',
  'CHEWY',
  'AMAZON PRIME', 'PRIME',
  'CREDIT CARD', 'DISCOVER', 'CITI', 'WF', 'WELLS FARGO', 'CHASE', 'VISA', 'MASTERCARD',
  'VENMO', 'PAYPAL', 'ZELLE',
  'HOME DEPOT',
  'APPLECARD', 'APPLE CARD', 'GSBANK',
  'PENNYMAC', 'MORTGAGE',
  'INSURANCE', 'GEICO', 'STATE FARM', 'PROGRESSIVE'
];

function parseDate(dateStr) {
  // Try MM/DD/YY format first
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    
    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    return new Date(year, month - 1, day);
  }
  return null;
}

function normalizeMerchantName(description) {
  description = description.toUpperCase();
  
  // Extract merchant from common patterns
  const patterns = [
    /DEBIT CARD PURCHASE\s*-\s*(.+?)(?:\s+\d{2}\/\d{2}\/\d{2}|$)/,
    /DIGITAL CARD PURCHASE\s*-\s*(.+?)(?:\s+\d{2}\/\d{2}\/\d{2}|$)/,
    /WITHDRAWAL FROM\s+(.+?)(?:\s+\d{2}\/\d{2}\/\d{2}|$)/,
    /DEPOSIT FROM\s+(.+?)(?:\s+\d{2}\/\d{2}\/\d{2}|$)/,
    /360 CHECKING CARD ADJUSTMENT[^(]+\([^)]+\)\s+(.+?)(?:\s+\d{2}\/\d{2}\/\d{2}|$)/,
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      let merchant = match[1].trim();
      // Clean up merchant name
      merchant = merchant.replace(/\s+/g, ' ');
      // Remove location info (usually at the end)
      merchant = merchant.replace(/\s+[A-Z]{2}\s*$/, ''); // Remove state codes
      merchant = merchant.replace(/\s+US\s*$/, '');
      // Remove phone numbers
      merchant = merchant.replace(/\s+\d{3}\s+\d{3}\s+\d{4}/, '');
      merchant = merchant.replace(/\s+\d{10,}/, '');
      return merchant;
    }
  }
  
  // If no pattern matches, return cleaned description
  return description.trim();
}

function isLikelyBill(description) {
  const descUpper = description.toUpperCase();
  
  // Check for bill keywords
  for (const keyword of BILL_KEYWORDS) {
    if (descUpper.includes(keyword)) {
      return true;
    }
  }
  
  // Check for known bill merchants
  for (const merchant of KNOWN_BILL_MERCHANTS) {
    if (descUpper.includes(merchant)) {
      return true;
    }
  }
  
  return false;
}

function groupTransactionsByMerchant(transactions) {
  const grouped = {};
  
  for (const txn of transactions) {
    if (txn['Transaction Type'] === 'Debit') {
      const merchant = normalizeMerchantName(txn['Transaction Description']);
      if (!grouped[merchant]) {
        grouped[merchant] = [];
      }
      grouped[merchant].push(txn);
    }
  }
  
  return grouped;
}

function analyzeRecurringPatterns(merchantTxns) {
  if (merchantTxns.length < 2) {
    return null;
  }
  
  const amounts = merchantTxns.map(t => parseFloat(t['Transaction Amount']));
  const dates = [];
  
  for (const txn of merchantTxns) {
    const date = parseDate(txn['Transaction Date']);
    if (date && !isNaN(date.getTime())) {
      dates.push(date);
    }
  }
  
  if (dates.length < 2) {
    return null;
  }
  
  dates.sort((a, b) => a - b);
  const amountsSet = new Set(amounts);
  
  // Calculate days between transactions
  const intervals = [];
  for (let i = 1; i < dates.length; i++) {
    const delta = Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    if (delta > 0) {
      intervals.push(delta);
    }
  }
  
  const analysis = {
    count: merchantTxns.length,
    uniqueAmounts: amountsSet.size,
    amountRange: `$${Math.min(...amounts).toFixed(2)} - $${Math.max(...amounts).toFixed(2)}`,
    minAmount: Math.min(...amounts),
    maxAmount: Math.max(...amounts),
    dates: dates,
    avgIntervalDays: intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null,
    intervals: intervals,
    lastTransaction: dates[dates.length - 1].toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
  };
  
  // Find most common amount
  const amountCounts = {};
  amounts.forEach(amt => {
    amountCounts[amt] = (amountCounts[amt] || 0) + 1;
  });
  analysis.mostCommonAmount = parseFloat(Object.keys(amountCounts).reduce((a, b) => 
    amountCounts[a] > amountCounts[b] ? a : b
  ));
  
  // Determine if it's likely recurring
  let isRecurring = false;
  
  // Same amount multiple times suggests recurring
  if (amountsSet.size <= 2 && merchantTxns.length >= 3) {
    isRecurring = true;
  }
  
  // Regular intervals (monthly: ~28-31 days, weekly: ~7 days)
  if (intervals.length > 0) {
    const avgInterval = analysis.avgIntervalDays;
    if (avgInterval >= 25 && avgInterval <= 35) { // Monthly
      isRecurring = true;
    } else if (avgInterval >= 6 && avgInterval <= 9) { // Weekly
      isRecurring = true;
    } else if (avgInterval >= 14 && avgInterval <= 16) { // Bi-weekly
      isRecurring = true;
    }
  }
  
  // Check if description suggests bill
  if (isLikelyBill(merchantTxns[0]['Transaction Description'])) {
    isRecurring = true;
  }
  
  analysis.isLikelyRecurring = isRecurring;
  analysis.frequencyEstimate = null;
  
  if (intervals.length > 0 && isRecurring) {
    const avg = analysis.avgIntervalDays;
    if (avg >= 25 && avg <= 35) {
      analysis.frequencyEstimate = 'Monthly';
    } else if (avg >= 6 && avg <= 9) {
      analysis.frequencyEstimate = 'Weekly';
    } else if (avg >= 14 && avg <= 16) {
      analysis.frequencyEstimate = 'Bi-weekly';
    } else {
      analysis.frequencyEstimate = `Every ${Math.round(avg)} days`;
    }
  }
  
  return analysis;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  
  // Parse rows
  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields with commas
    const row = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField.trim()); // Add last field
    
    if (row.length === headers.length) {
      const txn = {};
      headers.forEach((header, idx) => {
        txn[header] = row[idx] || '';
      });
      transactions.push(txn);
    }
  }
  
  return transactions;
}

function main() {
  // Find the CSV file
  const docsDir = path.join(__dirname, '..', 'docs');
  const csvFiles = fs.readdirSync(docsDir).filter(f => f.endsWith('.csv'));
  
  if (csvFiles.length === 0) {
    console.error('No CSV files found in docs/ directory');
    process.exit(1);
  }
  
  // Use the one with 360Checking in the name
  let csvFile = csvFiles.find(f => f.includes('360Checking') || f.includes('360'));
  if (!csvFile) {
    csvFile = csvFiles[0];
  }
  
  const csvPath = path.join(docsDir, csvFile);
  console.log(`Analyzing: ${csvFile}`);
  console.log('='.repeat(80));
  
  // Parse transactions
  const transactions = parseCSV(csvPath);
  console.log(`Total transactions: ${transactions.length}`);
  
  // Group by merchant
  const grouped = groupTransactionsByMerchant(transactions);
  console.log(`Unique merchants: ${Object.keys(grouped).length}`);
  console.log('\n' + '='.repeat(80));
  console.log('RECURRING PAYMENTS & BILLS ANALYSIS');
  console.log('='.repeat(80) + '\n');
  
  // Analyze each merchant
  const recurringBills = [];
  const otherRecurring = [];
  
  for (const [merchant, txns] of Object.entries(grouped)) {
    const analysis = analyzeRecurringPatterns(txns);
    if (!analysis) {
      continue;
    }
    
    const item = {
      merchant,
      description: txns[0]['Transaction Description'],
      analysis,
      transactions: txns
    };
    
    if (analysis.isLikelyRecurring) {
      if (isLikelyBill(txns[0]['Transaction Description'])) {
        recurringBills.push(item);
      } else {
        otherRecurring.push(item);
      }
    }
  }
  
  // Sort by count
  recurringBills.sort((a, b) => b.analysis.count - a.analysis.count);
  otherRecurring.sort((a, b) => b.analysis.count - a.analysis.count);
  
  // Print recurring bills
  console.log('='.repeat(80));
  console.log('BILLS & SUBSCRIPTIONS (High Confidence)');
  console.log('='.repeat(80) + '\n');
  
  for (const item of recurringBills) {
    const a = item.analysis;
    console.log(`📄 ${item.merchant}`);
    const desc = item.description.length > 70 ? item.description.substring(0, 70) + '...' : item.description;
    console.log(`   Description: ${desc}`);
    console.log(`   Occurrences: ${a.count} transactions`);
    console.log(`   Amount: ${a.amountRange} (Most common: $${a.mostCommonAmount.toFixed(2)})`);
    console.log(`   Frequency: ${a.frequencyEstimate || 'Variable'}`);
    console.log(`   Last Payment: ${a.lastTransaction}`);
    console.log();
  }
  
  // Print other recurring payments
  console.log('='.repeat(80));
  console.log('OTHER RECURRING PAYMENTS (Medium Confidence)');
  console.log('='.repeat(80) + '\n');
  
  for (const item of otherRecurring.slice(0, 20)) {
    const a = item.analysis;
    console.log(`🔄 ${item.merchant}`);
    console.log(`   Occurrences: ${a.count} transactions`);
    console.log(`   Amount: ${a.amountRange} (Most common: $${a.mostCommonAmount.toFixed(2)})`);
    console.log(`   Frequency: ${a.frequencyEstimate || 'Variable'}`);
    console.log();
  }
  
  // Generate summary report
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Bills & Subscriptions: ${recurringBills.length}`);
  console.log(`Other Recurring Payments: ${otherRecurring.length}`);
  
  // Calculate monthly spending on bills
  let totalMonthlyBills = 0;
  console.log('\nEstimated Monthly Bills:');
  console.log('-'.repeat(80));
  
  for (const item of recurringBills) {
    const a = item.analysis;
    const freq = a.frequencyEstimate;
    const commonAmount = a.mostCommonAmount;
    
    let monthlyCost = 0;
    if (freq === 'Monthly') {
      monthlyCost = commonAmount;
    } else if (freq === 'Weekly') {
      monthlyCost = commonAmount * 4.33;
    } else if (freq === 'Bi-weekly') {
      monthlyCost = commonAmount * 2.17;
    } else if (a.avgIntervalDays) {
      monthlyCost = (commonAmount * 30) / a.avgIntervalDays;
    }
    
    if (monthlyCost > 0) {
      totalMonthlyBills += monthlyCost;
      console.log(`  ${item.merchant.padEnd(40)} $${monthlyCost.toFixed(2).padStart(8)}/month`);
    }
  }
  
  console.log('-'.repeat(80));
  console.log(`  ${'TOTAL ESTIMATED MONTHLY BILLS'.padEnd(40)} $${totalMonthlyBills.toFixed(2).padStart(8)}`);
  
  // Save detailed report to JSON
  const report = {
    analysisDate: new Date().toISOString(),
    sourceFile: csvFile,
    totalTransactions: transactions.length,
    billsAndSubscriptions: recurringBills.map(item => ({
      merchant: item.merchant,
      description: item.description,
      count: item.analysis.count,
      amountRange: item.analysis.amountRange,
      mostCommonAmount: item.analysis.mostCommonAmount,
      frequency: item.analysis.frequencyEstimate,
      lastPayment: item.analysis.lastTransaction,
      dateRange: `${item.analysis.dates[0].toLocaleDateString()} - ${item.analysis.dates[item.analysis.dates.length - 1].toLocaleDateString()}`,
    })),
    otherRecurring: otherRecurring.slice(0, 20).map(item => ({
      merchant: item.merchant,
      count: item.analysis.count,
      amountRange: item.analysis.amountRange,
      mostCommonAmount: item.analysis.mostCommonAmount,
      frequency: item.analysis.frequencyEstimate,
    })),
    estimatedMonthlyBills: totalMonthlyBills
  };
  
  const outputFile = path.join(docsDir, 'recurring_payments_analysis.json');
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Detailed report saved to: ${outputFile}`);
}

if (require.main === module) {
  main();
}

module.exports = { main, parseCSV, analyzeRecurringPatterns };

