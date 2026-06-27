# Plaid Connect

A simple application to connect to your Capital One account via Plaid and retrieve account balances and transaction history.

## Features

- 🔗 Connect Capital One account via Plaid Link
- 💰 View account balances
- 📊 View transaction history (last 30 days)
- 💾 Automatic data storage in JSON format
- 🎨 Clean, modern UI

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Plaid API credentials:
  - `PLAID_CLIENT_ID`
  - `PLAID_SANDBOX_SECRET`

## Setup Instructions

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install server dependencies
cd app/server
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `app` directory:

```bash
cd app
cp server/env.example .env
```

Edit `app/.env` and add your Plaid credentials:

```env
PLAID_CLIENT_ID=your_client_id_here
PLAID_SANDBOX_SECRET=your_sandbox_secret_here
PORT=8000
```

### 3. Start the Application

#### Option A: Run Both Servers Separately

**Terminal 1 - Backend:**
```bash
cd app/server
npm start
```

**Terminal 2 - Frontend:**
```bash
cd app/frontend
npm start
```

#### Option B: Run Both with Concurrently (if installed)

From the root directory:
```bash
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:4000
- Backend API: http://localhost:8000

## Usage

1. **Launch Plaid Link**: Click the "Launch Plaid Link" button
2. **Select Institution**: Choose "Capital One" (or any institution in Sandbox)
3. **Enter Sandbox Credentials**:
   - Username: `user_good`
   - Password: `pass_good`
   - 2FA Code (if prompted): `1234`
4. **View Data**: After successful connection, your accounts and transactions will be displayed
5. **Refresh Data**: Use the "Refresh Accounts" and "Refresh Transactions" buttons to fetch updated data

## Data Storage

All data is automatically saved to JSON files in the `app/server/data/` directory:

- `items.json` - Stored access tokens and item IDs
- `accounts_[item_id].json` - Account balance information
- `transactions_[item_id].json` - Transaction history

## API Endpoints

- `POST /api/create_link_token` - Create a Plaid Link token
- `POST /api/exchange_public_token` - Exchange public token for access token
- `GET /api/accounts` - Get account balances
- `GET /api/transactions` - Get transaction history (last 30 days)
- `GET /api/items` - Get all stored items
- `GET /api/health` - Health check

## Project Structure

```
plaidConnect/
├── app/
│   ├── server/           # Backend Express server
│   │   ├── server.js     # Main server file
│   │   ├── data/         # JSON data storage (auto-created)
│   │   └── .env          # Environment variables
│   ├── frontend/         # React frontend
│   │   ├── src/
│   │   │   ├── App.js    # Main React component
│   │   │   └── ...
│   │   └── public/
│   └── package.json      # App package.json
└── package.json          # Root package.json
```

## Development Workflow

This repository uses a **staging → main** workflow:

- 🔨 **`staging` branch**: Development branch - all work happens here
- 🔒 **`main` branch**: Protected branch - only updated via Pull Request

See the main README for commit message format and workflow details.

## Troubleshooting

### "Failed to create link token"
- Check that your `.env` file exists in the `server` directory
- Verify `PLAID_CLIENT_ID` and `PLAID_SANDBOX_SECRET` are set correctly
- Ensure the backend server is running on port 8000

### "Failed to connect to server"
- Make sure the backend server is running: `cd server && npm start`
- Check that port 8000 is not in use by another application

### CORS Errors
- The backend is configured to allow CORS from the frontend
- If you see CORS errors, verify the proxy setting in `frontend/package.json`

## Next Steps

Once you have the data, you can:
- Export to CSV/Excel
- Store in a database (SQL)
- Set up scheduled data refreshes
- Add more Plaid products (Identity, Investments, etc.)

## Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:

- **[API Documentation](./docs/API.md)** - Complete API endpoint reference
- **[Development Guide](./docs/DEVELOPMENT.md)** - Development workflow and best practices
- **[Architecture Overview](./docs/ARCHITECTURE.md)** - System design and structure
- **[Troubleshooting Guide](./docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Environment Variables](./docs/ENVIRONMENT.md)** - Configuration reference
- **[Plaid Integration Guide](./docs/PLAID_INTEGRATION.md)** - Detailed Plaid setup
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Production deployment instructions

## Resources

- [Plaid Quickstart Guide](https://plaid.com/docs/quickstart/)
- [Plaid API Documentation](https://plaid.com/docs/api/)
- [Plaid Link Documentation](https://plaid.com/docs/link/)
