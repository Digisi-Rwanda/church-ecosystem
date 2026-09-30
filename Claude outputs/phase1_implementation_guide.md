# Phase 1 Implementation Guide — Step by Step

## Overview

**Goal:** Add a stable `develop` branch and update documentation to support staging deployments before production.

**Time:** ~15 minutes  
**Risk:** Low (creates new branch; no destructive changes to `main`)  
**When to do it:** Before your next feature merge

---

## Step 1: Create the `develop` Branch

### What This Does

Creates a new branch that will become your **staging integration point**. All features and fixes will merge into `develop` first, and only when you're ready to release will `develop` merge into `main`.

### Why It Matters

**Problem:** Right now, every merged PR goes straight to `main`, which immediately deploys to production. If two features interact badly, or a database migration fails, production breaks.

**Solution:** With `develop`, you can:
- Merge multiple features to `develop` and test them together on staging (Render preview)
- Catch integration bugs before they hit production
- Keep `main` always deployable and stable

### How to Do It

**From your local repo:**

```bash
# Step 1a: Switch to main and pull latest
git checkout main
git pull origin main

# Step 1b: Create develop from main
git checkout -b develop

# Step 1c: Push it to GitHub
git push -u origin develop
```

**What you'll see:**
```
Branch 'develop' set up to track 'origin/develop'.
```

### Verify It Worked

Go to GitHub → your repo → "Branches" tab. You should see:
- `main` (protected, deployable)
- `develop` (new, will be protected)

---

## Step 2: Protect `develop` with GitHub Branch Rules

### What This Does

Applies the same safety gates to `develop` that protect `main`: requires CI to pass, requires code review, prevents force-pushes.

### Why It Matters

**Problem:** Without protection, someone could accidentally push directly to `develop` or merge without testing.

**Solution:** Branch protection rules enforce:
- No direct commits (must use PRs)
- CI must pass before merge
- At least 1 review required
- Stale reviews dismissed on new pushes

### How to Do It

**From GitHub:**

1. Go to **Settings** → **Branches**
2. Click **"Add rule"**
3. Fill in:
   - **Branch name pattern:** `develop`
   - Check: ✓ **Require a pull request before merging**
     - Require approvals: `1`
     - ✓ **Dismiss stale pull request approvals when new commits are pushed**
   - Check: ✓ **Require status checks to pass before merging**
     - Require branches to be up to date before merging: ✓
     - Search for status checks: `npm run check` (or whatever your CI job is called)

4. Click **Create**

**Alternative (if using GitHub CLI):**

```bash
# Check current rules
gh repo rule list

# Add rule via CLI (more advanced; GitHub UI is easier for first time)
gh repo rule create --branch develop \
  --require-approvals 1 \
  --require-status-checks \
  --require-branches-up-to-date
```

### Verify It Worked

- Go to **Settings** → **Branches** again
- You should see both `main` and `develop` listed with protection icons

**What this prevents:**
- ❌ `git push origin develop` (direct push now fails)
- ❌ Merging without CI passing
- ❌ Merging without a review

---

## Step 3: Update Pull Request Template

### What This Does

Adds a checkbox to your PR template that reminds contributors which branch they're targeting.

### Why It Matters

**Problem:** Right now, contributors might not think about whether their PR should go to `main` (hotfix) or `develop` (feature). This causes confusion.

**Solution:** A simple question in the PR template prompts them to choose, and reviewers can catch mistakes before merging.

### How to Do It

**Find your PR template:**

```bash
# On your local machine
cat .github/pull_request_template.md
```

Expected current content (from your repo):

```markdown
## What does this PR do?

...

## Checklist

- [ ] Tests added/updated
- [ ] Docs updated (if needed)
```

**Edit it to add a target branch question:**

`.github/pull_request_template.md`:

```markdown
## What does this PR do?

[Brief description of the feature/fix]

## Type of change

- [ ] Feature (`feature/*`)
- [ ] Bug fix (`fix/*`)
- [ ] Documentation (`docs/*`)
- [ ] Chore / tooling (`chore/*`)

## Target branch

**Is this for production (`main`) or integration (`develop`)?**

- [ ] Merge into `develop` (feature, fix, or chore — typical case)
- [ ] Merge into `main` (hotfix for critical production bug only)

**Why:** `develop` is our integration / staging branch. `main` is production-only.

## Checklist

- [ ] Tests added/updated
- [ ] Docs updated (if needed)
- [ ] `npm run check` passes locally
- [ ] I've reviewed the "Target branch" section above
```

**Commit and push:**

```bash
git add .github/pull_request_template.md
git commit -m "docs: add target branch reminder to PR template"
git push origin main
```

### Verify It Worked

- Open a **new pull request** on GitHub (don't actually create one, just go through the form)
- You should see your updated template with the branch checkboxes

---

## Step 4: Update CONTRIBUTING.md

### What This Does

Adds `develop` to your branch strategy table and explains when to use it vs. `main`.

### Why It Matters

**Problem:** New contributors don't know `develop` exists or when to use it.

**Solution:** Clear documentation in `CONTRIBUTING.md` explains the workflow upfront.

### How to Do It

**Current section in `CONTRIBUTING.md` (lines 6–13):**

```markdown
## Branch strategy

| Branch | Purpose |
|--------|---------|
| **`main`** | Deployable demo / integration branch. Protected: merge via PR only, CI must pass. |
| **`feature/<short-topic>`** | New capability (e.g. `feature/music-schedule-pdf`) |
| **`fix/<short-topic>`** | Bug fixes |
| **`docs/<short-topic>`** | Documentation-only |
| **`chore/<short-topic>`** | Tooling, deps, CI |

**Do not** commit directly to `main` for shared work. One logical change per branch; rebase or merge `main` before opening a PR if the branch is long-lived.
```

**Replace with:**

```markdown
## Branch strategy

| Branch | Purpose | Deploy to |
|--------|---------|-----------|
| **`main`** | Production code only. Protected: PR + CI + review required. | Vercel production + Render production |
| **`develop`** | Integration branch for next release. Merges `feature/*`, `fix/*`, etc. | Vercel preview + Render staging |
| **`feature/<short-topic>`** | New capability (e.g. `feature/music-schedule-pdf`) | (none; merge to `develop`) |
| **`fix/<short-topic>`** | Bug fixes | (none; merge to `develop`) |
| **`docs/<short-topic>`** | Documentation-only | (none; merge to `develop`) |
| **`chore/<short-topic>`** | Tooling, deps, CI | (none; merge to `develop`) |
| **`hotfix/<short-topic>`** | Critical production bug only | (merge to `main` immediately) |

### Workflow (typical case)

1. Create a `feature/*` or `fix/*` branch from `develop`
2. Commit and push to your branch
3. Open PR targeting `develop` (not `main`)
4. Pass CI, get review, merge to `develop`
5. Code goes to Render staging + Vercel preview for testing
6. When ready to release, create `release/vX.Y.Z` and open PR to `main`

### Hotfix (emergency only)

If a critical production bug is found:

1. Create `hotfix/brief-description` from `main` (not `develop`)
2. Fix, test locally with `npm run check`
3. Open PR directly to `main`
4. After merge to `main`, immediately merge same commit to `develop` to keep both in sync
5. Delete the `hotfix/*` branch

**Do not** commit directly to `main` or `develop` for shared work. One logical change per branch; rebase or merge `develop` before opening a PR if the branch is long-lived.
```

**Commit and push:**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add develop branch to strategy; clarify workflow"
git push origin main
```

### Verify It Worked

- Go to your GitHub repo → **CONTRIBUTING.md**
- You should see the updated table with `develop` and workflow guidance

---

## Step 5: Create a Quick Reference Card (Optional)

### What This Does

Creates a one-page cheat sheet for the most common git commands your team will use.

### Why It Matters

**Problem:** Developers are busy; they might not remember the exact workflow from `CONTRIBUTING.md`.

**Solution:** A quick `.github/BRANCHING_CHEATSHEET.md` file with copy-paste commands makes it frictionless.

### How to Do It

**Create `.github/BRANCHING_CHEATSHEET.md`:**

```bash
touch .github/BRANCHING_CHEATSHEET.md
```

**Fill it with:**

```markdown
# Quick Git Reference

## Starting a feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/short-description
# Now make changes...
git add .
git commit -m "feat: describe what changed"
git push -u origin feature/short-description
```
# Then open PR on GitHub targeting `develop`
```

## Starting a bugfix

```bash
git checkout develop
git pull origin develop
git checkout -b fix/short-description
# Now fix the bug...
git add .
git commit -m "fix: describe what was broken and how you fixed it"
git push -u origin fix/short-description
```
# Then open PR on GitHub targeting `develop`
```

## Emergency hotfix (production only)

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue-name
# Fix the bug...
git add .
git commit -m "fix: critical bug description"
git push -u origin hotfix/critical-issue-name
```
# Open PR on GitHub targeting `main` (not `develop`)
```

## Before you push / open a PR

```bash
npm run check    # lint + test + build + API policy smoke
```

If this passes, you're good to push.

## Updating your branch from develop

```bash
git fetch origin
git rebase origin/develop
git push --force-with-lease
```

(Use `--force-with-lease` instead of `--force` for safety.)
```

**Commit and push:**

```bash
git add .github/BRANCHING_CHEATSHEET.md
git commit -m "chore: add git quick reference"
git push origin main
```

---

## Step 6: Test the Workflow (Locally)

### What This Does

Verifies that the new `develop` branch exists and that PRs target it correctly.

### Why It Matters

**Problem:** You've made changes to GitHub, but you want to confirm they work before telling your team.

**Solution:** A quick local test simulates a contributor creating a feature branch.

### How to Do It

**From your local repo:**

```bash
# Step 6a: Fetch the new develop branch
git fetch origin

# Step 6b: Switch to develop
git checkout develop

# Step 6c: Verify you're up-to-date
git log --oneline -5
# Should match main's last few commits

# Step 6d: Create a test feature branch
git checkout -b test/verify-develop-workflow

# Step 6e: Make a tiny change (e.g., add a comment)
echo "# Test commit for develop workflow" >> README.md

# Step 6f: Commit and push
git add README.md
git commit -m "test: verify develop branch workflow"
git push -u origin test/verify-develop-workflow

# Step 6g: Don't actually create the PR—just verify the branch exists on GitHub
# Then delete it locally and on GitHub:
git checkout develop
git branch -d test/verify-develop-workflow
git push origin --delete test/verify-develop-workflow
git checkout main  # Back to main for safety
```

### What to expect:

- ✓ `git fetch origin` fetches `develop` from GitHub
- ✓ `git checkout develop` switches to the new branch
- ✓ `git push` works (no protection prevents test pushes yet)
- ✓ You can delete the test branch cleanly

---

## Summary: You've Completed Phase 1

| Step | What Changed | Why |
|------|--------------|-----|
| **1** | Created `develop` branch | Integration point for features before production |
| **2** | Protected `develop` on GitHub | Prevents accidental direct pushes; enforces CI + review |
| **3** | Updated PR template | Reminds contributors which branch they're targeting |
| **4** | Updated `CONTRIBUTING.md` | Documents `develop` workflow for the team |
| **5** | Added git cheat sheet | Lowers friction for contributors; faster PRs |
| **6** | Tested locally | Verified `develop` branch works as expected |

---

## What Happens Next (No Action Needed Yet)

### On your next feature:

1. **Create branch from `develop`** (not `main`)
2. **Open PR targeting `develop`** (not `main`)
3. **After merge:** Code goes to Vercel preview + Render staging for testing
4. **When ready to go live:** Create `release/vX.Y.Z` PR to `main`

### Your team sees:

- ✓ Clearer workflow (feature → develop → main)
- ✓ Staging environment for final QA
- ✓ Production stays stable

---

## If You Get Stuck

### Common issue: "I created a PR to `main` instead of `develop`"

**Fix:** On the PR page, click **"Edit"** next to the branch selector and change the base branch from `main` to `develop`. GitHub will recompute CI automatically.

### Common issue: "`develop` branch protection is preventing my merge"

**Check:**
1. Is CI passing? (green checkmark on PR)
2. Is there at least 1 review? (check "Reviewers" section)
3. Are you up-to-date with base? (GitHub will say "Update branch" if not)

All three must be ✓ to merge.

### Common issue: "Should I delete `develop` after I create it?"

**No.** `develop` is permanent like `main`. It stays around and accumulates merged features until you're ready to release.

---

## Why This Order Matters

**Step 1 first** creates the branch so it exists on GitHub.

**Step 2 after that** protects it so accidents are caught.

**Steps 3–4** tell your team about the new branch so they use it correctly.

**Step 5–6** provide tools and verification so they can move fast without confusion.

If you do them out of order (e.g., protect before creating), you'll get errors. The order above prevents that.
