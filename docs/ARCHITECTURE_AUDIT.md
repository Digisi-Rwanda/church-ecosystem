# Architecture audit — quality attributes

Date: 2 October 2026. Method: static measurement of the repository (size, imports, cycles, duplication), reading the main flows, and the integration tests written in this engagement. Every number below was measured, not estimated. This complements `ARCHITECTURE_REVIEW.md` (which module's data lives where).

## Verdict in one paragraph

The product ideas are sound and the hardest domain rules (permissions, schedule merge, team building, vault privacy) are tested and correct. The structure underneath is a **prototype that grew into a product**: the browser holds the business logic and the data, and the server is being grown beside it, one module at a time, by re-implementing rules a second time. That is what makes it hard to evolve, not the code quality of any single file. The fix is not a rewrite; it is to pick one home for each rule and move toward it in small steps behind tests that already exist.

## Scorecard

| Attribute | Score | One-line reason |
|---|---|---|
| Correctness of core rules | Good | Roles, vaults, merge, team engine are tested; 419 automated tests |
| Testability of logic | Good | Pure engines (teamEngine, musicScheduleEngine, merge3) test cleanly |
| Testability of the whole | Fair | Integration tests exist now; no browser test; no real database in CI |
| Cohesion | Fair | Domain folders are sensible; several files are doing 5 jobs |
| Low coupling | Poor | Global mutable seed arrays, import cycles, services calling services |
| Simplicity | Fair to poor | Two implementations of the same rules; hybrid data paths per module |
| Evolvability | Poor to fair | Synchronous in-memory APIs cannot become server calls without touching every caller |
| Operability | Poor | No logging, no error reporting, no migrations, no rate limit |
| Security posture | Fair | Server-side policy is real; defaults are permissive; no login throttling |

## 1. Evolvability

### F1. The service API is synchronous and mutates global arrays (critical)

`missionService` (0 async functions), `churchFinanceService` (0), `protocolService` (4 async of about 150) all read and write exported module-level arrays such as `PROGRAMS`, `FINANCE_TXNS`, `PROTOCOL_ROSTER`. There are 133 such mutable exports in `src/data`, registered for browser persistence in `registerLocalDomain.ts`.

Why it matters: the day a module moves to the server, its functions must become `async`, and **every caller** (pages, other services, tests) must change. This is why Music and Protocol had to use a different trick (a sync layer that copies the whole document in the background) instead of a normal API call. Each future module will need the same workaround or a large rewrite.

Suggestion: introduce a **repository seam** per aggregate. A page asks a hook (`usePrograms()`), the hook asks a `ProgramRepository` interface, and two implementations exist: `LocalProgramRepository` (today's arrays) and `ApiProgramRepository`. Pages never import seed arrays or services directly. Move one aggregate at a time; the interface is async from day one, so swapping the implementation changes no caller. Mission already does a version of this in `useMissionLists` and `missionWrite`; generalise it.

### F2. Business rules exist twice (critical)

| Rule set | SPA | Server |
|---|---|---|
| Permissions and grants | `domain/permissions.ts` 224 lines, `choirAccess.ts` 312 | `policy/permissions.ts` 50, `choirAccess.ts` 122 |
| Mission lifecycle (approve, start, close) | `missionService.ts` 2,906 lines | `mission/lifecycle.ts` 767 lines |
| Finance access | `financeAccess.ts` 121 | `policy/financeAccess.ts` 100 |

The files are not copies (the permissions files differ in 193 lines), so they will drift. One parity test guards grants only; lifecycle has none.

Suggestion: **one rules package, imported by both**. Move the pure rules (no database, no DOM) into a shared workspace package (`packages/rules`) and import it from `src/` and `server/src/`. The server stays the authority; the SPA uses the same functions to decide what to show. This also deletes code. Until then, extend the parity test to lifecycle transitions.

### F3. One type file for everything

`domain/types.ts` is 2,041 lines and is imported everywhere; it is also part of 5 import cycles (it imports `audiencePool` and `programRoles`, which import it back). Any change recompiles and re-risks the whole app.

Suggestion: split by bounded context (`people`, `mission`, `finance`, `protocol`, `music`, `choir`, `access`) with a thin `shared` kernel. Types must not import logic; move the two offending imports out.

### F4. No API contract

The SPA hand-writes `ApiProgram`, `ApiEvent`, and mapping functions in `missionApi.ts` (about 900 lines); the server builds objects ad hoc. A field renamed on the server breaks the SPA silently at run time. The server does validate input with zod, but the same schemas are not shared.

Suggestion: share the zod schemas (and inferred types) from the shared package; return typed DTOs; add an `/api/v1` prefix so a future mobile app or a second SPA can coexist with the first.

## 2. Low coupling and high cohesion

### F5. Import cycles and layer violations

`madge` finds 10 cycles. Two kinds:

- `api/index.ts` exports sub-modules that import `api/index.ts` back (3 cycles). Harmless today, a trap tomorrow.
- `domain/types.ts → audiencePool → data/seed → …` (7 cycles): the domain layer imports seed data, so "pure domain" is not pure. Four domain files import from `data/`.

Rule to enforce in CI: `domain` imports nothing from `services`, `data`, `pages`, `api`; `pages` import only `hooks` and `components`; `services` do not import each other except through a named facade. Use `eslint-plugin-boundaries` or `dependency-cruiser` so a violation fails the build.

### F6. God files

| File | Lines | Jobs mixed in it |
|---|---|---|
| `services/protocolService.ts` | 3,190 | roster, teams, availability, swaps, attendance, reports, contributions, notifications, import |
| `services/missionService.ts` | 2,906 | programs, events, tasks, projects, enrolment, stewardship, approvals |
| `server/mission/registerExtended.ts` | 1,994 | about 40 routes in one function |
| 10 page files | 1,200 to 1,800 | form state, data loading, rules, layout |

Cohesion is the problem, not length: a change to swap proposals risks the roster. Split along the lines the file already has (the section comments are a ready-made table of contents). Pages above 600 lines should be a page shell plus feature components plus a hook.

### F7. Services calling services

27 service files import other services. `protocolService` imports `musicScheduleService`, `financeService` and `authService` directly. Dependencies run in every direction, so a service cannot be tested without its neighbours' global state (the tests work around this with `_resetForTests`, which is itself a symptom).

Suggestion: services take their collaborators as arguments or through a small context object; Music publishes events ("month published") and Protocol subscribes, instead of Protocol reading Music's arrays.

## 3. Simplicity

### F8. Three ways to reach data, per module

A page may read (a) a seed array directly (6 files do), (b) a service over the seed array (21 services import seed data), or (c) an API loader with seed fallback (`loadXPreferApi`). Each module has a different mix, and `DATA_SOURCES.md` exists to explain which. The fallback means a failing server looks like working software with old data (this already caused a real incident).

Suggestion: one path (pages → hooks → repository). Decide per environment, not per call, whether the fallback exists: demo build has it, production build has none and shows an honest "cannot reach the server" state.

### F9. Hybrid login with silent downgrade

`authService.login` tries the API and quietly falls back to a local demo session. It is useful for demos and dangerous for production. Keep it, but behind a build flag that the production build cannot enable.

### F10. Shared documents are a clever workaround, not a pattern to repeat 40 times

Music and Protocol sync as two whole JSON documents with merge. It is well tested and fine for two modules. For people, finance and the board it would repeat the same trick over data that wants real tables (queries, reporting, row-level permissions). Use documents only where the data really is one editable plan; use tables for records.

## 4. Testability

Strengths: pure engines, route tests with a fake database, the two new integration suites, and the parity test.

Gaps:

- No test runs against a real Postgres. The in-memory fake already needed three patches during this engagement (it ignores `include`, timestamps and some filters). Add one CI job using a Postgres service container and run the integration suites against it.
- No browser test. The incidents so far (CORS, `VITE_API_URL`, menu items hidden by an allow-list) are exactly what a Playwright smoke test (sign in, open each module menu, see the published schedule) would catch.
- Tests depend on global state and `_resetForTests()`; that disappears with F1.
- **The server's 206 tests were never run by CI.** The server had no `test` script, and `npm run check` ran only a policy smoke script. Fixed in step 1: `npm run check` now runs the server tests.
- No test for the hosting configuration. Add a post-deploy check that calls `/api/health` and a CORS preflight from the production origin.

## 5. Operability and security

| Finding | Evidence | Suggestion |
|---|---|---|
| No structured logging | 3 `console` calls in the server, no logger | **Done in step 1:** JSON logs with request id (swap to `pino` later if wanted) |
| No error handling in the SPA | no error boundary | **Done in step 1:** `ErrorBoundary` around every page (menu survives a crash); later ship errors to a tracking service |
| No per-address limit, no security headers | login is throttled per username only; no headers | **Done in step 1:** per-address limiter and baseline headers |
| Schema changed with `db push` at every start | `start:render` runs `db:push:pg` | `prisma migrate deploy`; keep the history in git |
| Permissive defaults | guard `warn`, read filter off, fallback login on | production profile that fails to boot unless set (the JWT and CORS checks already do this) |
| 12 h tokens, no refresh or revoke | `jwtExpiresIn: '12h'` | short access token plus refresh; revoke on password change |
| Single bundle | was one 1.47 MB JS file, 0 lazy routes, 63 pages | **Done in step 1:** 117 lazy pages; entry file is now 303 kB (91 kB gzipped) plus a 404 kB shared chunk that holds the seed data |
| Audit trail is thin | 6 places write audit events | audit every state change that moves money or authority |

## 6. Target architecture (evolution, not rewrite)

```
packages/rules     pure rules, schemas, DTO types      (no DOM, no DB)
        ^                         ^
        |                         |
   src/ (SPA)               server/src (API)
   pages -> hooks           routes -> application services -> repositories
              |                                                  |
        repositories                                    Prisma / Postgres
   (Local | Api)  <---- same interface ---->
```

Principles: one home per rule; async interfaces everywhere; pages know nothing about storage; server is the authority; the browser copy is a cache.

## 7. Roadmap

Each step is independently shippable and leaves the tests green.

1. **Guard rails first (1 week). Status: mostly done; see below.** Dependency-boundary lint in CI, login rate limit and `helmet`, `pino`, `ErrorBoundary`, route `lazy()`, Playwright smoke test, Postgres job in CI. No behaviour change.
2. **Production profile (days).** Build flag removes demo fallback and demo accounts from the production bundle; boot fails unless guard is enforce and read filter on.
3. **Shared rules package (2 weeks).** Move permissions and lifecycle rules; delete the duplicates; extend parity tests.
4. **Repository seam, one aggregate at a time.** Start with People (everything depends on it), then Church finance, Board, Deacons. For each: interface, Local implementation (wraps today's code), Api implementation, server tables and routes, migration of existing browser data, switch.
5. **Split the god files** opportunistically, whenever a feature touches them, along their existing section lines.
6. **Contracts and versioning.** Shared zod DTOs, `/api/v1`, generated client.

## 8. What not to do

- Do not rewrite. The rules are the expensive part and they are correct.
- Do not add a state-management or ORM framework to fix coupling; the coupling is in the import graph, not the tools.
- Do not move all 100 collections at once. Move the ones people will lose sleep over first (people, church money, board decisions, care cases).
- Do not turn Music and Protocol into something else before launch; they are the best-tested part.

## 9. Step 1 status (guard rails)

| Item | Status |
|---|---|
| Import-boundary check in CI (`npm run boundaries`, baseline of 11 known violations, fails on any new one) | Done |
| Server tests run in CI (`npm run check`) | Done |
| Per-address rate limit, security headers, request ids, JSON logging | Done, with tests |
| `ErrorBoundary` on every page, lazy-loaded pages | Done |
| Playwright browser smoke test | Not done: needs a new dependency and a test account on a deployed environment |
| Postgres service container in CI | Not done: the integration suites use an in-memory database by design; running them on Postgres needs a small adapter |
