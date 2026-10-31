# People filtering — policies and staging verification

## Semantics
- **Same-record:** `employment`, `education`, `calling` use `anyMatch`/`noneMatch`; every sub-condition must hold on ONE record. A person whose highest degree and requested field sit in different records does not match.
- **Missing values:** positive comparisons never match a missing value; "is not"/"none of" do. Zero is a real value.
- **Child count:** distinct children from FAMILY records of relation CHILD. Identity = `relatedPersonId`; else normalised name + birth date. A link and a bare-name record merge only if the name+birth date maps to exactly one linked id. Entries with a name but no birth date and no link each count once. Consequence: a child entered once by link and once by bare name (no birth date) now counts twice; fix by adding the birth date or the link. Only the viewer's readable FAMILY data is used; no names leave scope.
- **Dates:** "today" is the Kigali day (Africa/Kigali, UTC+2, no DST). Years between dates compares MM-DD; a 29 Feb anniversary falls on 1 Mar in non-leap years. Future dates yield no years. Compatibility: the old code used the UTC day, so between 00:00 and 02:00 Kigali time results can differ by one day from before.

## Tests and real database
- Unit/API tests use an in-memory Prisma stand-in (`tests/fakePrisma.ts`); run `npm test --prefix server`.
- Benchmark: `npm run bench:people --prefix server` (sets BENCH=1). It runs 5,000 people / 12,000 records through the real route with read counters. It measures route work and record reads, **not** PostgreSQL or network time. It does NOT establish the 800 ms production target.
- Cross-check done once against local PostgreSQL 16 with synthetic data: route totals equal SQL totals (25, 195, 279).

## Staging verification (real PostgreSQL, ~5,000 people)
1. Create a **Neon branch** of staging (or a separate empty database). Never run against production data. Do not import or modify real member data without approval.
2. Load synthetic data only (5,000 persons, ~12,000 PersonRecord rows). A seeder is available on request; none is shipped yet.
3. Ground truth: write each test question as plain SQL over Person/PersonRecord/Membership and record the totals (see the three examples used locally).
4. Latency: `API_URL=... TOKEN=... RUNS=30 EXPECT_TOTALS="five=..,finance5y=..,bachelorLaw=.." node server/scripts/searchLatency.mjs`. Report min/median/p95/max; discard the first (cold) run when judging.
5. Query timing: enable Prisma query logging (`log: ['query']`) on the staging server for one run, or run `EXPLAIN (ANALYZE, BUFFERS)` on the slim person scan and the PersonRecord read (`section IN (...)`). Compare to total latency to separate DB time from route time.
6. Count correctness: totals from step 4 must equal step 3 exactly.
7. Authorization: with scoped tokens (Church Leader, Pastor, a ministry leader, a unit-limited member) confirm: forbidden fields → 403 FIELD_NOT_ALLOWED; out-of-scope unit → 403 UNIT_NOT_ALLOWED; totals shrink to the viewer's scope; directory-tier people expose only id, member code, name, status.
8. Optional: PersonRecord has an index on (personId, section, status) but none leading with section; add `(section, status)` only if EXPLAIN shows a sequential scan that matters (needs a migration, so ask first).
