# Target architecture — from evolved prototype to a system of record

Decision (3 October 2026, Ozufy): the server is the only source of truth for church data. The browser is a window onto it, never a second database.

## 1. The contract between frontend and backend

| Concern | Backend (Express, Prisma, Postgres) owns it | Frontend (React SPA) owns it |
|---|---|---|
| Truth | Every record: people, memberships, positions, finance, minutes, cases, letters, schedules | Nothing. It may hold a copy to be fast, never the original |
| Rules | Who may see or change what (policy engine), lifecycle states, separation of duties, validation, privacy filtering of fields | Showing or hiding controls so people are not offered what the server will refuse. A hint, never a guard |
| Identity | Sign-in, passwords, tokens, expiry, throttling, audit trail | Holding the token for the session, asking to sign in or out |
| Money | Ledger entries, balances, verification, one transaction per posting | Forms and display |
| Time and order | Version checks, merges, timestamps, ids | Optimistic display while a save is in flight |
| Files | Photos, documents, signatures (object storage, later slice) | Upload and preview only |
| Resilience | Backups, migrations, health, logs, rate limits | Error boundary, retry, clear messages, never silent failure |

Three tests for any new code: (1) if two people on two devices must agree, the data is on the server; (2) if a wrong answer would harm someone (money, privacy, discipline), the server decides; (3) if it only changes how a screen looks for one person, it may stay in the browser.

## 2. What the browser is allowed to keep

Only these, and each is cleared or harmless on a shared computer:

- the sign-in token (cleared at sign-out);
- display preferences: theme, table column widths, sidebar state, last-opened tab;
- unsent drafts of a form the person is typing;
- a read cache of server data for speed (cleared at sign-out; the server wins on every refresh).

Everything else is browser-only today and is being moved. `src/data/storagePolicy.ts` lists every collection with its home, and `src/data/storagePolicy.test.ts` fails the build if a new browser-only collection appears without a decision.

## 3. Data inventory (100 collections)

| Home | Count | Examples | Status |
|---|---|---|---|
| Server, shared document | 14 | Music schedule, Protocol roster, teams, swaps, notifications | Live |
| Server today (people included) | 11 | people (switch built, off by default), programs, events, tasks, projects, enrolments, assignments | Lifecycle live; the browser copy is a cache to drop after verification |
| Slice 2 | 3 | memberships, positions, org units | Next |
| Slice 3 | 12 | family, baptism, marriage, timeline, documents, employment, education, gifts, pathways, discipline, transfers | Planned |
| Slice 4 | 46 | church finance, choir, worship and youth money | Planned; reuses the fund ledger |
| Slice 5 | 14 | board, documents and signatures, deacons' care, pulpit, youth groups | Planned |

Exact membership of every slice is in `storagePolicy.ts`.

## 4. How the browser is cleaned

1. **At sign-out:** collections of every module switched to the server are emptied in memory and removed from saved browser data (done for people; every new module adds itself to `MODULE_COLLECTIONS`).
2. **At each slice:** after a module is proven on staging, its browser copy becomes a cache only, then the old seed data for it is deleted from the code, so a new device starts empty and fills from the server.
3. **Before any removal:** the person can download their browser data (button on their own profile), so nothing is lost silently.
4. **Version stamp:** the saved browser copy carries a version number; when a module moves, bumping it discards the old copy on next load.

## 5. Quality bars for "excellent, not prototype"

Backend: versioned migrations only (no `db push`); every route validated and covered by an authorization test; structured logs; rate limits; security headers; backups with a tested restore; health and readiness; no demo accounts or fallbacks in production (enforced at boot).

Frontend: no demo fallback in production (enforced at build); route-level code splitting and error boundaries (done); explicit loading, empty and error states; entry bundle under 350 kB (now 303 kB); no business rule that the server does not also enforce; no direct reading of storage outside the storage layer.

Process: two environments (staging for rehearsal with demo data, production for real members); every change passes lint, boundary check, app tests, server tests, policy parity, production build; the same rule written twice (app and server) is guarded by parity tests until a shared package replaces it.

## 6. Order of work and honest effort

| Step | What | Why this order |
|---|---|---|
| Done | Guard rails, environments, rule parity, people on server (built) | Foundation |
| Now | Prove people on staging with leaders on two devices | One module end to end before copying the pattern |
| Next | Slice 2 memberships, positions, org units | Everything else depends on who belongs where |
| Then | Slice 3 person records, slice 4 money, slice 5 governance | By risk and by how often they are used |
| Alongside | Migrations baseline, backups and restore test, Playwright browser smoke test, event and project parity, shared rules package | Safety nets that make each slice cheaper |

Each slice is roughly one working session of building plus a staging rehearsal. A single big-bang move of all 100 collections is deliberately avoided: it would put every module at risk at once and make a fault impossible to trace.

## 7. Done means (per module)

Data in tables with migrations; endpoints with server-side privacy and audit; the app reads from a cache that refreshes and writes through the server; integration test with two devices; wrong-role tests; browser copy cleared at sign-out; entry in `storagePolicy.ts` moved to SERVER; leaders rehearsed it on staging.
