# Contributing

Thank you for improving **ADEPR Kacyiru — Church Systems Ecosystem**. This repo is a prototype moving toward production; these conventions keep reviews fast and handoffs clear.

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
git add CONTRIBUTING.md
git commit -m "docs: add develop branch to strategy; clarify workflow"
git push origin main
## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes (matches recent history):

- `feat:` — user-visible feature
- `fix:` — bug fix
- `test:` — tests only
- `docs:` — documentation
- `chore:` — tooling, deps, CI
- `refactor:` — behavior-preserving code change

Example: `feat: add music schedule PDF export`

## Before you open a PR

From the repository root:

```bash
npm install
cd server && npm install && cd ..
npm run check
```

`check` runs: SPA lint → SPA tests → SPA production build → server policy smoke test.

For API-only work, also run locally:

```bash
npm run api:setup
npm run dev:api
```

## Pull requests

- Fill out the [PR template](.github/pull_request_template.md).
- Keep PRs **small and reviewable** (prefer &lt; ~400 lines of meaningful diff when possible).
- Link related issues (`Fixes #123` or `Relates to #123`).
- Access / finance / choir rules: add or update tests under `src/domain/*.test.ts` when behavior changes.
- Do not commit secrets (`.env`, production `JWT_SECRET`, Neon URLs). Use `.env.example` patterns only.

## Issues

Use GitHub Issues with the provided templates:

- **Bug** — steps to reproduce, expected vs actual, environment (local / Vercel demo)
- **Feature** — problem statement, who benefits, acceptance criteria

Label work informally if you use labels: `bug`, `enhancement`, `docs`, `good first issue`.

## Code layout (where to change things)

| Concern | Location |
|---------|----------|
| Business rules (access, finance ACL) | `src/domain/`, mirrored in `server/src/policy/` |
| In-memory demo data | `src/data/seed.ts` and ministry seeds |
| SPA → API bridge | `src/api/`, `VITE_API_URL` |
| Ministry UI | `src/pages/ministry/` |
| Deploy | [DEPLOY.md](./DEPLOY.md) |

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md), and [docs/BRANCH_POLICY.md](./docs/BRANCH_POLICY.md) for deeper context.

## Prototype boundaries

- Demo logins on `/login` use **plaintext passwords in seed** — acceptable for local/demo only.
- Production API users (`pastor`, `treasurer`) use **bcrypt** in the database; rotate `JWT_SECRET` for real deployments.
- Hybrid SPA/API behavior is intentional until all domains are ported; document changes in `docs/DATA_SOURCES.md` when you move a feature to the API.
