# Plaid Integration Guide

Comprehensive guide to integrating and using Plaid in this application.

## Overview

This application uses Plaid to connect to bank accounts and retrieve financial data. Plaid provides a secure way to access account information without storing bank credentials.

## Plaid Concepts

### Item
An **Item** represents a login at a financial institution. One user can have multiple Items (different banks or different logins at the same bank).

### Access Token
An **access token** is a permanent credential that identifies an Item. It's used to make API requests for that specific Item.

### Public Token
A **public token** is a temporary token returned by Plaid Link. It must be exchanged for an access token within a short time window.

### Link Token
A **link token** is used to initialize Plaid Link. It's short-lived and one-time use.

## Integration Flow

### 1. Create Link Token

```javascript
// Backend: app/server/server.js
app.post('/api/create_link_token', async (req, res) => {
  const response = await client.linkTokenCreate({
    user: { client_user_id: 'user_123' },
    client_name: 'Plaid Connect',
    products: ['transactions', 'auth'],
    country_codes: ['US'],
  });
  res.json(response.data);
});
```

### 2. Initialize Plaid Link

```javascript
// Frontend: app/frontend/src/App.js
const { open, ready } = usePlaidLink({
  token: linkToken,
  onSuccess: (publicToken, metadata) => {
    // Handle success
  }
});
```

### 3. Exchange Public Token

```javascript
// Backend
const response = await client.itemPublicTokenExchange({
  public_token: publicToken
});

const { access_token, item_id } = response.data;
// Save access_token securely
```

### 4. Make API Requests

```javascript
// Get accounts
const accounts = await client.accountsGet({
  access_token: accessToken
});

// Get transactions
const transactions = await client.transactionsGet({
  access_token: accessToken,
  start_date: '2024-01-01',
  end_date: '2024-01-31'
});
```

## Sandbox vs Production

### Sandbox Environment

**Purpose:** Testing and development

**Credentials:**
- Username: `user_good`
- Password: `pass_good`
- 2FA: `1234`

**Configuration:**
```javascript
basePath: PlaidEnvironments.sandbox
```

**Features:**
- Free to use
- Test data only
- No real financial impact
- Fast development

### Production Environment

**Purpose:** Live connections with real banks

**Credentials:** Real bank credentials from users

**Configuration:**
```javascript
basePath: PlaidEnvironments.production
```

**Features:**
- Real financial data
- May incur costs
- Requires proper security
- User consent required

## Products Used

### Transactions
Retrieves transaction history from connected accounts.

**Use Cases:**
- Transaction history
- Spending analysis
- Budget tracking

**API:** `transactionsGet()`

### Auth
Provides account and routing numbers for ACH transfers.

**Use Cases:**
- Account verification
- ACH transfers
- Direct deposit setup

**API:** `authGet()`

## Common Plaid API Calls

### Get Accounts
```javascript
const response = await client.accountsGet({
  access_token: accessToken
});

// Response includes:
// - accounts[]: Array of account objects
// - item: Item information
```

### Get Transactions
```javascript
const response = await client.transactionsGet({
  access_token: accessToken,
  start_date: '2024-01-01', // YYYY-MM-DD
  end_date: '2024-01-31'
});

// Response includes:
// - transactions[]: Array of transaction objects
// - total_transactions: Total count
```

### Get Item
```javascript
const response = await client.itemGet({
  access_token: accessToken
});

// Response includes:
// - item: Item details
// - status: Item status
```

## Error Handling

### Common Plaid Errors

#### `ITEM_LOGIN_REQUIRED`
The user's bank credentials have changed. They need to reconnect.

**Solution:**
```javascript
// Trigger Plaid Link update flow
const response = await client.linkTokenCreate({
  access_token: accessToken, // Include existing access token
  // ... other params
});
```

#### `INVALID_ACCESS_TOKEN`
The access token is invalid or expired.

**Solution:**
- User needs to reconnect
- Remove old token and create new link token

#### `RATE_LIMIT_EXCEEDED`
Too many API requests in a short time.

**Solution:**
- Implement rate limiting
- Add retry logic with exponential backoff
- Cache responses when possible

## Webhooks (Future)

Plaid can send webhooks for various events:

- `TRANSACTIONS` - New transactions available
- `ITEM` - Item status changes
- `AUTH` - Auth data updated

**Implementation:**
```javascript
app.post('/api/plaid/webhook', (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  
  switch (webhook_type) {
    case 'TRANSACTIONS':
      // Fetch new transactions
      break;
    case 'ITEM':
      // Handle item status change
      break;
  }
  
  res.json({ received: true });
});
```

## Security Best Practices

### 1. Store Access Tokens Securely
- Never log access tokens
- Encrypt in database
- Use secure storage

### 2. Handle Errors Gracefully
- Don't expose Plaid error details to users
- Log errors server-side
- Provide user-friendly messages

### 3. Validate User Consent
- Always get user consent before connecting
- Explain what data will be accessed
- Provide clear privacy policy

### 4. Monitor Item Status
- Check item status regularly
- Handle `ITEM_LOGIN_REQUIRED` promptly
- Notify users when reconnection needed

## Testing with Sandbox

### Test Credentials

**Standard Test User:**
- Username: `user_good`
- Password: `pass_good`
- 2FA: `1234`

**Error Scenarios:**
- `user_bad` / `pass_bood` - Invalid credentials
- `user_locked` - Locked account
- Various other test users for different scenarios

### Test Institutions

Plaid Sandbox includes test institutions:
- First Platypus Bank
- First Gingham Credit Union
- And many more

### Test Data

Sandbox provides:
- Sample accounts (checking, savings, etc.)
- Sample transactions
- Realistic account balances

## Moving to Production

### Checklist

- [ ] Switch to production environment
- [ ] Update to production secret
- [ ] Test with real bank (small test)
- [ ] Implement proper error handling
- [ ] Add user authentication
- [ ] Set up webhook endpoint
- [ ] Configure proper logging
- [ ] Review Plaid pricing
- [ ] Set up monitoring
- [ ] Create user consent flow

### Production Considerations

1. **Costs:** Understand Plaid pricing model
2. **Compliance:** Ensure PCI compliance if handling sensitive data
3. **Support:** Have support plan for user issues
4. **Monitoring:** Track API usage and errors
5. **Backup:** Have backup plan if Plaid is unavailable

## Resources

- **Plaid Docs:** https://plaid.com/docs/
- **Plaid Dashboard:** https://dashboard.plaid.com/
- **Plaid Support:** https://dashboard.plaid.com/support
- **API Reference:** https://plaid.com/docs/api/

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues.

Common Plaid-specific issues:
- Invalid credentials → Check sandbox vs production
- Item login required → User needs to reconnect
- Rate limiting → Implement request throttling

