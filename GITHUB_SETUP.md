# GitHub Setup Walkthrough

This guide will walk you through connecting your local repository to GitHub with the staging → main workflow.

## Step 1: Create a GitHub Repository

1. **Go to GitHub**: Visit [github.com](https://github.com) and sign in to your account
2. **Create New Repository**:
   - Click the "+" icon in the top right corner
   - Select "New repository"
3. **Repository Settings**:
   - **Repository name**: `plaidConnect` (or your preferred name)
   - **Description**: Add a brief description (optional)
   - **Visibility**: Choose Public or Private
   - **⚠️ IMPORTANT**: Do NOT initialize with a README, .gitignore, or license (since we already have a local repo)
   - Click "Create repository"

## Step 2: Connect Your Local Repository to GitHub

After creating the repository on GitHub, you'll see a page with setup instructions. Here are the commands you'll run:

### Initial Setup (First Push)

```bash
# You should already be on the 'staging' branch (our default development branch)
git status

# Add all files to staging
git add .

# Make your first commit
git commit -m "chore(ci): initial commit with staging workflow setup"

# Add the GitHub repository as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/plaidConnect.git

# First, push main branch (if it exists locally, otherwise create it from staging)
git checkout -b main
git push -u origin main

# Now push staging branch (this is where you'll do all development)
git checkout staging
git push -u origin staging

# Set staging as your default branch for future work
git checkout staging
```

### Option B: If you want to use SSH instead of HTTPS

1. **Set up SSH key** (if you haven't already):
   ```bash
   # Check if you have an SSH key
   ls -al ~/.ssh
   
   # If not, generate one
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Add SSH key to GitHub**:
   - Copy your public key: `cat ~/.ssh/id_ed25519.pub`
   - Go to GitHub → Settings → SSH and GPG keys → New SSH key
   - Paste your key and save

3. **Use SSH URL instead**:
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/plaidConnect.git
   ```

## Step 3: Verify Your Setup

```bash
# Check your remote repository
git remote -v

# This should show your GitHub repository URL
```

## Step 3: Set Up Branch Protection

**⚠️ CRITICAL**: After your first push, set up branch protection for `main`:

1. Go to your repository → **Settings** → **Branches**
2. Add a branch protection rule for `main`
3. Enable "Require a pull request before merging"
4. Enable "Do not allow bypassing the above settings"
5. See `BRANCH_PROTECTION_SETUP.md` for detailed instructions

## Step 4: Development Workflow (Staging → Main)

This repository uses a **staging → main** workflow where:
- ✅ **`staging`** branch: Where all development happens (you push here)
- 🔒 **`main`** branch: Protected, only updated via PR merge
- 🤖 **Auto-PR**: Every push to staging creates/updates a draft PR

### Your Daily Workflow:

```bash
# 1. Make sure you're on staging branch
git checkout staging

# 2. Make your changes to files

# 3. Stage your changes
git add .

# Or stage specific files
git add filename.js

# 4. Commit with conventional commit format
git commit -m "feat(plaid): add account linking feature"

# 5. Push to staging (this auto-creates/updates the draft PR)
git push origin staging
```

### When Ready to Release:

1. The draft PR from `staging → main` is automatically maintained
2. Review the PR (all commits are automatically categorized)
3. When ready, merge the PR into `main`
4. GitHub Actions will automatically create a release

### Using Cursor's @push Command:

You can also use the `@push` command in Cursor, which will:
- Run lint/build checks
- Analyze all changes
- Create a conventional commit message
- Push to staging automatically

Just type: `@push` in your Cursor chat when you're ready to commit and push.

## Troubleshooting

### If you get "remote origin already exists"
```bash
# Remove existing remote
git remote remove origin

# Add it again with the correct URL
git remote add origin https://github.com/YOUR_USERNAME/plaidConnect.git
```

### If you get authentication errors
- Make sure you're signed in to GitHub
- Consider using GitHub CLI (`gh auth login`) or Personal Access Token
- Or use SSH authentication (see Option B above)

### If you need to update your remote URL
```bash
git remote set-url origin https://github.com/YOUR_USERNAME/plaidConnect.git
```

## Workflow Summary

```
┌─────────────┐
│   staging   │ ← You develop here (git checkout staging)
│             │   Push here: git push origin staging
└──────┬──────┘
       │
       │ (auto-creates/updates draft PR on each push)
       ↓
┌─────────────┐
│ Draft PR    │ ← Auto-maintained by GitHub Actions
│ staging→main│   Review commits categorized by type
└──────┬──────┘
       │
       │ (you merge when ready)
       ↓
┌─────────────┐
│    main     │ ← Protected branch
│             │   Only via PR merge
│             │   Auto-creates release on merge
└─────────────┘
```

## Next Steps

After successfully pushing to GitHub:
1. ✅ Set up branch protection (see `BRANCH_PROTECTION_SETUP.md`)
2. ✅ Your code is now backed up and accessible online
3. ✅ Every push to `staging` creates/updates a draft PR
4. ✅ You can collaborate with others
5. ✅ Automatic releases on merge to `main`

## Important Reminders

- ⚠️ **Never push directly to `main`** - always use staging → main PR
- ✅ **Always work on `staging` branch** - `git checkout staging`
- 🤖 **Auto-PR is automatic** - just push to staging
- 📝 **Use conventional commits** - helps with auto-categorization

---

**Need help?** 
- See `BRANCH_PROTECTION_SETUP.md` for branch protection setup
- See `.cursorrules` for commit message format
- Check the [GitHub Documentation](https://docs.github.com)

