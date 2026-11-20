# Moriah Scheduling — Complete Remaining UI Phases (2–5)

## Objective

Continue the existing Moriah Music and Protocol scheduling project.

The backend configuration models, APIs, configured Music engine, Protocol integration, pinned lifecycle validation and initial configuration UI foundation already exist.

Your task is to inspect the current implementation and complete the remaining UI work so church leaders can configure, generate, manage, review and publish Music and Protocol schedules through coherent workflows.

This is a continuation, not a rebuild.

## PHASE 0 — Inspect and preserve

Before implementation:

1. Inspect the current Git branch and complete working-tree status.
2. Read:
   - `SCHEDULING_VERIFICATION_2026-10-31.md`
   - `SCHEDULING_VERIFICATION_FOLLOWUP_2026-10-31.md`
   - `verification-followup-status.txt`
3. Inspect the existing scheduling UI, routes, API functions, types, permissions and tests.
4. Identify what is already complete, incomplete or broken.
5. Preserve every existing modified and untracked file.
6. Do not recreate existing pages or functionality unnecessarily.

Produce a concise internal phase map before coding.

## PHASE 2 — Complete Scheduling Configuration UI

Inspect and finish the existing Scheduling Setup interface.

Music configuration must support:
- Service definitions and recurrence.
- Choir categories and explicit choir membership.
- Frequency rules and period scope.
- Minimum, maximum and target requirements.
- Choir eligibility and availability.
- Eligibility and frequency exceptions.
- FIXED assignments.
- ROTATION and MANUAL planning modes.
- Draft configuration editing, validation and activation.

Protocol configuration must support:
- Configurable team sizes.
- Monthly service targets.
- Eligibility and availability.
- Duplicate-duty restrictions.
- Absence and replacement rules.
- Relevant fairness and duty-distribution settings.

Requirements:
- Keep Music and Protocol policy responsibilities separate.
- Protocol consumes Music's shared service calendar; it must not create a duplicate Music calendar.
- Clearly distinguish draft configuration from active configuration.
- Explain validation errors in language understandable to church leaders.
- Preserve hidden or unsupported stored settings instead of silently deleting them.
- Respect existing server permissions.
- Do not invent translations. Keep new wording in the established English source and report untranslated content for later review.

## PHASE 3 — Complete Music Scheduling Workspace

Inspect the existing month planning and schedule pages.

Complete and verify the workflow:

Configure → Generate draft → Review → Edit → Confirm → Publish.

The interface should provide:
- Clear service-by-service monthly schedule.
- Choir assignments and category visibility.
- Explanations for selected or excluded choirs where supported by backend data.
- Minimum, maximum and target requirement status.
- Availability and eligibility warnings.
- Unmet requirements and blocking validation errors.
- Manual assignment controls where permitted.
- Draft regeneration and replacement behavior.
- Clear confirmation and publication states.
- Historical schedule visibility and change context.

Do not make a draft look published or a confirmed schedule look editable when it is not.

## PHASE 4 — Complete Protocol Scheduling Workspace

Inspect existing Protocol team and planning pages.

Complete and verify:

Receive published Music calendar → Generate teams → Review → Assign team heads → Handle absences and replacements → Publish.

The interface should support:
- Team composition for each applicable service.
- Configured team sizes.
- Monthly member duty distribution.
- Previous published-duty context where available.
- Eligibility and availability.
- Absence reasons and excused status.
- Replacements and swaps.
- Voluntary fill-ins distinguished from ordinary duties.
- Review and publication lifecycle.
- Clear validation errors and warnings.

Respect the existing authority structure and permissions. Do not expose actions to unauthorized roles.

## PHASE 5 — Integration and user acceptance

Test complete leader workflows rather than isolated screens only.

Include realistic scenarios:

1. A leader changes the Music calendar configuration.
2. A leader changes choir category membership.
3. A leader sets a minimum frequency requirement.
4. A choir is unavailable for a particular service.
5. A Music leader generates, edits, confirms and publishes a month.
6. Protocol receives the published Music calendar.
7. A Protocol coordinator generates teams.
8. A member becomes unavailable and is replaced.
9. A voluntary fill-in is recorded without counting as an ordinary monthly duty.
10. A leader reviews and publishes Protocol teams.
11. A new configuration version is activated while historical schedules remain unchanged.
12. An unauthorized user attempts to access or modify restricted actions.

Test desktop and mobile layouts, loading states, empty states, errors and permission-restricted views.

## DESIGN DIRECTION

Moriah should remain:
- Simple, modest, elegant and neat.
- Institutional and human-made, not generic corporate SaaS.
- Mobile-first.
- Clear to church leaders who are not developers.
- Consistent with existing Moriah visual tokens and localization architecture.

Avoid unnecessary wizards, Gantt charts, complicated dashboards and excessive configuration controls.

Prefer understandable questions, concise descriptions, readable status summaries and direct actions.

The configuration page and schedule workspace must be clearly distinct. Configuring rules should not be confused with managing an actual monthly schedule.

## BACKEND AND ARCHITECTURE BOUNDARIES

Do not restart backend implementation.

Only make a backend change if a concrete UI integration defect requires it. Explain the defect and keep the change minimal.

Explicitly defer:
- Tenant identifiers and scheduling ownership redesign.
- Authentication tenant-context redesign.
- Database-per-tenant versus shared-database decisions.
- Broad lifecycle transaction refactoring.
- Comprehensive concurrency redesign.
- Complex global Music selector optimization.
- The unrelated Catechist read-scope investigation.

Do not claim tenant isolation or atomicity.

## STRICT SAFETY RULES

- No database access or modification.
- No migration execution.
- No `prisma db push`.
- No seeding or historical record rewriting.
- Do not modify migrations `0060–0062`.
- No commit, push or deployment.
- Do not discard, reset, stash-overwrite or clean existing work.
- Do not increase the existing 150 KiB bundle budget.
- Do not remove features or weaken tests to pass checks.
- Avoid unnecessary dependencies and lockfile changes.

## VERIFICATION

Run:
- Relevant UI tests after each phase.
- Full frontend test suite.
- Frontend production build.
- Bundle budget.
- Server build if backend integration changes.
- Import-boundary checks.
- Translation checks.
- `git diff --check`.

Add tests for meaningful workflow behavior, not just component rendering.

If a phase cannot be completed safely, stop that phase and explain exactly why. Do not mark it complete based on partial implementation.

## DELIVERY REPORT

At completion, report:

1. What was already complete before starting.
2. What changed in each phase.
3. Which user workflows now work end to end.
4. Screens and routes completed.
5. Tests and build results.
6. Bundle size.
7. Remaining UI and integration limitations.
8. Any backend changes and why they were necessary.
9. Exact modified and untracked files.
10. Confirmation that existing work was preserved and no database, migration, commit, push or deployment operation occurred.

Do not claim all phases are complete unless each has been implemented and verified.