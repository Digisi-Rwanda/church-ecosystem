# Moriah scheduling UI delivery

Report date: 2026-11-01 (Africa/Kigali). Branch: staging. Acceptance is partial; the limitations below remain open.

## Starting point and preservation

Existing configuration models/APIs, configured Music selection and pinned lifecycle validation, Protocol calendar integration, version management, initial configuration editors, monthly scheduling tabs, roster, absence/fill-in/replacement screens, permissions, PDFs and history were reused. The phase map is SCHEDULING_UI_PHASE_MAP.md. The initial complete status is ui-phases-start-status.txt. The earlier verification reports and all pre-existing modified/untracked files were retained, including both .tsx.tmp files. SCHEDULING_VERIFICATION_FOLLOWUP_2026-10-31.md already contained the subsequent UI request when this phase began and was left untouched.

## Phase 2: configuration

Added frequency-period and planning-mode controls, service choir capacity, per-service choir eligibility/frequency exceptions, FIXED choir designations and date/service-specific Music availability. Exception editing preserves unknown codes and unrepresented/partial stored properties. Protocol configuration now exposes required-service flags, team-size settings, extra-duty handling, duplicate-day and Music compatibility settings; unknown relaxation codes and unsupported stored settings remain preserved. Existing roster availability and allowed-service controls are reused.

Draft/active/superseded states, activation issues, monthly-workspace navigation and empty states are explicit. Fixed designations require a writable draft; availability is correctly independent of version. A draft-creation navigation race was corrected with functional search-parameter updates. Inactive category/service references remain available during editing so existing references are not silently substituted.

Boundary: configurable Protocol absence/replacement policy rules are not present in the supported configuration model/API. The existing request/decision/offer workflows work, but this configuration subrequirement is deferred rather than inventing inert controls or redesigning the backend. Phase 2 is therefore not fully accepted.

## Phase 3: Music workspace

Added explicit configured category names in planner assignments, pinned configuration/rule context and actual strict server validation, per-service assigned counts against category minimum/maximum, a working bulletin view, setup navigation, draft replacement controls and clearer errors/pending handling. Removed the legacy choir-role restriction from manual candidate lists; the configured server validator determines whether a change is valid. Draft confirmation/publication actions respect the returned validation state.

The additive read response includes pinned rule context and category/count metadata; lifecycle writes and selector behavior were not redesigned. Historical change logs remain accessible. Detailed selection rankings/exclusion explanations and per-choir target-progress reports are limited to information the existing engine returns. Rule metadata is planner-only; ordinary readers do not receive the full configuration context. A historical Music snapshot browser is not provided by the current API; the existing month and change-log views remain the available history. These limits prevent claiming every Phase 3 presentation requirement is fully accepted.

## Phase 4: Protocol workspace

Added links between teams, setup, roster and My duties, pinned Music/Protocol configuration context, server notes, previous published-duty context and separate ordinary/voluntary duty totals. Blocked/stale publication is disabled where the month response reports it. The existing head assignment, recommended-head approval, coordinator confirmation and president publication workflows were retained. Roster and personal-duty screens now show actionable client-safe validation errors. Personal duty cards now mark FILL_IN duties, and duplicate personal action submissions are guarded.

Music remains the single shared calendar. Ordinary duty counts exclude voluntary FILL_IN slots. Existing absence requests, leader decisions, fill-in recipient acceptance and member replacement proposals were exercised through the actual UI. General configurable absence policy and comprehensive concurrency redesign remain outside the available implementation.

## Phase 5: workflow evidence

Browser testing used actual components, API adapters, Express routes and permissions with Prisma replaced by the existing in-memory test stand-in. No real database was connected. The development-only acceptance entry and server fixture are excluded from normal production entry/test discovery. Disposable fake identities and records were used. The preview fixture ends automatically; its long-lived server test completing is not itself a workflow acceptance test.

Observed workflows:

- Clone Music setup, change Sunday time to 09:30, save a monthly MINIMUM frequency target of 2, activate a draft, and show the old version as superseded.
- Add Guest choirs and change Grace Choir's explicit membership; the saved draft displayed Grace Choir · Guest choirs.
- Record Grace Choir unavailable on 2026-11-01. Generation succeeds with schema-correct fake timestamps, excludes Grace on that date, and manual replacement is refused with: Grace Choir is marked unavailable for Sunday morning · 2026-11-01. Other assignments remain intact.
- Generate November, review explicit categories, replace one Friday choir, confirm and publish Music. Generated/confirmed/published tabs reflect each state.
- Protocol receives only the applicable shared Sunday services, generates five teams of two, accepts manual and recommended heads, confirms as coordinator and publishes as president. No Friday Protocol calendar was duplicated.
- Member 1 requests an absence with Family commitment; Member 0 excuses it and offers Member 4 a fill-in; Member 4 accepts and sees the Fill-in label.
- Member 4 offers to replace Member 11 on another Sunday; Member 11 receives and accepts the offer, and the duty leaves Member 11's list.
- Distribution then shows Member 4 with one ordinary replacement duty and one voluntary fill-in, separately; the fill-in does not increment the ordinary count.
- An ordinary member opening restricted Music configuration receives the restricted/not-found view with no editing controls. Server tests cover rejected writes.
- Desktop and 390×844 mobile layouts were inspected. Music mobile measured document scrollWidth 375 against innerWidth 390. Screenshots retain Music publication, availability refusal, Protocol publication and duty distribution. Empty and permission-error views were also inspected.

The generic fake initially omitted Prisma's recordedAt/updatedAt availability defaults, causing a fixture-only generation error. The acceptance fixture now supplies these defaults. No production persistence change was made for that failure. The corrected availability workflow was rerun successfully. Editing source catalogs during preview also required a reload after a development hot-reload context error; a reload restored the preview.

All twelve requested scenarios are not claimed as one fully automated browser acceptance suite. Historical configuration pin preservation was also completed in the browser after restarting the disposable fixture: November was published under Music rules 1; the cloned version 2 category was renamed Next-version choirs and activated; after a page reload, November remained published at v1 with Community choirs and Configuration: Music rules 1. The saved evidence is ui-music-pinned-history.jpg. FIXED/MANUAL and all combinations of exceptions/team overrides have engine/configuration tests and UI controls, not exhaustive browser permutation coverage. Loading views were encountered during real requests; slow/error-state permutations have not been exhaustively automated. Full Phase 5 sign-off remains open.

## Routes affected

- /s/sys-music/config and /s/sys-protocol/config
- /s/sys-music/monthplan
- /s/sys-protocol/teams
- /s/sys-protocol/mine and /s/sys-protocol/roster

## Verification

- Full frontend: 54 files, 302 tests passed. ui-delivery-tests.log.
- Frontend production build passed. ui-delivery-build.log.
- Bundle passed: 7 files, 152106 gzip bytes = 148.541015625 KiB; unchanged budget 153600 bytes (150 KiB), margin 1494 bytes. ui-delivery-bundle.log. Lazy loading GovernanceLayout, PeopleLayout and NewSignInPage keeps functionality while reducing the first-visit closure.
- Focused backend: 6 files, 116 tests passed; Music/Protocol routes, configuration, configured Music engine, Music config rules, Protocol engine. ui-final4-backend.log.
- Server production build passed. ui-final3-server-build.log.
- Both Prisma schemas statically validate with dummy URLs; prisma validate does not contact a database. ui-final2-schema.log and ui-final2-schema-pg.log.
- Import boundaries passed, 0 known/new violations. ui-delivery-boundaries.log.
- Translation check passed. English source has 3764 keys; rw/fr remain off pending review (0 translated). New wording was not fabricated in either language. ui-delivery-i18n.log.
- git diff --check passed; output contains only Windows LF/CRLF notices. ui-delivery-diff-check.log.
- Final full backend run completed, exit 1: 74 files (72 passed, 1 failed, 1 opt-in benchmark file skipped); 1086 tests (1077 passed, 1 failed, 8 opt-in benchmarks skipped), 223.17 seconds. The single failure is tests/isolation.test.ts: nobody reads another system's records, by list or by id, reporting the previously known Catechist cross-system read-scope cases. This investigation remains expressly deferred. No scheduling suite failed. The run did not hang. See ui-delivery-full-backend.log. A clean full-backend acceptance is not claimed.

New regression coverage includes preservation/clearing of partial choir exceptions and unknown settings, safe error extraction, explicit pinned category presentation and count/validation metadata, and the personal voluntary-duty/recipient-only workflow view.

## Minimal backend integration changes

server/src/routes/musicSchedule.ts: planner reads previously lacked explicit category labels, pinned rule context, actual validation and requirement counts needed by the workspace. Added read-only presentation metadata from the pinned configuration.

server/src/routes/protocol.ts: the month response previously omitted pinned configuration identifiers and earlier published-duty totals needed by the team review view. Added these response fields. No lifecycle transaction, scheduling ownership or authentication redesign was performed. Existing broader changes in these already-modified files were preserved.

## Static migrations and deferred architecture

0060 adds Music frequency scope, fixed designations and unavailability; 0061 is the narrowly scoped legacy-category compatibility backfill; 0062 adds nullable shared-Music pins to Protocol plans/history. The existing static review in SCHEDULING_VERIFICATION_2026-10-31.md still applies. SHA-256 comparisons against verification-migration-hashes.json show all three files unchanged. None was executed. Runtime migration behavior is unverified by design.

Global scheduling-record ownership and non-atomic lifecycle writes remain unchanged architectural limitations. Tenant identifiers/context, database ownership/architecture decisions, transaction/concurrency redesign, a complex global Music solver and the unrelated Catechist read-scope investigation remain deferred. Tenant isolation and atomicity were not verified or claimed. No database architecture decision is implied by passing mocked tests.

## Files changed in this UI phase

Production/frontend and test changes attributable to this UI phase (some files already contained preserved earlier work):

- src/api/frontDoorApi.ts
- src/i18n/messages/en.ts
- src/newdesign/DoorSchedulingConfigPage.tsx
- src/newdesign/DoorSchedulingConfigPage.test.ts
- src/newdesign/SchedulingConfigEditors.tsx
- src/newdesign/MusicParticipationEditor.tsx (new)
- src/newdesign/schedulingForms.ts (new)
- src/newdesign/schedulingForms.test.ts (new)
- src/newdesign/config.ts
- src/newdesign/MonthPlanPage.tsx
- src/newdesign/ProtocolTeamsPage.tsx
- src/newdesign/ProtocolMinePage.tsx
- src/newdesign/ProtocolMinePage.test.ts (new)
- src/newdesign/ProtocolRosterPage.tsx
- src/newdesign/music.ts
- src/newdesign/music.test.ts
- src/newdesign/NewDesignRoutes.tsx
- src/styles/app.css
- server/src/routes/musicSchedule.ts
- server/src/routes/protocol.ts
- server/tests/musicSchedule.test.ts

New acceptance/report artifacts: acceptance-scheduling.html; scripts/scheduling-ui-preview.tsx; server/acceptance/vitest.config.ts; server/acceptance/scheduling-preview.test.ts; SCHEDULING_UI_PHASE_MAP.md; this report; ui-phases-start-status.txt; ui-phases-final-status.txt; ui-music-desktop.jpg; ui-music-mobile.jpg; ui-music-availability-error.jpg; ui-protocol-mobile.jpg; ui-protocol-distribution.jpg; ui-music-pinned-history.jpg. Local ui-*.log files contain intermediate/final diagnostic evidence and may be ignored by Git.

The exact complete modified/untracked working-tree inventory, including prior work, is ui-phases-final-status.txt. It is not a claim that every listed path was edited by this UI phase. The baseline inventory is ui-phases-start-status.txt. No dependencies or lockfiles were changed by this phase.

## Safety confirmation

Existing work was preserved. No real database access/modification, migration execution, schema push, database seeding, historical data rewrite, commit, push or deployment occurred. All test record mutations were confined to in-memory fakes. No budget increase, functionality removal, or test weakening was used to pass checks. The new backend count assertion's expected maximum was corrected from 3 to the fixture's pre-existing configured value of 2; the final focused run passes with that assertion intact.
