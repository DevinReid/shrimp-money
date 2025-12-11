# Cron Job Setup for Automated Data Fetching

This document explains how to set up automated data fetching using cron jobs.

## Overview

Once you've connected your bank account through the UI, the connection persists. You can then set up automated scripts to fetch account balances and transactions without user interaction.

## Prerequisites

1. **Connected Account**: You must have connected your bank account at least once through the UI
2. **Environment Variables**: All required environment variables must be set in your `.env` file

## Script Usage

### Manual Run

Test the script manually first:

```bash
cd app/frontend
node scripts/fetch-plaid-data.js
```

### Cron Job Setup

#### Linux/Mac (crontab)

Edit your crontab:
```bash
crontab -e
```

Add a line to run the script daily at 2 AM:
```cron
0 2 * * * cd /path/to/plaidConnect/app/frontend && /usr/bin/node scripts/fetch-plaid-data.js >> /path/to/logs/plaid-fetch.log 2>&1
```

Or run every 6 hours:
```cron
0 */6 * * * cd /path/to/plaidConnect/app/frontend && /usr/bin/node scripts/fetch-plaid-data.js >> /path/to/logs/plaid-fetch.log 2>&1
```

#### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., Daily at 2 AM)
4. Set action: Start a program
5. Program: `node`
6. Arguments: `C:\path\to\plaidConnect\app\frontend\scripts\fetch-plaid-data.js`
7. Start in: `C:\path\to\plaidConnect\app\frontend`

#### Render.com (Cron Jobs)

If deploying to Render, you can use Render's Cron Jobs feature:

1. Go to your Render dashboard
2. Create a new Cron Job
3. Set the schedule (e.g., `0 2 * * *` for daily at 2 AM)
4. Command: `cd app/frontend && node scripts/fetch-plaid-data.js`
5. Environment: Production

## What Gets Fetched

- **Account Balances**: Current and available balances for all connected accounts
- **Transactions**: Last 30 days of transactions (can be modified in the script)

## Data Storage

Data is automatically saved to:
- `lib/data/accounts_[item_id].json` - Account balances
- `lib/data/transactions_[item_id].json` - Transaction history

## Error Handling

The script handles common errors:

- **ITEM_LOGIN_REQUIRED**: Bank requires re-authentication (user must reconnect)
- **RATE_LIMIT_EXCEEDED**: Too many requests (wait before retrying)
- **No Connection Found**: Account not connected yet

## Extending the Script

You can modify `scripts/fetch-plaid-data.js` to:

1. **Fetch more history**: Change the date range for transactions
2. **Send notifications**: Add email/Slack notifications on errors
3. **Process data**: Add subscription detection or other analysis
4. **Multiple accounts**: Loop through multiple connected items

## Example: Fetch Full Year for Subscription Analysis

To fetch a full year of data for subscription analysis:

```javascript
// In fetch-plaid-data.js, change:
const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
// And update the transactionsGet call to use oneYearAgo instead of thirtyDaysAgo
```

## Security Notes

- The script uses the same authentication as the web app
- Access tokens are encrypted in storage
- Never commit `.env` files or access tokens to version control
- Use environment variables for all sensitive data

## Troubleshooting

### Script fails with "No Plaid connection found"
- Make sure you've connected an account through the UI at least once
- Check that `lib/data/items.json` exists and contains your item

### Script fails with authentication errors
- Verify all environment variables are set correctly
- Check that `DATABASE_URL` is accessible
- Ensure `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are correct

### Rate limiting
- Plaid has rate limits on API calls
- If hitting limits, reduce the frequency of cron jobs
- Consider caching data and only fetching when needed







