# ADEPR Kacyiru — Church Systems Ecosystem

Prototype web platform for **ADEPR Kacyiru**: Main Church hub, peer ministry systems, and shared finance. Built as a Vite SPA with an optional Express + Prisma API for auth, policy, mission, and contributions.

**Repository:** [github.com/samuelIhimbazwe/church-ecosystem](https://github.com/samuelIhimbazwe/church-ecosystem)

| Doc | Purpose |
|-----|---------|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Branches, commits, PRs, local `check` |
| [DEPLOY.md](./DEPLOY.md) | Vercel + Render + Neon |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System kinds, request flow, key modules |
| [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md) | SPA vs API vs seed (hybrid model) |
| [server/README.md](./server/README.md) | API endpoints and policy smoke |

## Quick start (local)

```bash
git clone git@github.com:samuelIhimbazwe/church-ecosystem.git
cd church-ecosystem
npm install
npm run check          # lint + test + build + API policy smoke
npm run dev            # SPA → http://localhost:5173
```

Optional API (second terminal):

```bash
npm run api:setup      # server: prisma + seed
npm run dev:api        # http://localhost:4000
```

Wire the SPA to the API: copy [.env.example](./.env.example) to `.env.local` and set `VITE_API_URL=http://localhost:4000`.

Demo logins are listed on `/login`. **Prototype only** — seed passwords are plaintext; production API users use hashed passwords (see [server/README.md](./server/README.md)).

## Architecture (summary)

| Kind | Systems | Role |
|------|---------|------|
| **MAIN** | `sys-main` (`/`) | People, organisation, participation, mission, peer launcher |
| **PEER** | Choir, Worship, Youth, Deacon, Protocol, Music, … | Full peer apps (SSO or direct login) |
| **SHARED** | `sys-finance` | Shared ledger + org-private vaults — not a ministry peer |

**Finance:** Ministry money UX lives inside each ministry. Confirmed amounts post into private vaults. Pastor / church leaders cannot open ministry vaults without an explicit `FundAccessGrant`.

**Choir:** One system (`sys-choir`), seven named choir org units; access requires membership/position on a named choir.

**Members:** Regular members see a limited module allow-list; finance suites and leadership ops are board/treasurer (Choir uses its own office matrix).

## Deploy (demo / staging)

See **[DEPLOY.md](./DEPLOY.md)** for Neon (Postgres) + Render (API) + Vercel (Web).

Local development uses SQLite (`server/prisma/schema.prisma`). Production uses `server/prisma/schema.postgres.prisma`.

## Development workflow

- Default branch: **`main`** — merge via pull request; CI must pass.
- Branch naming: `feature/…`, `fix/…`, `docs/…`, `chore/…` ([details](./CONTRIBUTING.md)).
- Before opening a PR: `npm run check`.
- Use GitHub **Issues** (bug / feature templates) and the **PR template** for consistent reviews.

## Scripts (root)

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (SPA) |
| `npm run dev:api` | Express API (watch) |
| `npm run build` | Production SPA build |
| `npm run test` | Vitest (domain + critical access rules) |
| `npm run lint` | oxlint |
| `npm run check` | lint + test + build + server policy smoke |

## Production readiness

### Hardening already in the prototype

- Member vs board module gating (nav + route guards)
- Multi-choir: no “all choirs” fallback from bare ENTER
- Finance nav: treasury modules only for General Fund access
- Critical domain tests (`npm test`)
- Backend skeleton: Express + Prisma, JWT auth, funds ACL, SSO issue/redeem
- SPA API bridge (`VITE_API_URL` + optional seed fallback)
- Server policy engine + mission API + contribution claim → verify → `FinanceTxn`

### Still required for a full production ecosystem

1. Auth hardening — rotate JWT secrets; optional IdP
2. Real multi-origin SSO when peers split deploys
3. Multi-choir roster/membership maturity on server
4. File storage for person documents
5. Continue porting SPA domains to API (track in [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md))

## Key code paths

- Systems catalog: `src/data/seed.ts` (`SYSTEMS`)
- Peer kit: `src/ministry/peerCoreSystems.ts`
- Fund ACL: `src/domain/financeAccess.ts`
- SSO handoff: `src/domain/sso.ts` (`/sso/handoff`)
