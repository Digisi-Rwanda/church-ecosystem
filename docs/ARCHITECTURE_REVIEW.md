# Architecture review — October 2026

Scope: the ADEPR Kacyiru church ecosystem as deployed today (Vercel SPA, Render API, Neon Postgres). Based on reading the code and on the integration tests added with this review. Numbers are from the repository at the time of writing.

## 1. What the system actually is

A **hybrid**: one React SPA (about 86,000 lines) plus one Express API (about 8,700 lines). The API is small next to the SPA because most business logic still runs in the browser.

| Layer | Where | Role |
|---|---|---|
| SPA | Vercel | All screens, all ministry logic (Protocol, Music, Choir, Worship, Youth, Deacons, Board, Church finance, Letters, Pastoral), the permission engine (`src/domain/access.ts`) |
| API | Render, Express 5, Prisma | Sign-in (JWT, 12 h), permission policy (`server/src/policy`), mission lifecycle, contributions and fund ledger, shared schedule documents, attention feed, SSO handoff |
| Database | Neon Postgres | 24 tables (people, memberships, positions, funds, finance transactions, programs, events, projects, tasks, contribution claims, schedule documents, audit) |

## 2. Where each module's data really lives

This is the most important table in the review. "Server" means two people on two devices see the same data.

| Module | Server-backed | Notes |
|---|---|---|
| Sign-in, roles, grants | Yes | Falls back to browser-only demo login when the API cannot be reached or does not know the user |
| Programs, events, tasks, projects (mission) | Yes | Full lifecycle on the server: submit, approve, start, close, enrol, attendance |
| Ministry contributions to fund ledger | Yes | Claim, verify (with separation of duties), ledger entry in one transaction |
| Fund vaults (ORG_PRIVATE) | Yes, read | Balance visible only with an explicit grant |
| Music schedule and Protocol (roster, teams, availability, notifications) | Yes, as two shared documents | Version compare-and-swap, 3-way merge, revisions, 4 s poll |
| People directory | Partly | Search only; the people records themselves are browser-local |
| People, memberships, positions, org units | **No** | Browser-local (`localDomainStore`) |
| Board, Deacons, Youth, Worship, Choir operations and finance, Church finance (collections, budgets, balance sheet), Letters and documents, Pastoral pathways, discipline, transfers | **No** | Browser-local, about 100 registered collections |

Consequence: outside Music, Protocol, contributions and mission, **each browser has its own private copy**. A treasurer who posts a Sunday collection on one computer will not see it on another, and the pastor will never see it. The new test `src/services/browserOnlyModules.test.ts` proves both halves: the write works and survives a refresh, and a second browser sees nothing.

## 3. What the tests now cover

| Test file | What it proves |
|---|---|
| `server/tests/integration/ecosystem.int.test.ts` (10) | Music to Protocol flow across devices, availability, notifications, concurrent edits merged, guard and read filter, sign-out |
| `server/tests/integration/modules.int.test.ts` (23) | Contribution to ledger, vault privacy, program lifecycle, events, tasks, projects, directory, assignments, anonymous refusal, forged token, behaviour when the server is down |
| `src/services/browserOnlyModules.test.ts` (4) | Board, Church finance, Pastoral: write, refresh, not shared |
| Existing unit and route tests | Roles, access rules, team engine, schedule merge, import, change password, parity between SPA and server rules |

Totals: app 213 passing, server 206 passing. Not covered by any test: real screens (clicks, layout), a real Postgres engine, hosting settings, Youth, Deacons, Worship and Letters beyond their seed logic.

## 4. Findings, most serious first

1. **Most of the ecosystem is not shared.** Finance for the church, the board, deacons' care cases, worship, youth, letters and pastoral records exist per browser. This is the largest gap between what the product looks like it does and what it does. Clearing browser data loses them; a new device starts from seed data.
2. **Two permission engines must stay identical.** The SPA decides what to show with its own engine; the server decides what to allow with `server/src/policy`. One parity test exists. Any rule changed in one place only will either hide something allowed or show something refused. Server is the authority; the SPA copy is convenience.
3. **Demo accounts and the local fallback are a launch risk.** With the fallback on, a wrong server answer silently produces a browser-only session with demo permissions. `SEED_DEMO_ACCOUNTS` must be off and `VITE_API_FALLBACK=false` for real users; the sync badge should be hidden at launch.
4. **No rate limiting and no security headers.** Login can be tried without limit. Add `express-rate-limit` on `/api/auth/login` and `helmet`.
5. **Database changes use `prisma db push` on every start.** No migration history, no safe rollback, and a schema change can alter production data on boot. Move to `prisma migrate deploy`.
6. **The enforcement switches are off by default.** `SCHEDULE_GUARD` defaults to warn and `SCHEDULE_READ_FILTER` to off. For a real launch both should be on (enforce / on), and the integration tests already exercise both.
7. **Shared documents are whole-document, polled.** Each of Music and Protocol is one JSON document (limit 12 MB) re-sent whole and polled every 4 s per open tab. It works for a church-sized team; it will not scale to hundreds of simultaneous editors, and a single bug can damage the whole month. Revisions exist, which is the safety net.
8. **Single points of failure.** One Render instance (free-tier sleep means a first request can fail while it wakes), one database, one JWT secret. CORS_ORIGIN and VITE_API_URL are configuration, not code, and a wrong value silently turns the app browser-only (this already happened once).
9. **Notifications are in-app only.** Nothing reaches people outside the app (no SMS or email), which matters for Protocol duty reminders.
10. **Code size concentration.** `protocolService.ts` is 3,190 lines and `registerExtended.ts` is 1,994. They are well tested at the logic level but expensive to change safely.

## 5. Recommended order

1. Before real members: demo accounts off, fallback off, guard enforce, read filter on, hide the sync badge, rate limit login.
2. Move the data people will care about first onto the server, in this order: people and positions, church finance (collections and the general fund), Board decisions, Deacons' cases. Reuse the shared-document pattern used for Music and Protocol, since it already has versioning and merge, then graduate each to proper tables when stable.
3. Replace `db push` with migrations before the first production data exists.
4. Add one real-browser test (Playwright) for the sign-in and Music-to-Protocol path, plus a staging environment that mirrors production settings.
5. Keep `docs/DATA_SOURCES.md` current as each module moves: the table above is the template.
