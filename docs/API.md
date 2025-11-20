# API Documentation

Complete reference for all backend API endpoints.

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: Configure based on your deployment

## Authentication

Currently, the API does not require authentication tokens. All endpoints are accessible directly. In production, you should add authentication middleware.

## Endpoints

### Health Check

Check if the server is running.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Create Link Token

Creates a Plaid Link token for initializing the Plaid Link component.

**Endpoint:** `POST /api/create_link_token`

**Request Body:** None

**Response:**
```json
{
  "link_token": "link-sandbox-abc123...",
  "expiration": "2024-01-15T11:30:00.000Z",
  "request_id": "xyz789"
}
```

**Error Response:**
```json
{
  "error": {
    "error_code": "INVALID_CLIENT_ID",
    "error_message": "invalid client_id"
  }
}
```

**Common Errors:**
- `INVALID_CLIENT_ID` - Check your `PLAID_CLIENT_ID` in `.env`
- `INVALID_SECRET` - Check your `PLAID_SANDBOX_SECRET` or `PLAID_PRODUCTION_SECRET`

---

### Exchange Public Token

Exchanges a temporary public token for a permanent access token.

**Endpoint:** `POST /api/exchange_public_token`

**Request Body:**
```json
{
  "public_token": "public-sandbox-abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "item_id": "VJW48WlWZzF37ZJayw4qhbEB8XBpz7cWA3dD3",
  "message": "Public token exchanged successfully"
}
```

**Error Response:**
```json
{
  "error": {
    "error_code": "INVALID_PUBLIC_TOKEN",
    "error_message": "public_token is invalid"
  }
}
```

**Notes:**
- The access token is automatically saved to `app/server/data/items.json`
- The `item_id` is returned and can be used to identify the connected account

---

### Get Accounts

Retrieves account information including balances for all connected accounts.

**Endpoint:** `GET /api/accounts`

**Request Body:** None

**Response:**
```json
{
  "accounts": [
    {
      "account_id": "A3wenK5EQRfKlnxlBbVXtPw9gyazDWu1EdaZD",
      "balances": {
        "available": 100,
        "current": 110,
        "iso_currency_code": "USD",
        "limit": null,
        "unofficial_currency_code": null
      },
      "mask": "0000",
      "name": "Plaid Checking",
      "official_name": "Plaid Gold Standard 0% Interest Checking",
      "subtype": "checking",
      "type": "depository"
    }
  ],
  "item": {
    "item_id": "VJW48WlWZzF37ZJayw4qhbEB8XBpz7cWA3dD3",
    "institution_id": "ins_12"
  },
  "request_id": "C3IZlexgvNTSukt"
}
```

**Error Response:**
```json
{
  "error": "No items found. Please link an account first."
}
```

**Notes:**
- Account data is automatically saved to `app/server/data/accounts_[item_id].json`
- Returns accounts for the first connected item (can be extended to support multiple items)

---

### Get Transactions

Retrieves transaction history for the last 30 days.

**Endpoint:** `GET /api/transactions`

**Query Parameters:**
- None (currently hardcoded to last 30 days)

**Request Body:** None

**Response:**
```json
{
  "accounts": [...],
  "transactions": [
    {
      "account_id": "A3wenK5EQRfKlnxlBbVXtPw9gyazDWu1EdaZD",
      "amount": 25.50,
      "date": "2024-01-15",
      "name": "Uber",
      "merchant_name": "Uber",
      "category": ["Service", "Ride Share"],
      "transaction_id": "abc123",
      "transaction_type": "special"
    }
  ],
  "total_transactions": 50,
  "request_id": "xyz789"
}
```

**Error Response:**
```json
{
  "error": {
    "error_code": "ITEM_LOGIN_REQUIRED",
    "error_message": "the login details of this item have changed"
  }
}
```

**Notes:**
- Transaction data is automatically saved to `app/server/data/transactions_[item_id].json`
- Currently fetches last 30 days (can be extended with date range parameters)
- Common error: `ITEM_LOGIN_REQUIRED` means the user needs to reconnect their account

---

### Get Items

Retrieves all stored Plaid items (connected accounts).

**Endpoint:** `GET /api/items`

**Request Body:** None

**Response:**
```json
{
  "items": [
    {
      "item_id": "VJW48WlWZzF37ZJayw4qhbEB8XBpz7cWA3dD3",
      "access_token": "access-sandbox-abc123...",
      "created_at": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**Error Response:**
```json
{
  "error": "Error reading items"
}
```

---

## Data Storage

All data is stored in JSON files in `app/server/data/`:

- `items.json` - All connected items with access tokens
- `accounts_[item_id].json` - Account data for each item
- `transactions_[item_id].json` - Transaction data for each item

## Error Handling

All endpoints follow a consistent error format:

```json
{
  "error": {
    "error_code": "ERROR_CODE",
    "error_message": "Human readable error message"
  }
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (missing/invalid parameters)
- `404` - Not Found (no items connected)
- `500` - Internal Server Error

## Rate Limiting

Currently, there is no rate limiting implemented. In production, you should add rate limiting to prevent abuse.

## Security Notes

- Access tokens are stored in plain JSON files (not recommended for production)
- No authentication is required (add in production)
- CORS is enabled for all origins (restrict in production)

