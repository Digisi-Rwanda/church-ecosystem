# Data sources (SPA hybrid model)

The web app can run **standalone** (in-memory seed + optional browser persistence) or **connected** to the Express API when `VITE_API_URL` is set. Reviewers should use this table to know where truth lives today.

| Domain | Primary store (no API) | With `VITE_API_URL` | Notes |
|--------|------------------------|---------------------|--------|
| **Login** | Seed accounts (`/login`) | API first (`pastor`, `treasurer` hashed in DB) | Seed fallback unless `VITE_API_FALLBACK=false` |
| **Effective grants / `can()`** | `buildEffectiveAccess` from seed participation | `GET /api/authorize/grants` after API login | Keep SPA and `server/src/policy` aligned for rules |
| **Mission lists** (programs, events, tasks, projects) | `missionService` seed | API preferred, seed fallback | See `src/api/missionApi.ts` |
| **Contributions → finance txn** | Hybrid services | Claim/verify routes when API session | Choir needs `fundId` for multi-vault |
| **People / org (main)** | Seed + local persistence | Partial API (`/api/people`) | Not all UI wired |
| **Protocol / music schedule** | Seed + ministry services | Port in progress | Check service files for API calls |
| **Correspondence / letters** | In-memory + `localDomainStore` | Not ported | PDF export is client-side |

## Environment flags

| Variable | Where | Meaning |
|----------|--------|---------|
| `VITE_API_URL` | SPA (Vercel / `.env.local`) | Base URL of Render API |
| `VITE_API_FALLBACK` | SPA | Default on: failed API login → seed demo users |
| `DATABASE_URL` | Server | SQLite locally; Neon Postgres in production |
| `JWT_SECRET` | Server | Required in production; never commit real values |

When you port a feature to the API, update this table in the same PR.
