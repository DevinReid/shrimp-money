# Data Architecture Analysis

## Current Structure

### Where Data is Stored

1. **PlaidTransactionCategory** (PostgreSQL table)
   - Stores: `transaction_id` → `category` mappings
   - Count: 1,893 records
   - **Does NOT store**: Transaction amounts, dates, merchant names
   - Purpose: User-assigned categories only

2. **PlaidTransactionData** (PostgreSQL table)
   - Stores: One record per `itemId` (bank account)
   - Contains: A **huge JSON blob** with all transactions
   - Current: 1 record with 1,346 transactions in JSON array
   - **This is where transaction amounts, dates, names are stored**

### The Problem

**Data Mismatch:**
- 1,893 transactions have been categorized
- Only 1,346 transactions exist in the JSON blob
- **553 categorized transactions are "orphaned"** (category exists, but transaction data is missing)

**Root Cause:**
- CSV imports created category records with IDs like `csv_3413_20251126_7_cq4trhjtp`
- But those CSV transactions were never imported into `PlaidTransactionData`
- So we have categories pointing to transactions that don't exist

### Current Data Flow

```
User categorizes transaction
    ↓
PlaidTransactionCategory.created (transaction_id → category)
    ↓
Spending Analysis reads:
    1. PlaidTransactionData.transactions (JSON blob) ← Gets amounts/dates
    2. PlaidTransactionCategory ← Gets category assignments
    3. Matches by transaction_id
    ↓
Problem: 553 transaction_ids in categories don't exist in JSON blob
```

## Issues with Current Architecture

1. **Single JSON Blob**
   - All 1,346 transactions in one huge JSON field
   - Hard to query efficiently
   - No indexing on dates, amounts, categories
   - Risk: If JSON gets corrupted, lose everything

2. **No Backup/Redundancy**
   - Categories and transactions stored separately
   - If they get out of sync, data is incomplete
   - No way to recover missing transaction data

3. **Orphaned Data**
   - 553 categories with no matching transactions
   - Spending totals are incomplete
   - Can't show full picture

## Recommended Solutions

### Short Term (Quick Fix)
1. ✅ **Show warnings** about missing transactions (DONE)
2. ⚠️ **Create cleanup script** to remove orphaned categories
3. ⚠️ **Add CSV import** to properly import missing transactions

### Long Term (Proper Fix)
1. **Normalize Transaction Data**
   - Create `PlaidTransaction` table (one row per transaction)
   - Store: transaction_id, amount, date, name, merchant, account_id, etc.
   - Benefits:
     - Can query efficiently
     - Can index on dates, amounts
     - Can join with categories easily
     - Can backup/restore individual transactions

2. **Migration Strategy**
   - Extract all transactions from JSON blob
   - Insert into new `PlaidTransaction` table
   - Update all queries to use new table
   - Keep JSON blob as backup for a while

3. **Data Integrity**
   - Add foreign key: `PlaidTransactionCategory.transactionId → PlaidTransaction.id`
   - This prevents orphaned categories
   - Database enforces data consistency

## Next Steps

1. **Immediate**: The UI now shows warnings about missing transactions
2. **Soon**: Create script to identify and optionally import CSV transactions
3. **Later**: Consider normalizing transaction data into proper table structure

