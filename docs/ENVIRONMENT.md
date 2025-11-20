# Environment Variables Reference

Complete guide to all environment variables used in Plaid Connect.

## Backend Environment Variables

Location: `app/.env`

### Required Variables

#### `PLAID_CLIENT_ID`
Your Plaid Client ID from the Plaid Dashboard.

**Where to find:**
1. Log into [Plaid Dashboard](https://dashboard.plaid.com/)
2. Go to **Team Settings** → **Keys**
3. Copy your **Client ID**

**Example:**
```env
PLAID_CLIENT_ID=5f8a9b2c3d4e5f6a7b8c9d0
```

---

#### `PLAID_SANDBOX_SECRET`
Your Plaid Sandbox Secret for testing.

**Where to find:**
1. Plaid Dashboard → **Team Settings** → **Keys**
2. Under **Sandbox**, copy the **Secret**

**Example:**
```env
PLAID_SANDBOX_SECRET=secret-sandbox-abc123def456...
```

**Note:** This is for Sandbox/testing only. Never use in production.

---

#### `PLAID_PRODUCTION_SECRET`
Your Plaid Production Secret for live connections.

**Where to find:**
1. Plaid Dashboard → **Team Settings** → **Keys**
2. Under **Production**, copy the **Secret**

**Example:**
```env
PLAID_PRODUCTION_SECRET=secret-production-xyz789...
```

**Note:** Only use this when ready for production. Keep it secure.

---

### Optional Variables

#### `PLAID_ENV`
Plaid environment to use. Controls which Plaid API environment to connect to.

**Values:**
- `sandbox` (default) - For testing
- `production` - For live connections

**Example:**
```env
PLAID_ENV=sandbox
```

**Default:** `sandbox`

---

#### `PORT`
Port number for the backend server.

**Example:**
```env
PORT=8000
```

**Default:** `8000`

---

#### `JWT_SECRET`
Secret key used to sign and verify JWT authentication tokens. **CRITICAL: Change this in production!**

**How to generate:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Example:**
```env
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

**Default:** `your-secret-key-change-in-production` (⚠️ **NOT SECURE** - must change!)

**Security Note:** Use a strong, random secret. Never commit this to version control.

---

#### `JWT_EXPIRES_IN`
JWT token expiration time. Controls how long authentication tokens remain valid.

**Format:** Number followed by time unit (s, m, h, d)

**Examples:**
```env
JWT_EXPIRES_IN=7d    # 7 days (default)
JWT_EXPIRES_IN=24h  # 24 hours
JWT_EXPIRES_IN=30m  # 30 minutes
```

**Default:** `7d`

---

## Frontend Environment Variables

Location: `app/frontend/.env`

### Optional Variables

#### `PORT`
Port number for the React development server.

**Example:**
```env
PORT=4000
```

**Default:** `3000` (or `4000` if set in package.json script)

**Note:** The frontend is configured to use port 4000 by default to avoid conflicts.

---

## Complete Example `.env` File

### For Sandbox/Development

```env
# Plaid API Credentials
PLAID_CLIENT_ID=your_client_id_here
PLAID_SANDBOX_SECRET=your_sandbox_secret_here

# Environment Configuration
PLAID_ENV=sandbox

# Server Configuration
PORT=8000

# Authentication & Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

### For Production

```env
# Plaid API Credentials
PLAID_CLIENT_ID=your_client_id_here
PLAID_PRODUCTION_SECRET=your_production_secret_here

# Environment Configuration
PLAID_ENV=production

# Server Configuration
PORT=8000

# Authentication & Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

---

## Environment Variable Security

### ⚠️ Important Security Notes

1. **Never commit `.env` files**
   - `.env` is in `.gitignore`
   - Never push secrets to Git

2. **Use different secrets for different environments**
   - Sandbox secret for testing
   - Production secret for live

3. **Rotate secrets if compromised**
   - Generate new secrets in Plaid Dashboard
   - Update `.env` files immediately

4. **Restrict access to `.env` files**
   - Only developers who need access
   - Use secure file permissions

---

## Setting Up Environment Variables

### Step 1: Create `.env` File

```bash
cd app
cp server/env.example .env
```

### Step 2: Edit `.env` File

Open `app/.env` in a text editor and add your credentials:

```env
PLAID_CLIENT_ID=your_actual_client_id
PLAID_SANDBOX_SECRET=your_actual_sandbox_secret
PORT=8000
```

### Step 3: Verify Variables Load

Test that variables are loaded correctly:

```bash
# In app/server directory
node -e "require('dotenv').config({path:'../.env'}); console.log('Client ID:', process.env.PLAID_CLIENT_ID ? 'Set' : 'Missing')"
```

---

## Environment-Specific Configuration

### Development (Sandbox)

Use sandbox credentials for testing:

```env
PLAID_ENV=sandbox
PLAID_CLIENT_ID=your_client_id
PLAID_SANDBOX_SECRET=your_sandbox_secret
```

### Production

Use production credentials for live connections:

```env
PLAID_ENV=production
PLAID_CLIENT_ID=your_client_id
PLAID_PRODUCTION_SECRET=your_production_secret
```

**Note:** The code automatically selects the correct secret based on `PLAID_ENV`.

---

## Troubleshooting

### Variables Not Loading

**Issue:** Environment variables not found

**Solutions:**
1. Verify `.env` file is in `app/` directory
2. Check file name is exactly `.env` (not `.env.txt`)
3. Restart server after changing `.env`
4. Verify no extra spaces or quotes around values

### Wrong Environment

**Issue:** Using sandbox secret in production or vice versa

**Solution:**
- Check `PLAID_ENV` matches the secret type
- Verify correct secret is set for the environment

### Port Conflicts

**Issue:** Port already in use

**Solution:**
- Change `PORT` in `.env` to an available port
- Or kill the process using the port

---

## Best Practices

1. **Use `.env.example` as template**
   - Keep example file updated
   - Don't include real secrets

2. **Document required variables**
   - Update this file when adding new variables
   - Include in setup instructions

3. **Validate on startup**
   - Check required variables exist
   - Show clear error if missing

4. **Use different files for different environments**
   - `.env.development`
   - `.env.production`
   - Load based on `NODE_ENV`

---

## Related Documentation

- [Setup Guide](../SETUP.md) - Initial setup instructions
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues

