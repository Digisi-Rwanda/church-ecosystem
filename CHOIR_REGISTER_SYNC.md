# Choir register and Scheduling Setup synchronization

Implemented locally on 2026-11-01. The deployed Vercel site was not modified.

The Choir register at /s/sys-music/choirs remains the source of choir names, types and active status. Scheduling Setup at /s/sys-music/config consumes those same records; it does not create a second choir register. Both screens now link to each other. The register's Setup link prefers an existing draft.

## Automatic category assignment

Registered types match active category codes in editable Music drafts:

| Register type | Category code |
| --- | --- |
| Main/Primary choir | PRIMARY |
| Second/Secondary choir | SECONDARY |
| Children's choir | CHILDREN |
| Worship team | WORSHIP |

Choir creation, register type changes and choir restoration reconcile matching membership in drafts. Cloning a configuration includes currently registered choirs; adding a matching category to a draft fills missing memberships. Restoring an archived configuration reconciles the current register after it becomes editable. Existing exception settings are retained. Custom category codes outside PRIMARY/SECONDARY/CHILDREN/WORSHIP, and disabled links, are retained rather than guessed or overwritten.

No categories are invented when a matching code is absent. Setup flags choirs that need a matching category or participation review. Review and activate a draft to use new memberships. Active, archived and historical versions are not silently rewritten or activated. Retirement excludes a choir from future selection through its register active status; saved memberships remain for history. Deletion of a choir referenced by configuration is refused with a message to retire it instead. Unreferenced choirs retain the existing delete workflow.

## UI synchronization and Month plan

Successful register writes notify the current page and other same-origin tabs using a non-sensitive invalidation signal. Register-backed views also refresh when returning to a visible/focused page. No choir records are duplicated into browser storage. This is not cross-device server push.

Month-plan cards no longer show the assigned/minimum/maximum category count rows. Configured rule validation and the expandable pinned-rule details remain available.

## Browser verification

A separate in-memory preview on ports 5174/4327 preserves the earlier preview's test data on ports 5173/4317. Prisma is mocked in both previews; no real database was accessed.

With Scheduling Setup open in one tab, a new Primary-type Register Sync Test choir was added in the Choir register in another tab. Its draft category membership appeared automatically in the already-open Setup page. Renaming it to Renamed Register Test updated Setup without manual copying; retiring it changed the Setup row to Retired. A generated November month showed assignments without the removed count rows. Adding the missing CHILDREN and WORSHIP draft categories also moved the corresponding existing choirs automatically into their matching categories. Screenshots: choir-register-sync-proof.jpg and month-plan-without-category-counts.jpg.

## Verification results

Full frontend suite: 55 files, 307 tests passed. Frontend and server production builds, import boundaries, translation checks and git diff --check passed. Bundle: 152642 gzip bytes (149.064453125 KiB), below the unchanged 153600-byte budget by 958 bytes. Final results are recorded in choir-sync-verified-*.log and choir-sync-server-verified.log.
Focused backend: 99 passed across Music register, scheduling configuration, Music schedule and configured Music engine tests. Server build passed. Full backend regression completed, exit 1: 74 files (72 passed, 1 failed, 1 skipped), 1107 tests (1098 passed, 1 failed, 8 opt-in benchmarks skipped), 383.98 seconds. The only failure is the previously known Catechist cross-system read-scope assertion in tests/isolation.test.ts. No new scheduling/register suite failed. The exhaustive isolation file took 379.277 seconds; it completed rather than hanging. Its investigation remains expressly deferred. Log: choir-sync-full-backend.log.

The final frontend regression added coverage for opening the appropriate draft from the register, plus mutation success/failure invalidation signals. An existing sparse category fixture exposed a missing-code UI edge case; that render now tolerates absent category codes.

No schema changes, migrations, database operations, dependency changes, commit, push or deployment occurred. Existing draft archive/delete work was preserved. Global scheduling ownership and existing non-atomic lifecycle-write limitations remain deferred; tenant isolation and production atomicity are not claimed.

## Files changed for this synchronization

server/src/scheduling/choirRegisterSync.ts (new); server/src/scheduling/store.ts; server/src/routes/music.ts; server/tests/music.test.ts; src/api/choirRegisterEvents.ts (new); src/api/choirRegisterEvents.test.ts (new); src/api/frontDoorApi.ts; src/newdesign/useChoirRegister.ts (new); src/newdesign/ChoirsPage.tsx; src/newdesign/SchedulingConfigEditors.tsx; src/newdesign/MusicParticipationEditor.tsx; src/newdesign/MonthPlanPage.tsx; src/newdesign/DoorSchedulingConfigPage.tsx; src/newdesign/DoorSchedulingConfigPage.test.ts; src/newdesign/music.ts; src/i18n/messages/en.ts. Preview-only changes: scripts/scheduling-ui-preview.tsx; server/acceptance/vitest.config.ts; server/acceptance/scheduling-preview.test.ts. Existing unrelated modified and untracked work remains intact.
