# Quick Setup Guide

## Step 1: Install Dependencies

Run this command from the project root:

```bash
npm install
cd app/server && npm install && cd ../frontend && npm install
```

**Note:** The frontend uses port 4000 by default (instead of 3000) to avoid port conflicts. This is configured automatically.

## Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cd app
   cp server/env.example .env
   ```

2. Edit `app/.env` and add your Plaid credentials:
   ```env
   PLAID_CLIENT_ID=your_actual_client_id
   PLAID_SANDBOX_SECRET=your_actual_sandbox_secret
   PORT=8000
   ```

3. (Optional) For OAuth support, configure redirect URI in Plaid Dashboard:
   - Log into [Plaid Dashboard](https://dashboard.plaid.com/)
   - Go to **Team Settings** → **API**
   - Under **Allowed redirect URIs**, add:
     - Development: `http://localhost:4000/api/plaid/oauth/callback`
     - Production: `https://yourdomain.com/api/plaid/oauth/callback`
   
   **Note:** OAuth redirect URI is auto-detected in development. For production, set `PLAID_OAUTH_REDIRECT_URI` in `app/frontend/.env`.

## Step 3: Start the Application

### Terminal 1 - Start Backend:
```bash
cd app/server
npm start
```

You should see: `Server running on http://localhost:8000`

### Terminal 2 - Start Frontend:
```bash
cd app/frontend
npm start
```

The browser should automatically open to http://localhost:4000

**Note:** The frontend is configured to run on port 4000 (instead of the default 3000) to avoid conflicts. If you need to change it, you can create a `.env` file in `app/frontend/` with `PORT=3500` (or any other port).

## Step 4: Connect Your Account

1. Click "Launch Plaid Link" button
2. Search for "Capital One" or select any institution
3. Use Sandbox credentials:
   - **Username**: `user_good`
   - **Password**: `pass_good`
   - **2FA Code** (if asked): `1234`
4. After successful connection, your accounts and transactions will appear!

## Data Storage

All data is automatically saved to `app/server/data/`:
- `items.json` - Access tokens
- `accounts_[item_id].json` - Account balances
- `transactions_[item_id].json` - Transaction history

You can use these JSON files to export to CSV, Excel, or import into a database later.

## Troubleshooting

- **Backend won't start**: Check that port 8000 is available and `app/.env` file exists
- **Frontend can't connect**: Make sure backend is running first
- **Link token error**: Verify your Plaid credentials in `.env` are correct

