# Render Database Setup Guide

Since Render's free tier doesn't include persistent disks, we need to use a database to store user data and Plaid items.

## Option 1: Render PostgreSQL (Recommended - Free Tier Available)

### Step 1: Create PostgreSQL Database in Render

1. Go to Render Dashboard
2. Click "New +" → "PostgreSQL"
3. Configure:
   - **Name:** `plaid-connect-db` (or your choice)
   - **Database:** `plaid_connect`
   - **User:** Auto-generated (save this!)
   - **Region:** Same as your web service
   - **PostgreSQL Version:** Latest
   - **Plan:** Free (512 MB RAM, shared CPU)
4. Click "Create Database"
5. **Save the connection string** - you'll need it!

### Step 2: Get Connection String

After creating the database:
- Go to your database in Render dashboard
- Copy the "Internal Database URL" (for services in same region)
- Or use "External Connection String" if needed

It will look like:
```
postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/plaid_connect
```

### Step 3: Add to Environment Variables

In your web service → Environment tab, add:
```
DATABASE_URL=postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/plaid_connect
```

### Step 4: Install Database Package

We'll need to add `pg` (PostgreSQL client) to the project.

---

## Option 2: MongoDB Atlas (Free Tier - 512 MB)

### Step 1: Create MongoDB Atlas Account

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for free
3. Create a free cluster (M0 - Free tier)

### Step 2: Get Connection String

1. In Atlas dashboard → Connect
2. Choose "Connect your application"
3. Copy the connection string
4. Replace `<password>` with your database password

### Step 3: Add to Environment Variables

In Render → Environment tab:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/plaid_connect?retryWrites=true&w=majority
```

---

## Option 3: Supabase (Free Tier - PostgreSQL)

1. Go to https://supabase.com
2. Create free account
3. Create new project
4. Get connection string from Settings → Database
5. Add `DATABASE_URL` to Render environment variables

---

## Quick Fix: Use Environment Variables for Single User (Temporary)

For testing only, you could store a single test user in environment variables, but this is NOT recommended for production.

---

## Recommended Next Steps

1. **For immediate testing:** Use Render PostgreSQL (free tier)
2. **For production:** Upgrade to paid Render plan OR use external database
3. **Migrate code:** Update auth.js and plaid.js to use database instead of file system

Would you like me to set up the database integration code?

