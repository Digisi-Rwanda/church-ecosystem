# Plan: moving the browser-only data onto the server (roadmap step 4)

Status: proposal for decision. Date: 3 October 2026. Based on measurements of the current code (below). Time estimates are rough, for one developer working with tests, and should be re-checked after Slice 1.

## 1. Why, and what "done" means

Today about 100 collections (people, church finance, board, deacons, youth, worship, letters, pastoral records) live only in each person's own browser. Two leaders never see the same members or the same church money. "Done" means: a record created on one device is visible on another, to exactly the people allowed to see it, survives clearing the browser, and every change is in the audit trail.

## 2. What the code tells us (measured)

| Fact | Number | What it means for the plan |
| --- | --- | --- |
| Files that read the people list array directly | 5 (20 uses) | The people data is already mostly behind one service: good news |
| Call sites of `peopleService` | 153 in 47 files | The service is the seam; do not change its callers more than needed |
| `peopleService.getById` | 61 call sites, all **synchronous** | The biggest constraint: turning it async touches about 47 files |
| Person fields in the app vs the server | app: 14 (date of birth, gender, address, national ID, pastoral notes, photo, ...); server: 7 | The server table needs the missing columns |
| Sub-record collections per person | about 10 (family, baptism, marriage, timeline, documents, employment, education, talents, gifts, pathways) | A second, separate slice |
| Files using memberships / positions / assignments / org units directly | 6 / 10 / 4 / 5 | These decide who may do what; move with care |
| Church money | The server already has `Fund` and `FinanceTxn` tables and the contribution-to-ledger flow | Church finance should reuse them, not invent new tables |

## 3. Decision 1: how reads work (recommended: server-backed cache, synchronous reads)

| Option | How | For | Against |
| --- | --- | --- | --- |
| A. Shared document (as Music and Protocol) | One JSON document for all people, synced whole | Fast to build (days), reuses the merge | Every browser receives everyone's national ID and pastoral notes; document grows with the congregation and with photos; no per-field privacy |
| **B. Tables, API, local cache (recommended)** | Real tables and endpoints; the SPA keeps an in-memory copy filled from the server; `getById` stays synchronous and reads the copy; writes go to the server first, then update the copy | Per-field privacy, pagination, reporting, audit; callers barely change | More work (2 to 3 weeks for people alone) |
| C. Fully async rewrite of every caller | `await peopleService.getById` everywhere | Cleanest on paper | Touches about 47 files at once; high risk, no user benefit |

This refines the audit's advice ("async from day one"): for **reads**, a cache keeps the existing synchronous calls working; **writes** become async because they can fail. New code uses a hook (`usePerson(id)`) that revalidates from the server.

## 4. Decision 2: privacy (before any data moves)

Some fields must not be sent to everyone who can see the member list: national ID, date of birth, address, pastoral notes, discipline cases, deacon care cases. Rule: the list and search endpoints return only name, preferred name, phone, status and photo thumbnail; the full record needs the existing `PERSON VIEW_FULL` grant, and sensitive fields are additionally limited to pastoral roles. Every read of a full record is audited. Rwanda's data protection law (2021) applies to this data; confirm retention, consent and storage requirements with a local adviser before launch.

## 5. Slices (each ships on its own, behind a flag, with tests)

**Slice 0: foundations (about 3 to 5 days).**
Replace `prisma db push` with versioned migrations (baseline the current schema; every later slice is a migration). Add a per-module switch (`VITE_SERVER_PEOPLE=true`) so staging can try it while production stays as is. Export tool: "download my browser data as JSON", so anything real entered during testing can be imported later.

**Slice 1: people identity (about 1 to 2 weeks).**
- Server: add the missing `Person` columns; endpoints list (paged), get, create, update, deactivate; field-level filtering as in section 4; audit events.
- SPA: `PeopleRepository` with a server implementation and the current local one; `peopleService` reads from the cache; first load and a 30-second revalidation; writes go to the API.
- Photos: store a small thumbnail (up to about 20 KB) on the server; keep full-size originals in the browser store until an object store is chosen.
- Tests: two-browser integration test (create on one device, see on the other; a member cannot read national ID; an unauthorised update is refused); parity test for the field filter.
- Acceptance: leaders on two devices see the same member list; the directory search and the Protocol roster picker use it; clearing browser data loses nothing.

**Slice 2: memberships, positions, org units (about 1 to 2 weeks).**
These feed the permission engine, so this slice also retires the browser copies of positions: the app asks the server for the signed-in person's grants (already done for server logins) and offers an admin screen to appoint and end office holders on the server. Extend the parity tests to every office. This removes the "demo role" special case.

**Slice 3: person sub-records (about 1 week).**
Keep the schema simple: one table keyed by person and section (family, baptism, marriage, timeline, documents, employment, education, talents, gifts, pathways) holding that section's rows as JSON with a version number, merged with the same three-way rule as Music and Protocol. Revisit real tables only if reporting needs them.

**Slice 4: church finance (about 1 to 2 weeks).**
Map service collections, expenses and the general fund onto the existing `FinanceTxn` and `Fund` tables (the contribution flow already writes there). New tables only for budgets and balance-sheet lines. Treasurer-only, vault-private, audited. Reconciliation report: browser total versus server total during the dual-run week.

**Slice 5: Board, Deacons, Letters, Pastoral operations (about 2 to 3 weeks).**
Order by sensitivity and use: Board decisions and follow-ups, then Letters and documents (PDFs stay generated in the browser), then Deacon cases and Pastoral cases last (most sensitive; need the strictest filtering and the audit read log).

**Youth, Worship and Choir operations** follow the same document-or-table choice per module once the above is stable; their contributions already use the server.

## 6. How each slice is made safe

1. A migration with a rollback note.
2. The new endpoints with route tests and the field-filter tests.
3. A repository switch per module, off in production until staging passes.
4. A two-browser integration test in the style already used for Music and Protocol.
5. Dual-run on staging: leaders work normally for a week; a comparison report lists records that differ between the browser copy and the server copy.
6. Import of any real browser data using the export tool, then the switch is turned on and the browser copy becomes a cache only.

## 7. Risks and how to handle them

| Risk | Handling |
| --- | --- |
| Real data entered in browsers before the move | Do the move before launch; the export/import tool covers anything entered during testing |
| Leaking sensitive fields | Section 4 rule, tests that assert absent fields, audit reads |
| Two sources of truth during the move | One switch per module; never both writable in production |
| Performance of the cache with a few thousand members | Paged list plus per-record fetch; the cache holds what has been viewed, with a name index for search |
| Free-tier sleep making the first load slow | Production uses the always-on plan (already planned) |
| Scope creep | One slice at a time; each is demonstrable to the leaders |

## 8. Recommended start

Slice 0 and Slice 1 together: migrations, the people endpoints with field-level privacy, and the cache-backed `peopleService`. It is the dependency of everything else, it is the smallest slice that gives leaders visible value (the same member list on every device), and it exercises the whole pattern the later slices copy.

## 9. Decisions taken (3 October 2026)

1. **Approach:** option B for people (tables, API, local copy for fast reads). Everything that is real data moves to the server over the slices; the browser keeps only a cache, UI preferences and unsent drafts.
2. **Who may open the People module:** Church Leader (everything) and Catechist (limited data, see below). Nobody else, **including the Pastor**, sees the People module. Every signed-in person, the Pastor included, can open and read their own profile.
3. **Photos and documents** are files, not database columns: they go to server-side file storage in a later slice. Until then a small thumbnail is stored with the person.

### Access rules for people data

| Who | People module | Whose record | Fields |
| --- | --- | --- | --- |
| Church Leader | yes | everyone | all, can edit |
| Catechist | yes | everyone | **limited set** (proposed below), cannot edit identity data |
| Pastor | no | own profile only | own record only |
| Everyone else | no | own profile only | own record only |

**Proposed limited set for the Catechist** (to confirm): name, preferred name, phone, email, status, church and ministry memberships, baptism and catechism pathway, family links. Not shown to the Catechist: national ID, date of birth, address, pastoral notes, discipline cases, deacon care cases, employment, education, documents, finance.

**What this changes in the code.** Today the rules give both the Pastor and the Catechist the "view full people records" permission, so both currently see more than this. The change is: remove it from the Pastor, give the Catechist a lower "view basic" level, and add a server-side filter that strips the sensitive fields for anyone below Church Leader. The rule lives in both the app and the server engine, so the parity tests added in step 3 will fail if only one of the two is changed, which is exactly their job.

**Own profile.** A person may always read their own full record and may edit only their contact details and photo (proposed); status, roles and memberships stay with the Church Leader.

## 10. Progress log

**3 October 2026 — slice 1 (people identity), server and sync built.**
- `Person` table gained: dateOfBirth, gender, address, nationalId, joinedChurchOn, pastoralNotes, photoUrl (applied by `prisma db push` on next deploy).
- `server/src/policy/personFields.ts`: tiers FULL (Church Leader), BASIC (Catechist), SELF (own record), NONE.
- Routes: `GET /api/people/records` (paged, tier-filtered), `GET /api/people/:id`, `PATCH /api/people/:id` (audited; self may edit only preferredName, phone, email, address, photoUrl), `POST /api/people` (accepts the app's id). `GET /api/people` (directory search) never returns identity details.
- Rules changed identically in `src/domain/authorize.ts` and `server/src/policy/buildAccess.ts`: Pastor loses PERSON VIEW_FULL; Catechist has PERSON VIEW only. Secretary keeps VIEW_FULL for letters — decision pending.
- App: `src/services/peopleServerSync.ts` keeps the in-memory `PEOPLE` list equal to what the server allows, refreshes every 30 s, writes through to the server, rolls back and reports when the server refuses. Switch: `VITE_SERVER_MODULES=people`.
- Backup: `exportAllLocalData()` and `downloadLocalBackup()` (no button yet).
- Tests: `server/tests/people.privacy.test.ts` (16), `server/tests/integration/people.int.test.ts` (7), `src/data/localBackup.test.ts`.
- Not yet: versioned migrations baseline (needs a machine that can run Prisma), backup button, memberships/positions/org units (slice 2).

**3 October 2026 — slice 2 (memberships, positions, org units), built.**
- Schema: `Membership.systemId` now optional (as in the app); `Position` gained `choirAdvisorRole` and `systemAdmin` (the server rules already read `systemAdmin`, it was never stored); `OrgUnit` gained `description`.
- Routes `/api/participation`: `GET /records`, `POST|PATCH /memberships`, `/positions`, `/org-units`. Every write is audited and needs the matching MANAGE grant in the record's own system; church leadership (POSITION MANAGE in the main church) covers all systems; nobody else can set `systemRole`, `grantsAllSystems` or `systemAdmin`, create or end church-wide positions.
- Reads: everyone sees the org structure and their own memberships; Church Leader and Catechist see everyone's; others see who holds which office but not the authority flags.
- New person tier DIRECTORY (names and status only) for ministry leaders and other role holders; the directory search no longer returns phone or email except to Church Leader and Catechist.
- App: `participationServerSync.ts` (same pattern as people), switch `VITE_SERVER_MODULES=participation` (comma-separate with people), collections cleared at sign-out.
- Tests: `server/tests/participation.test.ts` (13), `server/tests/integration/participation.int.test.ts` (7), extended `people.privacy.test.ts`.
- Caution before switching on in staging: the staging database seed must contain the same demo memberships and positions as the app's demo data, otherwise leaders will see the server's smaller set.
