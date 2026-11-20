# Moriah scheduling verification — October 31, 2026

Acceptance is not claimed. The final full-backend result is recorded below; architecture remains explicitly deferred.

## Starting state and preservation
Branch: staging. No staged changes. Existing modified and untracked files were preserved; see verification-start-status.txt. Existing configured Music generation and pinned lifecycle routes, Protocol Music-calendar/category integration, version pinning and published-history fairness were already implemented. This task did not rebuild them. SCHEDULING_RESUME_REPORT.md contained the subsequent verification request at inspection time and was left untouched.

## Changes made in this verification task
- server/tests/choirWork.test.ts: replaced the expired October 30 future-date literal with the existing relative TOMORROW value. No assertion weakened.
- server/src/music/configuredEngine.ts: reserves capacity for later categories' hard minimums, requireAll and FIXED designations before adding optional frequency assignments. Orders unmet MINIMUM candidates by remaining eligible opportunities minus their deficit, considering later unavailability and each frequency bucket/counting mode. Existing deterministic seed and fairness tie-breaks remain.
- server/tests/configuredMusicEngine.test.ts: two concrete previously failing feasible arrangements now pass: competing category capacity and a choir that must serve before becoming unavailable. The latter also validates an explicit feasible schedule and checks seeded reproducibility.
- server/tests/musicSchedule.test.ts: unauthorized confirm/publish calls cannot write schedule state; actual generation meets monthly minimums while respecting date-specific unavailability, then confirmation succeeds.
- server/tests/protocol.test.ts: actual generation uses earlier published ordinary duties to break monthly ties and excludes voluntary FILL_IN assignments; history remains unchanged.
- src/newdesign/NewDesignRoutes.tsx: dynamically imports SystemFrame only when a system route opens, using existing Suspense handling. No features removed, no budget increased, no dependency or lockfile changes.
- server/scripts/verification-reporter.mjs: verification-only test-start/result reporter to identify long tests.

Temporary per-request isolation diagnostics were used to locate the sweep and are removed from the test source before delivery. Existing isolation assertions are unchanged.

## Selector findings and limits
Both feasibility regressions failed before the targeted changes and pass afterward. A choir cannot legally compete across categories: exactly one explicit category link per configuration is a business invariant, already tested. Categories compete for service capacity instead. Existing tests cover ROTATION, FIXED, MANUAL, inactive choirs, eligibility overrides, unavailability, category/service limits, duplicate occurrence assignments, requireAll, full-period frequency validation, and hard MINIMUM/MAXIMUM versus soft TARGET.

The improvements are look-ahead heuristics, not a complete feasibility solver. Complex competing period quotas, mixed override periods and scarce service capacities can still require bounded search/global planning. No proof that every feasible schedule will be found is claimed. Such cases should become explicit regression fixtures before adding bounded backtracking; this task does not introduce an unverified global algorithm.

## Scheduling routes and permissions
The focused tests cover configured Music generation, manual editing, strict decided-month validation, confirmation, publication, replacement snapshots and preservation of prior history; Protocol generation from decided Music services, lowercase service-code mapping, per-date team sizes, roster eligibility, monthly limits, review/publication, stale-version checks, absences, replacements, swaps, and published-history fairness. Added tests demonstrate unauthorized Music lifecycle calls cannot write even with a supplied systemId. Protocol coordinator/reviewer and member restrictions remain in the existing tests.

This is capability evidence within the existing model, not proof of church-tenant isolation. Scheduling records remain globally owned by month, and lifecycle writes are non-atomic and do not provide comprehensive optimistic concurrency control. No tenant IDs, ownership, authentication, transaction architecture or persistence refactor was introduced. These are explicitly deferred limitations.

## Test and build evidence
- Focused scheduling plus stale-date regression command (from server): npm test -- tests/musicSchedule.test.ts tests/protocol.test.ts tests/configuredMusicEngine.test.ts tests/musicEngine.test.ts tests/musicConfigRules.test.ts tests/protocolEngine.test.ts tests/schedulingConfig.test.ts tests/choirWork.test.ts --maxWorkers=2. Final focused result: 8 files, 158 tests passed, 42.33 seconds. Log: server/verification-focused-final-routes.log.
- Frontend: npm test -- --maxWorkers=2. 52 files, 296 tests passed, 33.00 seconds. Log: verification-frontend-tests.log.
- Server build: npm run build:api, exit 0. Log: verification-server-build.log.
- Frontend build: npm run build, passed; Vite portion 1.94 seconds. Log: verification-frontend-build.log.
- npm run boundaries: passed, zero known/new violations.
- npm run i18n: passed; rw/fr 0/3727 written and remain disabled pending review, as before.
- git diff --check: passed.
- Static Prisma validation from server, with dummy DATABASE_URL values: node node_modules/prisma/build/index.js validate --schema=prisma/schema.prisma and the same command with prisma/schema.postgres.prisma. Both exit 0. Validation does not open a database.

Full-backend command: VERIFY_REQUEST_PROGRESS=1 npm test -- --maxWorkers=2 --reporter=verbose --reporter=./scripts/verification-reporter.mjs (PowerShell environment variable syntax was used). Every test file was included; no new skip or exclusion was introduced. The existing BENCH=1 opt-in suite accounts for the eight skips, and is run separately below. Log: server/verification-backend-trace.log.

Completed, exit 1: 74 files (72 passed, 1 failed, 1 opt-in benchmark file skipped), 1084 tests (1075 passed, 1 failed, 8 opt-in benchmarks skipped), 515.09 seconds. The failure is tests/isolation.test.ts, firm walls between systems > nobody reads another system's records, by list or by id. It reports 25 Catechist read-scope cases across /api/people/filter-options, /api/people/filter-schema, /api/work/:id, /api/work-plans/:id and /api/reports/:id for the five private fixture systems. These failures are outside Music/Protocol scheduling and remain unchanged under the current scope. The final full run happened while new test cases were being appended; the final focused run independently covers all new scheduling cases. No clean full-backend pass is claimed.

The trace explains the apparent stall: the exhaustive read sweep took 89.568 seconds, and the write sweep took 394.629 seconds and passed. Its Church Leader control passed in 0.889 seconds. No deadlock or exhausted test timeout was observed in the completed run. The file intentionally permits 600 and 900 seconds respectively and enumerates routes across nine identities and five private systems. Earlier serial attempts were interrupted; one serial read sweep passed in 68.166 seconds, so cross-run variation in the read assertion is also unresolved. Per-test and per-request evidence is retained in the trace. No test assertions were weakened to obtain completion.

The eight opt-in benchmark tests were then explicitly run with BENCH=1 npm test -- tests/peopleSearch.bench.test.ts --maxWorkers=1: all 8 passed, 32.51 seconds, exit 0. Log: server/verification-benchmarks.log. They use in-memory fake storage; these results do not establish production/PostgreSQL performance.

## Bundle evidence
Before: first-visit closure 524 kB raw, rounded 153 kB gzip; budget failed. After lazy SystemFrame: 510 kB raw, 153255 gzip bytes (149.663 KiB), below 153600 bytes (150 KiB). npm run bundle passes. The main contributors remain vendor (72850 gzip bytes), boot (53324), shared kit (13640), NewApp (11888), FrontDoorContext (1125), runtime (428). Scheduling configuration is already a separate lazy page. The scheduling wording additions contribute to the eagerly loaded English catalog, but exact causal attribution to prior scheduling changes was not established through an isolated historical build. The change removes system-only layout code from sign-in/portal startup without changing functionality. Margin is only 345 bytes, so further eager imports need care.

## Static migration and schema review
Both schemas have identical structure after ignoring provider, comments and whitespace; raw differences are provider selection and comments. Both pass Prisma validation. Migration lock is PostgreSQL; the SQL migration chain is PostgreSQL, not a portable SQLite upgrade sequence.

0060 adds frequencyPeriod, FIXED designations and choir-unavailability structures, referencing the configuration tables created earlier. 0061 backfills only missing explicit links in the latest ACTIVE Music configuration, skips existing links and unsupported mappings, and does not reconstruct historical memberships. It does insert membership records when eventually applied; it does not rewrite historical schedules/assignments. 0062 adds nullable shared-Music configuration pins and indexes to ProtocolPlan/ProtocolHistory without guessing old pins. Ordering 0057 configuration -> 0058 schedule snapshots -> 0059 service team size -> 0060 foundation -> 0061 compatibility links -> 0062 Protocol Music pins is consistent.

Fresh PostgreSQL installs require the baseline and ordered migrations; existing databases with migrations use the pending chain. A database previously created without migration history requires an explicit baseline procedure; the runner refuses to silently adopt it. SQLite uses its separate schema; documentation currently describes schema push/setup, which was not run and is not evidence of a safe SQLite migration upgrade path. Static review and schema validation are not proof of runtime migration success.

SHA-256 comparison against verification-migration-hashes.json confirms 0060–0062 are unchanged. All remain unapplied in this task; no new migration was prepared.

## Safety and files
No database was accessed or modified, no migration executed, no schema push or seed run, no historical schedule rewritten, no commit/push/deployment performed. Runtime route tests use in-memory Prisma fakes. Existing staged/unstaged/untracked work was preserved. Exact final modified/untracked paths are saved in verification-final-status.txt, including diagnostic/report artifacts. Test/build logs may be ignored by Git but remain local evidence.

## Remaining blockers and deferred work

The single full-backend Catechist read-scope failure remains a release blocker pending a focused capability-policy investigation. No scheduling failure remains in the final targeted runs. Tenant isolation and lifecycle atomicity are expressly unverified and deferred, not silently accepted. The selector is not complete for all feasible constraint combinations. Runtime migration success is unverified by design. The bundle passes but has only a 345-byte margin. No assertion, skip condition or capability was relaxed.
