# RBAC Audit — ADEPR Kacyiru Church Ecosystem

Date: 2026-09-30 · Scope: SPA (React), Express API, policy engine, finance ACL, mission routes, SSO, auth.

## Bottom line

The **policy engine itself is sound** (dates, revoked/expired grants, ORG_PRIVATE vaults, unknown roles, ended assignments all behave correctly). The problems are around it:

1. Most of the app has **no server-side enforcement at all** — RBAC there is only buttons hidden in the browser.
2. Where the server does have routes, about a dozen **skip the policy check** (only `requireAuth`), so any logged-in member can do things the UI only offers to leaders.
3. **Production defaults are unsafe** (demo logins, default JWT secret, open CORS).

**Test results:** 52 new automated tests in `server/tests/` assert the *secure* behaviour; **28 fail = 28 confirmed defects**. Plus a SPA-vs-server comparison across all 64 seeded accounts: 55 accounts disagree. The existing 32 SPA tests all pass.

## Confirmed findings, ranked

### Critical

| # | Finding | Evidence |
|---|---|---|
| C1 | **Any member can grant themselves access to any system.** `POST /api/assignments` only checks login; an Assignment grants `SYSTEM ENTER`. Member self-assigns to `sys-deacon`, then probe says `allowed: true`. | B1, B2, B3 |
| C2 | **Any member can write money figures into any ministry's project/program.** `/stewardship/designated-gift` and `/stewardship/used-cost` have no permission check and don't validate `fundId`. A member injected a 5,000,000 "gift" into a Deacon project. | B6, B7 |
| C3 | **Any member can create and list Mission Shares** (`MANAGE` on someone else's project, list who has access). | B4, B5 |
| C4 | **Demo logins work in production.** On a 401 from the API the SPA falls back to the seed accounts shipped in the JS bundle (`pastor/pastor123`, `treasurer/treas123`, …) unless `VITE_API_FALLBACK=false`. The server seed also re-creates `pastor`/`treasurer` with known passwords on every production start (`start:render`). | code: `authService.ts` L744, `seed.ts`, `package.json` |
| C5 | **Production boots with the default JWT secret** (`dev-only-change-me`) and with `CORS_ORIGIN=*` reflecting every origin with credentials. Anyone who knows the default can forge a token for any `personId`. | I1, I2 |
| C6 | **Most modules are browser-only.** Server routes exist only for auth, systems, people, authorize, funds, mission, attention, contributions, assignments, SSO. Correspondence, Board, church finance, org, reports, audit, participation, pastoral ops have **no server routes**; data lives in `localStorage`, so anyone can read/edit it with dev-tools regardless of role. | code: 27 services with no API, `localDomainStore.ts` |

### High

| # | Finding | Evidence |
|---|---|---|
| H1 | `/authorize/grants?personId=` and `/authorize/probe {personId}` answer for **any** person (returned the pastor's 301 grants to a plain member). | C1, C2 |
| H2 | **SSO token can be minted for a system you can't enter** (no ENTER check on `/sso/issue`). | G1 |
| H3 | **Contribution claims leak across vaults.** A manager of vault B sees all claims of vault A (list is system-wide once you manage any vault in it). | E1 |
| H4 | **A fund manager can verify their own claim** (no separation of duties). Policy choice — confirm with the church. | E3 |
| H5 | **Approval chain can be bypassed.** `PATCH /events/:id` accepts any status, so an owner-system manager moves a beyond-scope event from PENDING_APPROVAL to CONFIRMED. Creating an event with `status: CONFIRMED` + `beyondOwnerScope` also skips approval. | F1, F2 |
| H6 | **Event registration:** no ENTER/visibility check (a member registers for a MINISTRY_PRIVATE event of another ministry), and the client picks `status` — a member can self-register as `ATTENDED`. | F3, F4 |
| H7 | **Ex-leaders keep approval power.** `personIsChurchLeadership` ignores `endDate`/`startDate`, so a pastor whose term ended can still approve projects. (The policy engine handles dates correctly, F9 passes — the lifecycle code just doesn't use it.) | F8 |
| H8 | **`grantsAllSystems=true` on any role = full Church Leader power.** A Treasurer row with that flag gets `POSITION MANAGE`, `ORG_UNIT MANAGE`, etc., because unknown roles default to CHURCH_LEADER. Fail-open. | P1 |
| H9 | **No account lifecycle.** INACTIVE people can log in (H1 test) and their 12-hour tokens keep working after deactivation/deletion; no rate-limit or lockout on login. | A5, A6, H1, H2 |

### Medium

| # | Finding | Evidence |
|---|---|---|
| M1 | `GET/POST /api/people`: any logged-in user (even with no membership) can list everyone's phone/email and create Person records. | B8, B9 |
| M2 | Project/event approval chain readable by anyone. | F10 |
| M3 | `GET /funds/:id` returns every `FundAccessGrant` (who else has access) to a VIEW-only user. | D4 |
| M4 | SPA and server disagree on **55 of 64** seeded accounts. The server is never wider, but the UI offers actions the server will refuse: peer `ASSIGNMENT MANAGE` (66 cases), all `CORRESPONDENCE` grants, Secretary `PERSON VIEW_FULL`, Protocol coordinator `APPROVE`. Also the existing SPA test says the pastor *can* view/approve `fund-general`, while the server smoke test says he *must not*. | parity test |

### Code-read risks not proven by tests (real DB needed)

- **Double-verify and double-redeem races.** `contributions/:id/verify` and `sso/redeem` check status, then write, without a transaction guard. My in-memory test happened to serialize (E4, G2 pass), so it is **not confirmed**; on Postgres it is a real race (double-posted money / reused SSO token). Fix with a conditional `updateMany({where:{id,status:'PENDING'}})` and check `count === 1`.
- `jwt.verify` has no `algorithms` pin (alg=none is rejected today — A3 passes — but pin it).
- Mission `visibility` is stored but list/get filtering relies on per-item VIEW checks (N+1 queries; F5/F6 pass).

## What is working

Anonymous requests rejected everywhere tested; forged, unsigned and expired tokens rejected; ministry vaults closed to members, the pastor and the General treasurer without explicit grants; expired/revoked fund grants ignored; ended/expired memberships and assignments ignored; unknown roles without the flag get nothing; outsiders can't claim into ministries; cross-vault verification blocked; private events hidden from list/get; member can't approve projects; JWT carries no roles (recomputed each request).

## Recommended fix order

1. **Today, config only (no code):** set a strong `JWT_SECRET`, set `CORS_ORIGIN` to the real Vercel URL, set `VITE_API_FALLBACK=false`, stop seeding demo passwords in production, change `pastor`/`treasurer` passwords.
2. **One small PR `fix/rbac-api-gates`:** add `authorizePerson` checks to assignments POST, shares POST/GET, stewardship gift/used-cost, sso/issue, approvals GET, registrations (ENTER + server-chosen status); restrict `personId` override on authorize routes to governance; force approval status on create/PATCH; add date checks to `personIsChurchLeadership`; make unknown role + `grantsAllSystems` deny; scope claim listing per vault; drop `grants` from fund detail.
3. **Account lifecycle PR:** reject INACTIVE at login and in `requireAuth`, add login rate limiting, refuse to boot in production on default secret/CORS `*`, pin `algorithms: ['HS256']`.
4. **Architecture (biggest):** move correspondence, board, church finance, org, audit to API routes using the same policy engine, so those rules are enforced, not suggested. Until then treat them as non-confidential.
5. **Unify the two engines:** one shared policy package used by SPA and server, so the parity test can go green and stay green.

## How to run the tests

```
cd server
npm i -D vitest supertest @types/supertest
npx vitest run            # 55+28 failing today is expected
```
Add `"test:rbac": "vitest run"` to `server/package.json`. Tests are not wired into CI on purpose (they fail until fixes land). `server/tests/rbac.routes.test.ts` holds the route tests (IDs A–P above), `parity.spa.test.ts` the SPA-vs-server comparison, `fakePrisma.ts` an in-memory DB.

**Limits:** my sandbox can't download Prisma engines, so I used an in-memory fake instead of the real DB and could not run `npm run test:policy`. Findings marked "code" were read, not executed. Tests B8 (people directory) and H4 (self-verify) encode a policy assumption — tell me if you want those allowed.
