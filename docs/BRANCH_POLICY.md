# Branch policy

## `main`

- Target for Vercel (SPA) and Render (API) demo deploys.
- Merge via **pull request**; do not force-push except in emergencies (coordinate with maintainers).
- **CI** (`npm run check`) must pass before merge.

### Recommended GitHub settings (repository admin)

On **Settings → Branches → Branch protection rules** for `main`:

1. Require a pull request before merging (1 approval optional for solo maintainer).
2. Require status checks: job name **`check`** from workflow **CI**.
3. Do not allow bypassing (except admins if needed for hotfixes).

## Working branches

| Prefix | Use |
|--------|-----|
| `feature/` | New behavior |
| `fix/` | Defects |
| `docs/` | README, CONTRIBUTING, architecture |
| `chore/` | CI, deps, tooling |

Rebase or merge `main` frequently to avoid large conflicts.

## Tags (optional)

For stakeholder demos: annotated tags `v0.x.y` on `main` after smoke-testing DEPLOY.md steps.
