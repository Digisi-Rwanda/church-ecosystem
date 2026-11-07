# Clean-up audit before Phase 5

Date: 11 October 2026. Read-only: nothing has been deleted or changed. Numbers come from an import-graph scan of `src/` (starting from `main.tsx`), a knip scan, the i18n checker and a search of which server routes the front end calls.

## 1. Summary

| Finding | Size | Risk to remove |
| --- | --- | --- |
| **Old app (`LegacyApp`) and everything only it uses** | 104 files, **31,959 of 78,661 lines (41%)** | Medium: it still opens for old addresses |
| Dead files (nothing imports them) | 4 files, 105 lines | None |
| Pages orphaned by this week's changes | 3 files, 297 lines | None |
| Unused English texts | 174 of 2,937 keys | None |
| Unused exports | about 100 values and 96 types | Low |
| Tests that only cover old-app code | 5 files, 304 lines (more are partly old-app) | Goes with the old app |
| Server routes no screen calls | about 6 routers, 4,250+ lines of mission code | Medium: check live traffic first |
| First-seed units kept in seeds | `ou-church`, `ou-leadership`, `ou-admin`, `ou-worship`, `ou-finance` | Low, but foreign keys |

## 2. The old app

`App.tsx` loads `NewApp` for sign-in, Portal and `/s/...`. Everything else (`/people`, `/programs`, `/events`, `/projects`, `/tasks`, `/systems/*`, `/sso/handoff`, any unknown address) opens `LegacyApp`. Setting `VITE_NEW_DESIGN=false` also brings it back.

Largest parts, all reachable only through `LegacyApp`:

- `src/pages/ministry` (24 files, 8,930 lines), `PersonFormPage` (1,802), `EventDetailPage` (1,218), `ProgramDetailPage` (1,209), `ParticipationPage` (1,104), `ProjectDetailPage` (877), `PersonProfilePage` (771), `DashboardPage` (547) and about 20 more pages.
- `services/missionWrite.ts` (1,246), `components/MissionCreateDrawer.tsx` (933), `CommandPalette` (516), `SystemLauncher` (498), `DeliveryPanel` (372), `auth/AuthContext.tsx` (340).
- Domain and data helpers used by nothing else: `ministryNavAccess`, `oversightAccess`, `eventOps`, `missionHealth`, `registerLocalDomain`, `scheduleServerSync`, `mergeDoc`, `photo`, `carousel`.

The new Work, People, Money, Schedule and Ministry screens replace all of these. Before removing, confirm no bookmark, email link or notification still points to an old address (the `/sso/handoff` route in particular) and send those addresses to `/portal`.

## 3. Safe now (no behaviour change)

1. Delete 4 dead files: `newdesign/ScheduleServiceCard.tsx`, `newdesign/DoorMenu.tsx`, `newdesign/DoorBrand.tsx`, `data/demoRosterBuild.ts`.
2. Delete pages orphaned this week: `OversightPage.tsx`, `LettersPage.tsx`, `LetterPage.tsx`, their entries in `pages.ts`, and the letter functions in `frontDoorApi.ts` that nothing calls.
3. Delete plan-stage helpers no screen uses any more (`stagesOf`, `phaseOf`, `stepIndex`, `StageView` in `plans.ts`) and their tests.
4. Delete the 174 unused texts (49 under `door.plan`, 41 `door.protocol`, 31 `door.music`, 12 `door.money`, others). The list is in the i18n checker output.
5. Remove unused exports (mostly the 50-function barrel in `src/api/index.ts` and `missionApi.ts`, which only the old app used).

## 4. Needs a decision

- **Old app removal (about 32,000 lines).** Replace `LegacyApp` with a redirect to `/portal`, remove the `VITE_NEW_DESIGN` switch, then delete the 104 files and their tests. Expect a smaller bundle and faster builds. Risk: an address you still use.
- **Server mission code.** `routes/mission.ts` (543 lines) with `src/mission/*` (about 3,700 lines, `registerExtended.ts` alone 1,875) and the `assignments`, `systems`, `sso`, `digest` and `attention` routers have no caller in the new front end. Check Render's request logs for one week, then remove the routes. **Database tables stay** (the rule that server changes are add-only).
- **Seeds.** `seed.ts` and `demoRoster.json` still create the five retired units. Safe fix: stop creating them on fresh databases and move positions that point at them to Central Administration. Existing databases keep them hidden as they are now.

## 5. Not measured

- **CSS:** `app.css` is 7,959 lines and includes old-app styles. Measure after the old app is gone.
- **Server tests:** about 67 test files; those for removed routers go with them.
- **Scripts:** knip flags `public/sw.js` and several `scripts/*` as unused; `sw.js` is in fact registered in `main.tsx`, so confirm each script against `package.json` before removing.

## 6. Proposed order

1. Section 3 now, one commit, with the full check run. About 1,000 lines plus 174 texts.
2. Redirect old addresses to `/portal`, then remove the old app in a second commit.
3. Remove server routes after the log check.
4. Seeds and retired units last.

Phase 5 is not defined in the repository, so this list does not depend on it. Tell me what it needs and I will mark which of these items block it.
