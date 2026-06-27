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

#### `ENCRYPTION_KEY`
256-bit encryption key for AES-256-GCM data encryption at-rest. **CRITICAL: Required for data security!**

**How to generate:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example:**
```env
ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

**Note:** 
- Must be exactly 64 characters (hexadecimal)
- Never commit to version control
- Store in `.env.local` (gitignored)
- Use different keys for development and production
- Backup securely (password manager)

**Default:** Not set (encryption disabled - ⚠️ **NOT SECURE**)

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

Location: `app/frontend/.env` or `app/frontend/.env.local`

### Optional Variables

#### `PORT`
Port number for the Next.js development server.

**Example:**
```env
PORT=4000
```

**Default:** `3000` (or `4000` if set in package.json script)

**Note:** The frontend is configured to use port 4000 by default to avoid conflicts.

---

#### `PLAID_OAUTH_REDIRECT_URI`
Base URL for OAuth redirects. Used to construct the full OAuth callback URL.

**Format:** Base URL without path (the `/api/plaid/oauth/callback` path is appended automatically)

**Examples:**
```env
# Production
PLAID_OAUTH_REDIRECT_URI=https://yourdomain.com

# Development (usually auto-detected, but can be set explicitly)
PLAID_OAUTH_REDIRECT_URI=http://localhost:4000
```

**Default:** Auto-detected from request headers in development

**Note:** 
- Must match the redirect URI configured in Plaid Dashboard
- For production, set this explicitly
- The full redirect URI will be: `${PLAID_OAUTH_REDIRECT_URI}/api/plaid/oauth/callback`

---

#### `NEXT_PUBLIC_APP_URL`
Public-facing URL of your application. Used for OAuth redirects and other absolute URLs.

**Examples:**
```env
# Production
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Development
NEXT_PUBLIC_APP_URL=http://localhost:4000
```

**Default:** Auto-detected from request headers

**Note:**
- Used as fallback if `PLAID_OAUTH_REDIRECT_URI` is not set
- The `NEXT_PUBLIC_` prefix makes this available to client-side code

---

#### `ADMIN_USERNAME`
Hardcoded username for single-user deployments. When set, registration is bypassed and only this user can log in.

**Example:**
```env
ADMIN_USERNAME=admin
```

**Note:** Must be used together with `ADMIN_PASSWORD_HASH`

---

#### `ADMIN_PASSWORD_HASH`
Bcrypt hash of the admin password. Generate using the script below.

**Example:**
```env
ADMIN_PASSWORD_HASH=$2a$10$YourHashedPasswordHere
```

**How to Generate:**
```bash
# From app/frontend directory
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('yourpassword', 10).then(h=>console.log(h))"
```

**Note:** 
- Must be used together with `ADMIN_USERNAME`
- When both are set, the app uses hardcoded credentials instead of file-based storage
- Perfect for single-user deployments on platforms without persistent storage

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

# OAuth Configuration (Frontend: app/frontend/.env)
PLAID_OAUTH_REDIRECT_URI=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
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

