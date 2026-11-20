# Existing staging deployment update — preflight

Target confirmed by the user: existing STAGING deployment, not production. Date: 2026-11-01.

Verified source:
- Local branch: staging.
- Commit: 0d253a7cd4f219f29c66822bce8f0e4fb836c57b — feat(music): integrate choir register with scheduling workflows.
- A live git ls-remote check confirms origin refs/heads/staging points to that exact commit.
- Tracked working tree is clean. Existing untracked preview, report and diagnostic files were preserved and must not be uploaded as app source.
- No extra commit or push is needed for the already-pushed implementation.

Existing deployment design from repository configuration:
- Vercel hosts the frontend. Update the existing staging project/branch deployment and retain its current staging URL.
- Render hosts the API. Update the existing staging service from the same commit, retaining its existing database connection and runtime secrets.
- Do not create another app or database and do not promote to production.

Safety condition before triggering any API redeploy:
- server/package.json defines start:render as npm run migrate:pg && npm run db:seed:pg && npm start.
- The actual staging service settings have not yet been inspected. Do not assume the repository default is the live setting.
- The task retains its no-migration/no-seeding boundary. Verify actual cloud build/start/pre-deploy commands first; a code-only API restart must use npm start (node dist/index.js), without migration, db push, seed or reset commands.
- This feature commit contains no Prisma schema/migration changes. Existing schema compatibility must be established from deployment history/settings/logs without accessing or modifying the database.

Existing local validation:
- 307 frontend tests passed; 99 focused backend tests passed.
- Frontend/server builds, bundle (149.06 KiB against 150 KiB), boundaries, translation and diff checks passed.
- Full backend: 1098 passed, 1 known unrelated Catechist read-scope failure, 8 skipped benchmarks. This remains a known blocker; no clean full acceptance is claimed.

Current access blocker:
- GitHub CLI is not signed in; Git SSH read access works.
- Vercel dashboard opens at its login page; Render dashboard also opens at its login page.
- Both tabs are left open for the user to sign in. No passwords/tokens are requested in chat.
- After sign-in, inspect the exact existing staging project/service and deployment commit. If already current, verify it instead of redeploying redundantly. Otherwise update the existing staging deployments under the safety condition above.

No deployment, database access, migration, seeding, new commit or push was performed during this preflight.

## Deployment logs supplied by the user

The supplied Vercel build completed successfully but explicitly cloned staging at 2de304e. That commit precedes both 1d169f8 (remaining scheduling UI) and 0d253a7 (Choir register synchronization). The source update must select staging/latest 0d253a7, rather than simply redeploying the old 2de304e deployment.

The supplied Render log confirms startup on port 10000 and a live service at https://kacyiru-api.onrender.com, with CORS for https://church-ecosystem-eight.vercel.app. It does not identify the Render commit. It also confirms migration checking and seeding executed; no pending migrations were reported. This log is not proof that the seed was data-neutral. No database operation was performed by this agent.

Both dashboard tabs were checked again and still show sign-in pages. Deployment execution remains blocked on authenticated dashboard access. Prepared update: Vercel existing staging project → Deployments → Create Deployment from staging; Render existing staging service → verify staging branch and code-only npm start startup (no migration/seed pre-deploy command) → Manual Deploy → Deploy latest commit. Verify both source commits match 0d253a7 before claiming the feature is deployed. Production remains out of scope.

## Current live code verification (supersedes the earlier old-log inference)

On 2026-11-01, direct reads of public static files at https://church-ecosystem-eight.vercel.app verified newer code than the supplied 2de304e build log:
- Current entry: /assets/index-BgHQysTX.js (the old log used index-Bj8RrlLS.js).
- frontDoorApi-inLu5NZW.js and useChoirRegister-BYaV42rg.js include the moriah:choir-register-changed synchronization signal.
- ChoirsPage-13vMbU-b.js includes the Setup link with tab=links&draft=1.
- MonthPlanPage-BcNJWNgC.js does not include the removed door.scheduling.requirementCount display.
- The served API origin is https://kacyiru-api.onrender.com.
- The API recognizes POST /api/scheduling/config/versions/deployment-check/archive and returns 401 Missing Bearer token; an unknown control route returns 404. No authorization header was sent, so requireAuth rejects the new route before database access. No record identifier or valid credentials were used.

Conclusion: the current live frontend contains the requested sync and simplified Month plan changes, and the backend exposes the new draft-version route. The earlier supplied Vercel build log is historical evidence, not the currently served frontend. A further redeploy is not justified by that old log alone. The exact live backend Git SHA and authenticated business workflows remain unverified.

A pre-existing browser tab may retain the old loaded JavaScript until refreshed. Use a hard reload or a private window on the primary app URL. Membership changes are deliberately prepared in drafts; select/review a draft and activate it to use new category memberships. Existing active/historical memberships are preserved.

No deployment was triggered by the agent. Verification used only public static files and unauthenticated route-recognition probes; no database commands, migration or seed operations, or authenticated business-data requests were performed.
