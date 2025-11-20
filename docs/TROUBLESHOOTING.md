# Troubleshooting Guide

Common issues and their solutions.

## Backend Issues

### Server Won't Start

**Error:** `Error: Cannot find module 'express'`

**Solution:**
```bash
cd app/server
npm install
```

---

**Error:** `Port 8000 is already in use`

**Solution:**
1. Find process using port 8000:
   ```bash
   # Windows
   netstat -ano | findstr :8000
   
   # Mac/Linux
   lsof -i :8000
   ```

2. Kill the process or change port in `app/.env`:
   ```env
   PORT=8001
   ```

---

**Error:** `PLAID_CLIENT_ID is not defined`

**Solution:**
1. Verify `.env` file exists in `app/` directory
2. Check `.env` has `PLAID_CLIENT_ID` set
3. Restart the server after adding variables

---

### Plaid API Errors

**Error:** `INVALID_CLIENT_ID`

**Solution:**
- Verify your `PLAID_CLIENT_ID` in `app/.env`
- Check it matches your Plaid Dashboard
- Ensure no extra spaces or quotes

---

**Error:** `INVALID_SECRET`

**Solution:**
- Verify `PLAID_SANDBOX_SECRET` (for sandbox) or `PLAID_PRODUCTION_SECRET` (for production)
- Check environment matches secret type
- Ensure secret is complete (not truncated)

---

**Error:** `ITEM_LOGIN_REQUIRED`

**Solution:**
- User needs to reconnect their account
- The bank credentials have changed
- Use Plaid Link to reconnect the account

---

## Frontend Issues

### Frontend Won't Start

**Error:** `Port 4000 is already in use`

**Solution:**
1. Find and kill process using port 4000, or
2. Create `app/frontend/.env` with different port:
   ```env
   PORT=4001
   ```

---

**Error:** `Module not found: Can't resolve 'react-plaid-link'`

**Solution:**
```bash
cd app/frontend
npm install
```

---

### Plaid Link Issues

**Error:** "Failed to create link token"

**Possible Causes:**
1. Backend server not running
2. Invalid Plaid credentials in `.env`
3. CORS issues

**Solution:**
1. Verify backend is running on port 8000
2. Check browser console for errors
3. Verify `.env` file has correct credentials
4. Check backend logs for Plaid API errors

---

**Error:** "Phone number validation error"

**Solution:**
- You're using **real bank credentials** instead of sandbox test credentials
- In Sandbox mode, use:
  - Username: `user_good`
  - Password: `pass_good`
  - 2FA: `1234`
- Click "Continue as guest" if prompted for phone number

---

**Error:** Link modal doesn't open

**Solution:**
1. Check browser console for JavaScript errors
2. Verify `linkToken` is set (check Network tab)
3. Ensure backend `/api/create_link_token` endpoint works
4. Check that Plaid Link script is loaded

---

### Data Display Issues

**Error:** Accounts not showing

**Solution:**
1. Verify account was successfully connected
2. Check `app/server/data/items.json` has an item
3. Check browser console for API errors
4. Verify `/api/accounts` endpoint returns data:
   ```bash
   curl http://localhost:8000/api/accounts
   ```

---

**Error:** Transactions not showing

**Solution:**
1. Verify transactions endpoint works:
   ```bash
   curl http://localhost:8000/api/transactions
   ```
2. Check `app/server/data/transactions_[item_id].json` exists
3. Verify account has transactions in the last 30 days
4. Check browser console for errors

---

## Connection Issues

### CORS Errors

**Error:** `Access to fetch at 'http://localhost:8000/api/...' from origin 'http://localhost:4000' has been blocked by CORS policy`

**Solution:**
- Backend has CORS enabled, but verify:
  ```javascript
  app.use(cors());
  ```
- Ensure backend is running
- Check frontend proxy setting in `package.json`:
  ```json
  "proxy": "http://localhost:8000"
  ```

---

### Network Errors

**Error:** `Failed to fetch` or `Network request failed`

**Solution:**
1. Verify backend server is running
2. Check backend is on correct port (8000)
3. Verify no firewall blocking localhost
4. Check browser console for detailed error

---

## Data Storage Issues

### JSON Files Not Created

**Solution:**
1. Verify `app/server/data/` directory exists
2. Check file permissions (server needs write access)
3. Check server logs for file system errors

---

### Data Not Persisting

**Solution:**
1. Verify `app/server/data/` is not in `.gitignore` (it should be)
2. Check file permissions
3. Verify `fs-extra` package is installed
4. Check server logs for save errors

---

## Environment-Specific Issues

### Sandbox vs Production

**Issue:** Using production credentials in sandbox mode

**Solution:**
- Use `PLAID_SANDBOX_SECRET` for sandbox
- Use `PLAID_PRODUCTION_SECRET` for production
- Set `PLAID_ENV=production` for production mode

---

### Windows-Specific Issues

**Issue:** `PORT=4000` not working in npm script

**Solution:**
- Use `cross-env` package (already added)
- Or create `app/frontend/.env` with `PORT=4000`

---

## Getting More Help

1. **Check Logs:**
   - Backend: Console output
   - Frontend: Browser DevTools Console

2. **Verify Configuration:**
   - Environment variables in `app/.env`
   - Plaid Dashboard settings
   - Port availability

3. **Test Endpoints:**
   ```bash
   # Health check
   curl http://localhost:8000/api/health
   
   # Create link token
   curl -X POST http://localhost:8000/api/create_link_token
   ```

4. **Plaid Resources:**
   - Plaid Docs: https://plaid.com/docs/
   - Plaid Support: https://dashboard.plaid.com/support

5. **Check Documentation:**
   - [API.md](./API.md) - Endpoint reference
   - [PLAID_INTEGRATION.md](./PLAID_INTEGRATION.md) - Plaid setup
   - [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide

