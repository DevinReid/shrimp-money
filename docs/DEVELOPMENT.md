# Development Guide

Complete guide for developing and contributing to Plaid Connect.

## Development Workflow

This project uses a **staging → main** workflow:

1. **Work on `staging` branch** - All development happens here
2. **Test thoroughly** - Ensure everything works in staging
3. **Push to staging** - Auto-creates/updates draft PR to main
4. **Review and merge** - When ready, merge PR to main

## Getting Started

### Prerequisites

- Node.js v14 or higher
- npm v6 or higher
- Git
- Plaid account with API credentials

### Initial Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd app/server && npm install
   cd ../frontend && npm install
   ```

3. Set up environment variables:
   ```bash
   cd app
   cp server/env.example .env
   # Edit .env with your Plaid credentials
   ```

4. Start development servers:
   ```bash
   # Terminal 1 - Backend
   cd app/server
   npm start

   # Terminal 2 - Frontend
   cd app/frontend
   npm start
   ```

## Project Structure

```
plaidConnect/
├── app/
│   ├── server/              # Express backend
│   │   ├── server.js        # Main server file
│   │   ├── data/            # JSON data storage
│   │   └── package.json
│   ├── frontend/            # React frontend
│   │   ├── src/
│   │   │   ├── App.js       # Main component
│   │   │   └── ...
│   │   └── package.json
│   └── package.json
├── docs/                    # Documentation
└── package.json             # Root package.json
```

## Development Best Practices

### Code Style

- Use consistent formatting (Prettier recommended)
- Follow existing code patterns
- Add comments for complex logic
- Keep functions focused and small

### Git Workflow

1. **Create feature branch** (optional, or work directly on staging):
   ```bash
   git checkout staging
   git pull origin staging
   ```

2. **Make changes** and test locally

3. **Commit with conventional commits**:
   ```bash
   git add .
   git commit -m "feat(plaid): add new feature"
   ```

4. **Push to staging**:
   ```bash
   git push origin staging
   ```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance
- `docs` - Documentation
- `refactor` - Code refactoring
- `test` - Tests
- `perf` - Performance improvements

**Scopes:**
- `plaid` - Plaid integration
- `api` - API endpoints
- `ui` - Frontend components
- `config` - Configuration

**Examples:**
```
feat(plaid): add transaction filtering
fix(api): resolve account balance calculation error
chore(deps): update plaid sdk to latest version
```

## Adding New Features

### Backend API Endpoint

1. Add route in `app/server/server.js`:
   ```javascript
   app.get('/api/new-endpoint', async (req, res) => {
     try {
       // Implementation
       res.json({ success: true });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   ```

2. Update `docs/API.md` with endpoint documentation

3. Test the endpoint:
   ```bash
   curl http://localhost:8000/api/new-endpoint
   ```

### Frontend Component

1. Create component in `app/frontend/src/components/`:
   ```javascript
   import React from 'react';

   const NewComponent = () => {
     return <div>New Component</div>;
   };

   export default NewComponent;
   ```

2. Import and use in `App.js` or appropriate parent component

3. Add styling in component CSS file or `App.css`

## Testing

### Manual Testing

1. **Test Plaid Link Flow:**
   - Launch Plaid Link
   - Connect test account (user_good/pass_good)
   - Verify accounts load
   - Verify transactions load

2. **Test API Endpoints:**
   - Use Postman or curl
   - Test all endpoints
   - Verify error handling

### Testing Checklist

- [ ] Plaid Link opens correctly
- [ ] Account connection works
- [ ] Accounts endpoint returns data
- [ ] Transactions endpoint returns data
- [ ] Error messages are clear
- [ ] Data is saved to JSON files
- [ ] Frontend displays data correctly

## Debugging

### Backend Debugging

1. **Check server logs:**
   - Server logs errors to console
   - Check for Plaid API errors

2. **Verify environment variables:**
   ```bash
   # In app/server
   node -e "require('dotenv').config({path:'../.env'}); console.log(process.env.PLAID_CLIENT_ID)"
   ```

3. **Test Plaid connection:**
   - Verify credentials in Plaid Dashboard
   - Check environment (sandbox vs production)

### Frontend Debugging

1. **Browser DevTools:**
   - Check Console for errors
   - Network tab for API calls
   - React DevTools for component state

2. **Common Issues:**
   - CORS errors → Check backend is running
   - Link token errors → Check .env file
   - Connection errors → Verify Plaid credentials

## Environment Variables

See [ENVIRONMENT.md](./ENVIRONMENT.md) for complete reference.

Key variables:
- `PLAID_CLIENT_ID` - Your Plaid client ID
- `PLAID_SANDBOX_SECRET` - Sandbox secret key
- `PLAID_PRODUCTION_SECRET` - Production secret key (when ready)
- `PLAID_ENV` - Environment: 'sandbox' or 'production'
- `PORT` - Backend server port (default: 8000)

## Dependencies

### Backend (`app/server/package.json`)
- `express` - Web framework
- `plaid` - Plaid SDK
- `dotenv` - Environment variables
- `cors` - CORS middleware
- `fs-extra` - File system utilities

### Frontend (`app/frontend/package.json`)
- `react` - UI library
- `react-plaid-link` - Plaid Link React component
- `react-scripts` - Create React App scripts

## Common Development Tasks

### Update Plaid SDK

```bash
cd app/server
npm update plaid
```

### Add New Plaid Product

1. Update link token creation in `server.js`:
   ```javascript
   products: ['transactions', 'auth', 'new_product']
   ```

2. Add endpoint to fetch new product data

3. Update frontend to display new data

### Change Port

**Backend:**
- Update `PORT` in `app/.env`

**Frontend:**
- Update `PORT` in `app/frontend/.env` or `package.json` script

## Performance Considerations

- **Data Storage:** Currently using JSON files (consider database for production)
- **API Calls:** No caching implemented (add for production)
- **Rate Limiting:** Not implemented (add for production)

## Security Considerations

- **Access Tokens:** Stored in plain JSON (encrypt in production)
- **Authentication:** Not implemented (add in production)
- **CORS:** Open to all origins (restrict in production)
- **Environment Variables:** Never commit `.env` files

## Getting Help

- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues
- Review [PLAID_INTEGRATION.md](./PLAID_INTEGRATION.md) for Plaid-specific help
- Check Plaid documentation: https://plaid.com/docs/



