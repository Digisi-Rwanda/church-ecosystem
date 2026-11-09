# Moriah Scheduling — Final Verification and Targeted Hardening

## Objective

Continue from the existing scheduling implementation and the October 31, 2026 Scheduling Resume Report.

The configured Music and Protocol integrations already exist. Do not rebuild them or repeat completed work.

Your task is to establish the strongest possible evidence that the implementation is correct, secure, stable and ready for the next acceptance stage.

## 1. Preserve existing work

Before making changes:

- Inspect `git status`, current branch, staged changes, unstaged changes and untracked files.
- Read the scheduling resume report and relevant existing check logs.
- Identify which changes belong to this scheduling work and which were already present.
- Preserve all existing work, including unrelated untracked files.
- Do not reset, clean, stash, overwrite or discard existing changes.
- Do not assume the previous report describes the current working tree perfectly.

Migrations `0060–0062` must remain unchanged and unapplied.

## 2. Establish a clean backend test result

Investigate why the full backend suite stalled.

- Identify whether the cause is a genuine deadlock, hanging test, resource exhaustion, test isolation problem or simply excessive execution time.
- Run the suite in a controlled, bounded manner.
- Identify the exact test or test group where execution stops.
- Correct genuine scheduling-related regressions if discovered.
- Fix the stale date assertion in `choirWork.test.ts` using a deterministic clock or relative date.
- Do not weaken assertions, skip tests, silently exclude failures or report partial results as a complete pass.

If the full suite cannot finish, report the exact blocker and provide the strongest reproducible partial evidence.

## 3. Audit tenant isolation and permissions

Review the Music and Protocol scheduling configuration, generation, editing, confirmation, publication and replacement routes.

Verify:

- Tenant A cannot read or modify Tenant B's schedules, configuration or history.
- Read and write operations enforce the correct server-side capabilities.
- Client-supplied system IDs cannot bypass tenant ownership or permissions.
- Historical schedules remain tied to their original configuration versions.
- Unauthorized users cannot confirm or publish schedules.
- Replacement and swap operations preserve the same security and versioning rules.

Add focused tests for any gaps found.

Do not broaden access for convenience.

## 4. Audit lifecycle and transactional integrity

Review Music and Protocol lifecycle operations.

Verify:

- Partial failures cannot leave schedules in inconsistent states.
- Confirmation and publication validate the correct pinned configuration.
- Concurrent edits cannot silently overwrite newer changes.
- Replacement and swap operations preserve history and audit records.
- Published schedules cannot silently change after configuration updates.
- Failed operations do not leave partially applied assignments or duty counts.

Use existing transaction and concurrency patterns where possible. Introduce changes only where a concrete correctness problem is demonstrated.

## 5. Investigate Music selector limitations

The current Music selector is greedy and may reject a feasible arrangement when quotas compete or future availability matters.

Construct concrete test cases involving:

- Multiple categories competing for the same eligible choirs.
- Minimum-frequency requirements.
- Choir unavailability on later service dates.
- Capacity limits and duplicate restrictions.
- FIXED, ROTATION and MANUAL planning modes.

Determine whether a feasible arrangement is incorrectly rejected.

If this occurs, implement the smallest reliable improvement, such as bounded backtracking, without unnecessarily replacing the existing engine.

Preserve deterministic results for identical inputs and seeds.

If a global optimization strategy is necessary but too broad for this task, document the exact limitation and an appropriate follow-up rather than introducing an unverified algorithm.

## 6. Resolve the frontend bundle budget failure

The bundle is currently 153 kB compressed against a 150 kB budget.

- Inspect the actual bundle report and identify the largest contributors.
- Determine whether recent scheduling UI changes caused the increase.
- Prefer removing unnecessary imports, improving code splitting or reducing duplicated dependencies.
- Preserve current functionality and existing UI behavior.
- Do not increase the budget just to make the check pass.
- Do not undertake an unrelated frontend redesign.

Re-run the build and bundle check.

## 7. Migration and schema safety

Review migrations `0060–0062` and both Prisma schemas.

Verify:

- SQLite and PostgreSQL schema parity.
- Migration SQL corresponds to the intended schema changes.
- Migration ordering and dependencies are correct.
- Fresh-install and existing-database paths are understood.
- No migration silently rewrites historical schedules or assignments.

Do not apply migrations, run `db push`, seed a database or access a live database.

Static review is not proof of runtime migration success. State that limitation clearly.

## 8. Final verification

Run the relevant checks:

- Full backend test suite.
- Focused Music and Protocol scheduling tests.
- Server TypeScript build.
- Frontend tests.
- Frontend build and bundle budget.
- Import-boundary checks.
- Translation checks.
- `git diff --check`.
- SQLite/PostgreSQL schema validation.

Report exact test counts, failures, durations and commands. Distinguish completed checks from checks that timed out, were blocked or were not run.

## Strict boundaries

- No database modifications.
- No migration execution.
- No `prisma db push`.
- No seeding or production data access.
- No historical schedule rewriting.
- No commit, push or deployment.
- No dependency or lockfile changes unless strictly necessary and explicitly justified.
- No removal of existing tests to obtain a passing result.
- No broad refactoring or unrelated UI work.

If a change risks existing data, tenant isolation or historical schedule integrity, stop and report the issue before proceeding.

## Final report

Provide:

1. What was already complete when you started.
2. What you changed and why.
3. Full backend suite result.
4. Focused scheduling test results.
5. Tenant and permission audit results.
6. Lifecycle and transaction audit results.
7. Selector feasibility findings.
8. Bundle size before and after.
9. Migration/schema findings.
10. Remaining limitations and release blockers.
11. Exact modified and untracked files.
12. Confirmation that existing work was preserved and no database, migration, commit, push or deployment operation occurred.

Do not claim full acceptance unless every required check has actually completed successfully.