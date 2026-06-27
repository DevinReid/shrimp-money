# Data Deletion and Retention Policy

## Overview

This document outlines the data deletion and retention policy for Plaid Connect, ensuring compliance with data privacy laws and secure data management.

## Data Types and Retention Periods

### 1. User Account Data
**Location:** `app/frontend/lib/data/users.json`

**Data Stored:**
- Username
- Hashed password
- MFA secret (encrypted)
- Account creation date
- Last login timestamp

**Retention Period:** **Indefinite** (until user account is deleted)
- User accounts are retained until explicitly deleted by the user
- Users can delete their accounts at any time through the account settings

**Deletion Trigger:**
- User-initiated account deletion
- Manual administrative deletion

---

### 2. Plaid Access Tokens (Items)
**Location:** `app/frontend/lib/data/items.json`

**Data Stored:**
- Plaid item ID
- Access token (encrypted in production)
- Connection creation date

**Retention Period:** **Until account disconnection**
- Access tokens are retained while the account is actively connected
- Automatically deleted when user disconnects the account
- Deleted when user account is deleted

**Deletion Trigger:**
- User disconnects account
- User account deletion
- Access token becomes invalid (requires manual cleanup)

---

### 3. Account Balance Data
**Location:** `app/frontend/lib/data/accounts_[item_id].json`

**Data Stored:**
- Account balances
- Account information (name, type, etc.)
- Last updated timestamp

**Retention Period:** **90 days**
- Account data is refreshed from Plaid API on each request
- Old cached data is automatically purged after 90 days
- Data can be refreshed at any time by fetching from Plaid

**Deletion Trigger:**
- Automatic cleanup after 90 days
- Manual deletion when account is disconnected
- User account deletion

---

### 4. Transaction Data
**Location:** `app/frontend/lib/data/transactions_[item_id].json`

**Data Stored:**
- Transaction history
- Transaction details (amount, date, merchant, etc.)
- Last fetched timestamp

**Retention Period:** **1 year**
- Transaction data is retained for 1 year for financial record-keeping
- After 1 year, old transactions are automatically purged
- Recent transactions (last 30 days) are always available from Plaid API

**Deletion Trigger:**
- Automatic cleanup after 1 year
- Manual deletion when account is disconnected
- User account deletion

---

## Data Deletion Procedures

### Automatic Cleanup

The system includes automatic cleanup functions that:
1. **Daily Cleanup** (recommended to run via cron/scheduler):
   - Removes account data older than 90 days
   - Removes transaction data older than 1 year
   - Logs all deletions for audit purposes

2. **On Account Disconnection**:
   - Immediately deletes all associated account and transaction data
   - Removes access token from items.json
   - Logs the deletion event

3. **On User Account Deletion**:
   - Deletes user account data
   - Deletes all associated Plaid items
   - Deletes all associated account and transaction data
   - Logs comprehensive deletion event

### Manual Deletion

Users and administrators can manually delete data through:
1. **API Endpoints**:
   - `DELETE /api/data/user/:userId` - Delete user account and all associated data
   - `DELETE /api/data/item/:itemId` - Delete Plaid item and associated data
   - `DELETE /api/data/cleanup` - Run automatic cleanup manually

2. **Frontend UI** (to be implemented):
   - Account settings page with "Delete Account" option
   - Disconnect account button
   - Data management dashboard

---

## Secure Deletion

All data deletion operations:
- **Permanently remove** data from JSON files (not just marked as deleted)
- **Log deletion events** with timestamp and user ID
- **Verify deletion** was successful
- **Handle errors gracefully** with rollback if needed

---

## Compliance

This policy ensures compliance with:
- **GDPR** (General Data Protection Regulation)
  - Right to erasure (Article 17)
  - Data minimization (Article 5)
- **CCPA** (California Consumer Privacy Act)
  - Right to deletion
  - Data retention limits
- **Plaid Security Requirements**
  - Secure data handling
  - Defined retention periods
  - Deletion procedures

---

## Policy Review

This policy should be reviewed and updated:
- **Annually** or when legal requirements change
- When new data types are added to the system
- When retention periods need adjustment
- After security audits

**Last Updated:** November 20, 2025

---

## Implementation

See `app/frontend/lib/dataRetention.js` for the implementation of data deletion and retention functions.

