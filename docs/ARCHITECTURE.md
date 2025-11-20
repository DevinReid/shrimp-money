# Architecture Overview

High-level overview of the Plaid Connect system architecture.

## System Overview

Plaid Connect is a full-stack application that connects to bank accounts via Plaid API to retrieve account balances and transaction history.

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │────────│   React     │────────│   Express   │
│  (Frontend) │         │  Frontend   │         │   Backend   │
└─────────────┘         └─────────────┘         └─────────────┘
                                                         │
                                                         │
                                                ┌────────▼────────┐
                                                │   Plaid API    │
                                                │   (External)   │
                                                └─────────────────┘
```

## Technology Stack

### Frontend
- **React 18** - UI framework
- **react-plaid-link** - Plaid Link React component
- **React Scripts** - Build tooling

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **Plaid SDK** - Official Plaid Node.js SDK
- **fs-extra** - File system utilities

### Data Storage
- **JSON Files** - Current implementation
  - `items.json` - Access tokens
  - `accounts_[item_id].json` - Account data
  - `transactions_[item_id].json` - Transaction data

## Application Flow

### 1. Initialization
```
User opens app → Frontend requests link token → Backend creates token → Frontend receives token
```

### 2. Account Linking
```
User clicks "Launch Plaid Link" → Plaid Link modal opens → User selects bank → User enters credentials → 
Plaid returns public_token → Frontend sends to backend → Backend exchanges for access_token → 
Access token saved to items.json
```

### 3. Data Retrieval
```
User views accounts → Frontend requests /api/accounts → Backend fetches from Plaid → 
Data saved to JSON → Response sent to frontend → UI displays accounts
```

## Directory Structure

```
plaidConnect/
├── app/
│   ├── server/                 # Backend
│   │   ├── server.js          # Main Express server
│   │   ├── data/              # JSON data storage
│   │   │   ├── items.json
│   │   │   ├── accounts_*.json
│   │   │   └── transactions_*.json
│   │   ├── package.json
│   │   └── env.example
│   │
│   ├── frontend/               # Frontend
│   │   ├── src/
│   │   │   ├── App.js         # Main React component
│   │   │   ├── App.css        # Styles
│   │   │   ├── index.js       # Entry point
│   │   │   └── index.css      # Global styles
│   │   ├── public/
│   │   │   └── index.html
│   │   ├── package.json
│   │   └── env.example
│   │
│   └── package.json            # Workspace config
│
├── docs/                       # Documentation
│   ├── API.md
│   ├── DEVELOPMENT.md
│   ├── TROUBLESHOOTING.md
│   └── ...
│
└── package.json                # Root package.json
```

## Component Architecture

### Frontend Components

#### `App.js` - Main Component
- Manages application state
- Handles Plaid Link integration
- Fetches and displays account/transaction data
- Error handling and loading states

**State Management:**
- `linkToken` - Plaid Link token
- `accessToken` - Item ID after connection
- `accounts` - Account data
- `transactions` - Transaction data
- `loading` - Loading state
- `error` - Error messages

#### Plaid Link Integration
```javascript
const { open, ready } = usePlaidLink({
  token: linkToken,
  onSuccess: handleSuccess
});
```

### Backend Architecture

#### Express Server (`server.js`)

**Middleware:**
- `cors()` - Enable CORS
- `express.json()` - Parse JSON bodies

**Routes:**
- `POST /api/create_link_token` - Create Plaid Link token
- `POST /api/exchange_public_token` - Exchange public token
- `GET /api/accounts` - Get account balances
- `GET /api/transactions` - Get transaction history
- `GET /api/items` - Get stored items
- `GET /api/health` - Health check

**Data Storage:**
- Helper functions for reading/writing JSON files
- Automatic data persistence on API calls

## Data Flow

### Link Token Creation
```
Frontend → POST /api/create_link_token
Backend → Plaid API (linkTokenCreate)
Backend → Returns link_token
Frontend → Stores link_token for Plaid Link
```

### Account Connection
```
User → Plaid Link Modal → Enters credentials
Plaid → Returns public_token (via onSuccess callback)
Frontend → POST /api/exchange_public_token { public_token }
Backend → Plaid API (itemPublicTokenExchange)
Backend → Receives access_token and item_id
Backend → Saves to items.json
Backend → Returns success
Frontend → Automatically fetches accounts and transactions
```

### Data Retrieval
```
Frontend → GET /api/accounts
Backend → Reads items.json for access_token
Backend → Plaid API (accountsGet)
Backend → Saves response to accounts_[item_id].json
Backend → Returns account data
Frontend → Updates state and displays accounts
```

## Security Considerations

### Current Implementation
- Access tokens stored in plain JSON files
- No authentication required
- CORS enabled for all origins
- Environment variables in `.env` file

### Production Recommendations
- Encrypt access tokens
- Add authentication (JWT, OAuth, etc.)
- Restrict CORS to specific origins
- Use environment-specific configuration
- Implement rate limiting
- Add request validation
- Use HTTPS only
- Store tokens in secure database

## Scalability Considerations

### Current Limitations
- Single item support (first item only)
- JSON file storage (not scalable)
- No caching
- No pagination for transactions
- Synchronous file operations

### Future Improvements
- Support multiple items/users
- Database storage (PostgreSQL, MongoDB)
- Redis caching
- Transaction pagination
- Background job processing
- Webhook handling for updates
- Async file operations

## API Design

### RESTful Principles
- Resource-based URLs (`/api/accounts`, `/api/transactions`)
- HTTP methods (GET, POST)
- JSON request/response format
- Consistent error handling

### Error Handling
```json
{
  "error": {
    "error_code": "ERROR_CODE",
    "error_message": "Human readable message"
  }
}
```

## Integration Points

### Plaid API Integration
- **Link Token Creation** - Initialize Plaid Link
- **Token Exchange** - Convert public to access token
- **Accounts API** - Retrieve account information
- **Transactions API** - Retrieve transaction history

### Plaid Products Used
- **Transactions** - Transaction history
- **Auth** - Account authentication

## Development vs Production

### Development (Sandbox)
- Uses `PlaidEnvironments.sandbox`
- Test credentials (user_good/pass_good)
- No real financial data
- Free to use

### Production
- Uses `PlaidEnvironments.production`
- Real bank credentials
- Real financial data
- May incur costs based on plan

## Future Enhancements

### Planned Features
- Multiple account support
- Database integration
- User authentication
- Scheduled data refreshes
- Export to CSV/Excel
- Transaction filtering/search
- Account aggregation
- Webhook support

### Technical Debt
- Replace JSON storage with database
- Add comprehensive error handling
- Implement proper logging
- Add unit/integration tests
- Add API documentation (OpenAPI/Swagger)

## Related Documentation

- [API Documentation](./API.md) - Detailed API reference
- [Development Guide](./DEVELOPMENT.md) - Development workflow
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment

