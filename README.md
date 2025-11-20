# Plaid Connect

## Development Workflow

This repository uses a **staging → main** workflow:

- 🔨 **`staging` branch**: Development branch - all work happens here
- 🔒 **`main` branch**: Protected branch - only updated via Pull Request
- 🤖 **Auto-PR**: Every push to staging creates/updates a draft PR to main

## Quick Start

### Using Cursor's @push Command

The easiest way to commit and push:

1. Make your changes
2. Type `@push` in Cursor chat
3. The system will:
   - Run lint/build checks
   - Analyze all changes
   - Create a conventional commit
   - Push to staging

### Manual Workflow

```bash
# Make sure you're on staging branch
git checkout staging

# Make your changes, then:
git add .
git commit -m "feat(plaid): your feature description"
git push origin staging
```

## Commit Message Format

Always use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types**: `feat`, `fix`, `chore`, `docs`, `refactor`, `security`, `perf`, `test`

**Scopes**: `plaid`, `auth`, `api`, `db`, `ui`, `ci`, `config`

**Examples**:
- `feat(plaid): add account linking flow`
- `fix(auth): resolve token refresh issue`
- `chore(deps): update dependencies`

See `.cursorrules` for full commit format guidelines.

## Workflow Diagram

```
┌─────────────┐
│   staging   │ ← You work here (git checkout staging)
│             │   Push: git push origin staging
└──────┬──────┘
       │
       │ (auto-creates/updates draft PR)
       ↓
┌─────────────┐
│ Draft PR    │ ← Auto-maintained by GitHub Actions
│ staging→main│   Review when ready
└──────┬──────┘
       │
       │ (merge when ready)
       ↓
┌─────────────┐
│    main     │ ← Protected (only via PR)
│             │   Auto-creates release
└─────────────┘
```

## Important Rules

- ⚠️ **Never push directly to `main`** - use staging → main PR
- ✅ **Always work on `staging` branch** - `git checkout staging`
- 🤖 **Auto-PR is automatic** - just push to staging
- 📝 **Use conventional commits** - enables auto-categorization

## Setup Guides

- **GitHub Setup**: See `GITHUB_SETUP.md` for connecting to GitHub
- **Branch Protection**: See `BRANCH_PROTECTION_SETUP.md` for protecting main branch

## GitHub Actions

Automated workflows:
- **`pr-tracker.yml`**: Auto-creates/updates draft PR from staging → main
- **`protect-main.yml`**: Blocks direct pushes to main (additional safety)
- **`release-on-merge.yml`**: Auto-creates GitHub releases on main merge
- **`auto-deploy-staging.yml`**: Triggers staging deployments

---

**Ready to start?** Check out `GITHUB_SETUP.md` to connect your repo to GitHub!

