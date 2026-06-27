# MFA Database Storage Setup

Your MFA/authenticator setup is now configured to store data in PostgreSQL, so it persists across server restarts and works in both local and production environments.

## How It Works

### Setup Once, Works Everywhere

1. **Set up MFA locally** (pointing to your staging database)
2. **MFA secret is saved to the database** (encrypted)
3. **Production uses the same database** → MFA works automatically!

### Database Storage Priority

The system checks in this order:
1. **Database** (if `DATABASE_URL` is set) ← **Primary storage**
2. Environment variables (`ADMIN_MFA_SECRET`) ← Fallback
3. File storage (`admin_mfa.json`) ← Last resort

## Setup Instructions

### 1. Ensure Database Connection

Make sure `DATABASE_URL` is set in your `.env` file:

```env
DATABASE_URL=postgresql://nexus_staging_5i85_user:password@host/database
```

### 2. Set Up MFA (One Time)

1. **Start your local development server:**
   ```bash
   npm run dev
   ```

2. **Log in** to your app (as admin user)

3. **Navigate to MFA Setup** (usually in settings or after login)

4. **Scan the QR code** with your authenticator app (Google Authenticator, Authy, etc.)

5. **Verify the code** - Enter the 6-digit code from your app

6. **Done!** The MFA secret is now saved in the database

### 3. Verify It's Working

Run the test script to check:

```bash
node scripts/test-mfa-db.js
```

You should see:
```
✅ Prisma Client initialized with database connection
📋 Admin MFA Record Found:
   - MFA Enabled: true
   - Has Secret: true
```

## Environment Setup

### Local Development

Your `.env` file should point to your **staging database**:

```env
DATABASE_URL=postgresql://nexus_staging_5i85_user:password@dpg-d4ebmrm3jp1c73c2vgt0-a.oregon-postgres.render.com/nexus_staging_5i85
```

### Production (Render)

Set the same `DATABASE_URL` in your Render environment variables, OR use your production database URL if you have a separate one.

**Important:** If you use the same database for staging and production, setting up MFA once will work in both environments automatically!

## How Data is Stored

### Admin User MFA
- **Table:** `plaid_admin_mfa`
- **Record ID:** `"admin"` (single record)
- **Fields:**
  - `mfaSecret` - Encrypted TOTP secret
  - `mfaEnabled` - Boolean flag
  - `updatedAt` - Last update timestamp

### Regular Users (Future)
- **Table:** `plaid_users`
- Each user has their own MFA secret stored in their user record

## Troubleshooting

### "MFA not working after server restart"
- ✅ **Fixed!** MFA is now stored in the database, not files
- Check that `DATABASE_URL` is set correctly

### "Can't connect to database"
- Verify `DATABASE_URL` is correct
- Check database is accessible from your network
- For Render: Use the "Internal Database URL" for services in the same region

### "MFA setup worked locally but not in production"
- If using separate databases: Set up MFA in production separately
- If using same database: Should work automatically!
- Check that production has `DATABASE_URL` set

## Migration from File Storage

If you had MFA set up using file storage:

1. The system will automatically use the database once `DATABASE_URL` is set
2. Old file-based MFA data will be ignored
3. You'll need to set up MFA again (one time) to save it to the database

## Security Notes

- ✅ MFA secrets are **encrypted** before storage
- ✅ Uses the same encryption key as before (`ENCRYPTION_KEY`)
- ✅ Database connection is secure (SSL by default on Render)
- ✅ Secrets never appear in logs or environment variables (when using DB)

## Next Steps

1. **Set up MFA locally** (one time)
2. **Verify it works** by logging in and using MFA
3. **Deploy to production** - MFA will work automatically if using the same database!

That's it! Your MFA setup is now persistent and will survive server restarts. 🎉

