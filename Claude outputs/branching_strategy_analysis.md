# ADEPR Kacyiru — Git Branching Strategy Analysis

## Project Overview

**Type:** Full-stack SPA + API ecosystem for church systems  
**Stack:** React/TypeScript (Vite) + Express/Prisma  
**Deploy:** Vercel (frontend) + Render (API) + Neon (PostgreSQL)  
**Status:** Production-ready prototype with hybrid SPA/API fallback  
**Teams:** Single contributor (samuel) moving toward shared contribution

---

## Current Branch Strategy

Your existing `CONTRIBUTING.md` defines:

| Branch | Purpose |
|--------|---------|
| `main` | Deployable demo/integration branch (protected, PR-only) |
| `feature/<topic>` | New capabilities |
| `fix/<topic>` | Bug fixes |
| `docs/<topic>` | Documentation only |
| `chore/<topic>` | Tooling, deps, CI |

This is a **lightweight trunk-based approach** — good for small teams and rapid iteration.

---

## Recommended Enhanced Strategy

Given your three deployment tiers (local dev, Render staging/demo, production), I recommend **Git Flow with staging awareness**:

### Core Branches (Protected)

#### 1. **`main`** (current: ✓ keep)
- **Purpose:** Production-ready code only
- **Deploy to:** Vercel production + Render production  
- **Protection rules:**
  - Merge via PR only
  - CI (`npm run check`) must pass
  - Require code review (minimum 1)
  - Dismiss stale reviews on push
  - Require branches up-to-date with base
- **Deploy trigger:** Tag or manual; latest good merge goes to prod
- **Database:** Neon (production PostgreSQL)

#### 2. **`develop`** ⭐ (new)
- **Purpose:** Integration branch for next release
- **Deploy to:** Render staging + Vercel preview deployments  
- **When to merge to `main`:** Before a versioned release (see `release/*`)
- **Lifetime:** Continuous; always contains latest merged features
- **Database:** Neon staging environment or preview database
- **CI:** Same strict checks as `main`
- **Use case:** Test feature interactions before pushing to production

#### 3. **`staging`** (alternative to develop)
- **If you prefer a single stable branch between dev and prod:**
  - Mirrors current Render + Vercel preview setup
  - Developers pull `staging` → local dev → `feature/*`
  - Same CI gates as `main`

### Ephemeral Branches

#### 4. **Feature & Fix Branches**
```
feature/<area>/<short-description>
fix/<area>/<short-description>
docs/<area>/<short-description>
chore/<short-description>
```

Examples:
- `feature/finance/vault-access-audit`
- `fix/auth/jwt-expiry-edge-case`
- `docs/architecture/deployment-matrix`
- `chore/deps/upgrade-react-19.2`

**Merge into:** `develop` (not `main` directly)

#### 5. **Release Branches** ⭐ (recommended)
```
release/v1.2.0
```

- **When:** Final testing before production
- **Lifetime:** 2–3 days, then merge to `main` + `develop`
- **Allowed changes:** 
  - Version bumps (`package.json` + `server/package.json`)
  - Final docs tweaks
  - Critical bug fixes only
  - Changelog entries
- **No new features** on release branches
- **Deploy to:** Render production *with* final Neon smoke test
- **Merge back to `develop`** after merging to `main` (keeps both in sync)

#### 6. **Hotfix Branches** ⭐ (new)
```
hotfix/critical-finance-ledger-corruption
```

- **When:** Critical production bug (e.g., data loss, security)
- **Merge from:** `main` (not `develop`)
- **Merge into:** `main` → `develop` immediately after
- **Lifetime:** Minutes to hours
- **Bump version:** patch (v1.2.1)
- **Deploy:** Direct to Render production after emergency test

#### 7. **Experimental / WIP Branches** (optional)
```
exp/<area>/<idea>
wip/<person>/<big-refactor>
```

- No CI gate requirement
- Not merged to `develop` until ready
- Auto-delete after 30 days if unmerged

---

## Recommended Workflow

### Adding a Feature

```bash
# Start from develop (stays current)
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/choir/rosters-import

# Work locally; commit with Conventional Commits
# (feat: …, fix: …, etc.)

# Before push: test locally
npm run check

# Push and open PR against develop
git push -u origin feature/choir/rosters-import
# → GitHub PR template → review → merge

# Merge strategy: Squash (if < 3 commits) or rebase (keep history clean)
```

### Preparing a Release

```bash
# When develop is stable and features are merged
git checkout -b release/v1.3.0 develop

# Bump versions
npm version minor  # or patch/major
npm run build      # Final test

# Create PR: release/v1.3.0 → main (describe what's in v1.3.0)
# Final review, smoke test on Render staging

# After approval, merge to main
git checkout main
git merge --no-ff release/v1.3.0
git tag v1.3.0

# Deploy from main to production

# Then merge back to develop (keep it in sync)
git checkout develop
git merge --no-ff release/v1.3.0

# Delete release branch
git branch -d release/v1.3.0
```

### Critical Production Bug (Hotfix)

```bash
# Break from develop; branch off main
git checkout -b hotfix/finance-ledger-corruption main

# Fix + test
npm run check

# Quick PR: hotfix/... → main + `develop`
git checkout main
git merge --no-ff hotfix/finance-ledger-corruption
npm version patch
git tag v1.2.1

# Deploy immediately

# Sync develop
git checkout develop
git merge --no-ff hotfix/finance-ledger-corruption
git branch -d hotfix/finance-ledger-corruption
```

---

## Branch Protection & CI

### Recommended GitHub Branch Protection Settings

| Setting | `main` | `develop` | Others |
|---------|--------|-----------|--------|
| Require PR review | ✓ (1) | ✓ (1) | ✗ |
| Dismiss stale reviews | ✓ | ✓ | — |
| Require CI pass | ✓ | ✓ | ✗ |
| Require branches up-to-date | ✓ | ✓ | ✗ |
| Require code owners | ✓ | ✗ | ✗ |
| Auto-delete on merge | ✗ | ✗ | ✓ |

### CI Pipeline (Existing `npm run check`)

Keep your current check flow; consider adding:

```yaml
# GitHub Actions (suggested additions)
- npm run lint
- npm run test
- npm run build
- npm run test:policy --prefix server  # ← API policy smoke
- node server/scripts/neon-dry-run.js   # ← NEW: test Neon schema
```

---

## Recommended Implementation Plan

### Phase 1: This Week (Minimal)

1. **Create `develop` branch:**
   ```bash
   git checkout -b develop main
   git push -u origin develop
   ```

2. **Protect `develop` with same rules as `main`:**
   - Require PR review (1)
   - Require CI pass
   - Require up-to-date with base

3. **Update `.github/pull_request_template.md`** to ask:
   - "Merge into: `develop` or `main`?"
   - "Is this a release / hotfix?"

4. **Update `CONTRIBUTING.md`:**
   - Add `develop` to branch table
   - Add release/hotfix guidance

### Phase 2: Optional (Next Sprint)

1. Add `release/*` workflow docs
2. Add hotfix template to GitHub Issues
3. Create GitHub Actions workflow for version bumping
4. Document Neon staging environment setup (if not done)

### Phase 3: When Team Grows

1. Add CODEOWNERS file
2. Require approval from senior reviewer for `main` / `develop` merges
3. Set up automated changelog generation from conventional commits

---

## Why This Structure for Your Project

| Challenge | Your Setup → Solution |
|-----------|----------------------|
| **Hybrid SPA/API model** | `develop` lets you test feature interactions before prod |
| **Three deploy tiers** (local / Render staging / Vercel prod) | `main` (prod) + `develop` (staging) + feature/* (local) maps cleanly |
| **Production ecosystem** | Release branches + version tags + hotfix protocol reduce human error |
| **Prototype → production** | Staging branch lets you test Neon queries + Render policy engine before live |
| **Single contributor** | Lightweight; scales to 2–3 people without rework |

---

## FAQ

### "Should we use `staging` instead of `develop`?"

**No, use `develop`.** `staging` implies a permanent environment; `develop` is a release-prep integration branch. Your actual staging *environment* (Render preview) deploys from `develop`.

### "Why release branches if we're continuous?"

Because your architecture has **stateful deploys** (Neon database migrations). A 2-day release branch lets you:
- Test Prisma migrations on staging Neon before production
- Batch feature docs and version bumps
- Roll back if schema migration fails

### "Do we need hotfix branches?"

Yes, but only used rarely. If a critical finance bug hits production, hotfix lets you:
- Fix on `main` without waiting for `develop` feature review queue
- Patch version independently
- Keep `main` always deployable

### "What about preview/preview-* for Vercel preview deployments?"

Optional. If you want separate preview environments per feature:
```
preview/feature-name → Vercel auto-deploys preview URL
```
But this requires Vercel + GitHub integration setup (not in your current config). Skip unless review-in-staging becomes a bottleneck.

### "Do we commit version bumps to package.json?"

**Yes.** Commit version bumps *only* on release branches or hotfixes. This:
- Keeps `main` semantically versioned
- Lets you tag releases (`git tag v1.2.0`)
- Enables automated deploys by tag

---

## Summary

| Branch | Protect? | Deploy | Lifetime |
|--------|----------|--------|----------|
| `main` | ✓ | Production | Permanent |
| `develop` | ✓ | Staging/preview | Permanent |
| `feature/*` | ✗ | (none) | Days–weeks |
| `release/*` | ✗ | (none, then main) | Hours–days |
| `hotfix/*` | ✗ | (none, then main) | Minutes–hours |
| `chore/*`, `fix/*`, `docs/*` | ✗ | (none) | Days–weeks |

**Next step:** Create `develop` branch and update `CONTRIBUTING.md`. You can adopt `release/*` / `hotfix/*` workflows as you move from prototype to full production.
