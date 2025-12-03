# Prisma Database Setup for MFA/Auth Storage

This project now uses PostgreSQL (via Prisma) to store MFA/authenticator information persistently, instead of file-based storage that gets lost on server restarts.

## Setup Instructions

### 1. Configure Database Connection

Add your PostgreSQL connection string to your environment variables:

```bash
DATABASE_URL=postgresql://user:password@host:port/database?schema=public
```

**For Render:**
- Get your connection string from your Render PostgreSQL database dashboard
- Add it as an environment variable in your Render service settings

### 2. Run Database Migration

Create the tables in your database:

```bash
cd app/frontend
npx prisma migrate dev --name init_plaid_auth
```

This will create two tables:
- `plaid_users` - Stores user accounts and MFA secrets
- `plaid_admin_mfa` - Stores admin MFA configuration

### 3. Verify Setup

The application will automatically:
- Use the database if `DATABASE_URL` is set
- Fall back to file storage if the database is not available
- Migrate existing file-based data to the database when you first use it

## Table Structure

### `plaid_users`
- `id` - Unique user ID
- `username` - Unique username
- `password` - Bcrypt hashed password
- `mfaSecret` - Encrypted MFA secret (nullable)
- `mfaEnabled` - Boolean flag for MFA status
- `createdAt` - Account creation timestamp
- `updatedAt` - Last update timestamp

### `plaid_admin_mfa`
- `id` - Always "admin" (single record)
- `mfaSecret` - Encrypted MFA secret (nullable)
- `mfaEnabled` - Boolean flag for MFA status
- `updatedAt` - Last update timestamp

## Notes

- **Table Prefixes**: Tables use `plaid_` prefix to avoid conflicts with other projects in the same database
- **Backward Compatibility**: The system falls back to file storage if `DATABASE_URL` is not set
- **Encryption**: MFA secrets are encrypted before storage (using existing encryption utilities)
- **Admin User**: Admin MFA is stored separately and can also use environment variables as fallback

## Important: Shared Database with Other Projects

**✅ Safe to Share**: This Prisma project only manages the `plaid_users` and `plaid_admin_mfa` tables. 

**Migration Safety**: 
- Your other project's Prisma migrations will **NOT** touch these tables
- Each Prisma project only manages models defined in its own `schema.prisma`
- The `plaid_` prefix ensures no naming conflicts
- You can run migrations for both projects independently

**Best Practice**: 
- Keep migrations separate per project
- Use different migration directories (already configured)
- Each project's migrations only affect its own tables

## Migration from File Storage

If you have existing file-based MFA data:

1. Set up the database connection
2. Run the migration
3. The next time you set up MFA, it will be saved to the database
4. Old file-based data will be ignored once database is active

## Troubleshooting

**Error: "Prisma Client not generated"**
```bash
npx prisma generate
```

**Error: "Database connection failed"**
- Verify `DATABASE_URL` is set correctly
- Check database credentials and network access
- Ensure the database exists and is accessible

**Tables not created**
```bash
npx prisma migrate deploy
```

