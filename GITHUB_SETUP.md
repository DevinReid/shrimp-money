# GitHub Setup Walkthrough

This guide will walk you through connecting your local repository to GitHub.

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

### Option A: If you haven't made any commits yet (current situation)

```bash
# Add all files to staging
git add .

# Make your first commit
git commit -m "Initial commit"

# Add the GitHub repository as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/plaidConnect.git

# Rename branch to main (if not already on main)
git branch -M main

# Push your code to GitHub
git push -u origin main
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

## Step 4: Future Workflow

Once set up, your typical workflow will be:

```bash
# 1. Make changes to your files

# 2. Stage your changes
git add .

# Or stage specific files
git add filename.js

# 3. Commit your changes
git commit -m "Description of your changes"

# 4. Push to GitHub
git push
```

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

## Next Steps

After successfully pushing to GitHub:
- Your code is now backed up and accessible online
- You can collaborate with others
- You can use GitHub's features like Issues, Pull Requests, and Actions
- You can clone the repository on other machines with: `git clone https://github.com/YOUR_USERNAME/plaidConnect.git`

---

**Need help?** Feel free to ask or check the [GitHub Documentation](https://docs.github.com)

