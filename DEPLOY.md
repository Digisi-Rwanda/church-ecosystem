# ADEPR Kacyiru — Deploy (Vercel + Render + Neon)

Local development stays on **SQLite** (`server/prisma/schema.prisma`).  
Production uses **PostgreSQL** (`server/prisma/schema.postgres.prisma`) on Neon.

After deploy you can keep working locally with `npm run dev` / `npm run dev:api` as before.

---

## Architecture

| Piece | Platform | Role |
|-------|----------|------|
| Web (Vite SPA) | **Vercel** | UI — most demos still use in-memory seed; API used when `VITE_API_URL` is set |
| API (Express) | **Render** | Auth, policy, mission/funds skeleton |
| DB | **Neon** | Postgres for the API |

Boss demo tip: leave `VITE_API_FALLBACK` unset (default on) so seed logins like `music` / `youth` still work even if the API only seeds `pastor` / `treasurer`.

---

## 1. Neon (database)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **connection string** (use the pooled URL if Neon shows one, often with `?sslmode=require`).
3. Keep it for Render `DATABASE_URL`.

Example shape:

```text
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

---

## 2. Render (API)

### Option A — Blueprint

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** → select the repo.
3. **Blueprint path:** `render.yaml` (repo **root** — not `backend/render.yaml`).
4. Set env vars (Blueprint marks these as sync:false):
   - `DATABASE_URL` = Neon connection string
   - `CORS_ORIGIN` = your Vercel URL(s), e.g. `https://kacyiru.vercel.app`  
     (comma-separated if you have preview + production)
5. Deploy. Note the API URL, e.g. `https://kacyiru-api.onrender.com`.

### Option B — Manual Web Service

- **Root directory:** `server`
- **Build:** `npm install && npm run build:render`
- **Start:** `npm run start:render`
- **Health:** `/api/health`
- Env: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV=production`

`start:render` runs `db push` + seed (upsert-friendly) then starts the server.

Check: `GET https://YOUR-API.onrender.com/api/health`

---

## 3. Vercel (Web)

1. Import the same GitHub repo in [vercel.com](https://vercel.com).
2. Framework: Vite (or leave auto).
3. **Root:** repository root (not `server/`).
4. Build: `npm run build` · Output: `dist` (`vercel.json` already set).
5. Environment variables:

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com` (no trailing slash) |
| `VITE_API_FALLBACK` | leave empty / `true` for demo seed logins |

6. Deploy. Copy the Vercel URL.
7. Go back to Render and set `CORS_ORIGIN` to that Vercel URL, then **redeploy API**.

---

## 4. Smoke test

1. Open the Vercel link → login `pastor` / `pastor123` (API) or `music` / `music123` (seed fallback).
2. Open Music → Schedule and click through calendar / generate.
3. API login:  
   `POST https://YOUR-API.onrender.com/api/auth/login`  
   `{"username":"pastor","password":"pastor123"}`

---

## Local vs production (do not mix)

| | Local | Production |
|--|--------|------------|
| DB | SQLite `file:./dev.db` | Neon Postgres |
| Schema file | `prisma/schema.prisma` | `prisma/schema.postgres.prisma` |
| SPA API | `.env.local` → `http://localhost:4000` | Vercel env → Render URL |
| Commands | `npm run setup` in `server/` | Render `build:render` / `start:render` |

After deploying, continue local work:

```bash
# root
npm run dev

# other terminal
npm run dev:api
```

Do **not** point local `.env` at Neon unless you intend to. Keep `DATABASE_URL="file:./dev.db"` in `server/.env`.

---

## Env cheat sheet

**Render**

```env
DATABASE_URL=postgresql://...@.../neondb?sslmode=require
JWT_SECRET=<long random>
CORS_ORIGIN=https://your-app.vercel.app
NODE_ENV=production
```

**Vercel**

```env
VITE_API_URL=https://kacyiru-api.onrender.com
# VITE_API_FALLBACK=true
```

**Local server** (`server/.env`) — unchanged

```env
PORT=4000
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev-only-change-me-in-production"
CORS_ORIGIN="http://localhost:5173"
```


## Real launch settings (Protocol and Music)

The demo setup (seed logins, demo roster) is for showing the app. For real use:

| Where | Setting | Value |
| --- | --- | --- |
| Web (Vercel) | `VITE_API_FALLBACK` | `false`, so nobody can sign in with the demo passwords bundled in the app |
| Web (Vercel) | `VITE_DEMO_SEED` | `false`, so the Protocol roster starts empty and is built from the church directory |
| API (Render) | `SEED_DEMO_ACCOUNTS` | unset, so the demo role accounts are not created |
| API (Render) | `SCHEDULE_GUARD` | `warn` while setting up, then `enforce` once the real office holders are recorded as Positions |
| API (Render) | `SCHEDULE_READ_FILTER` | `on` for a real launch, where everyone has their own account (default off, so the demo role logins keep sharing everything). Unpublished Music drafts and other people's notifications/contributions are then not sent to the browser. |

Who is Protocol Coordinator, President, Vice President, Secretary or Treasurer is read from the server's
Positions (system `sys-protocol`, field `protocolOffice`) through `GET /api/protocol/offices`, so create those
positions on the server for the real people first. The Coordinator then adds roster members from the church
directory on the Protocol "Members" page.

## Importing the Protocol team

Prepare a CSV with the columns `Full name, Phone number, Email, Office, Choir`
(see `docs/protocol-import-sample.csv`). Office is President, Vice President,
Coordinator, Secretary, Treasurer or Member (empty means Member). Choir is the
choir name or `none`. Choir names are not listed in the code: they are matched
against the choirs already in the data (Music's choir lineup and the server's
choir units), by name ignoring capitals and accents, or by a start of the name
that is unique. Any number of choirs works, and renamed choirs just match their
new name.

```
cd server
npx tsx scripts/import-protocol.ts team.csv            # dry run: lists what would happen and any problems
npx tsx scripts/import-protocol.ts team.csv --apply    # imports
```

A choir name found nowhere is reported together with the list of known choirs;
add `--create-choirs` to create it (a choir unit on the server and an entry on
Music's list). A choir that exists on the server but not yet on Music's list is
added to Music's list automatically.

It creates each person (matching by email, then phone, then name, so running it
again does not duplicate), a church and Protocol membership, a choir membership
where the choir exists on the server, the office position for the five office
holders, and the Protocol roster with each member's choir. Rows with a problem
are listed with their line number and skipped; warnings (unknown choir, bad
phone) import the person without that detail. An office already held on the
server is never taken over silently. The columns are defined in
`server/src/lib/importProtocol.ts`, so one can be added or dropped later.

---

## Staging: rehearse with real (or close to real) data

Run a second, separate copy (own Neon database, own Render service, own Vercel
project) so nothing here touches the live church data. When the rehearsal is
good, the same steps become the real launch.

### 1. Settings

**Render (API)** — set these by hand in the Render dashboard (they are deliberately not in `render.yaml`), in addition to `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` (already in `render.yaml`) |
| `BOOTSTRAP_PASTOR_PASSWORD` | a password you choose, 10+ characters. Creates the `pastor` sign-in (church leader; can manage Music and everything else). Without it no `pastor` sign-in is made |
| `BOOTSTRAP_TREASURER_PASSWORD` | same, for the `treasurer` sign-in. Optional |
| `SCHEDULE_GUARD` | `warn` at first, `enforce` for the second half of the rehearsal |
| `SCHEDULE_READ_FILTER` | `on` (it is off by default so the demo logins keep sharing everything) |
| `SEED_DEFAULT_CHOIRS` | leave unset. The built-in demo choirs are then not created; your choirs come from the import |

Never set `SEED_DEMO_ACCOUNTS` here.

**Vercel (web)**

| Name | Value |
| --- | --- |
| `VITE_API_URL` | the Render URL |
| `VITE_API_FALLBACK` | `false` |
| `VITE_DEMO_SEED` | `false` (no demo roster, no demo choirs: everything comes from the server) |

### 2. Load the people

On your own computer, with the Neon **staging** connection string (never the
live one by accident):

```powershell
cd server
npm run db:generate:pg
$env:DATABASE_URL = "postgresql://...staging...?sslmode=require"
npx tsx scripts/import-protocol.ts team.csv --create-choirs                      # dry run: read the report
npx tsx scripts/import-protocol.ts team.csv --create-choirs --apply --accounts   # import + sign-ins
```

(macOS/Linux: `DATABASE_URL="..." npx tsx scripts/...`.) Afterwards run
`npx prisma generate` to point your local tools back at SQLite.

`--accounts` writes `protocol-accounts-<date>.csv` with each person's username
and a temporary password. Give them out privately and delete the file; the
passwords are stored only as hashes. People change their own password with
`POST /api/auth/change-password` (a screen for it is still to do).

### 3. Run it as if you had started

Use real sign-ins for the real roles. Use `pastor` for the Music steps unless
you have added a Music director position.

1. **Music** builds a quarter, confirms it. The **Coordinator** has an inbox alert, and the month shows on the Music schedule page.
2. **Coordinator**: Availability — put someone on leave, make someone Tuesday-only, pick particular services for another. Build the months (all at once). Check the Teams page: no one is placed against their settings, every team has a Team Leader and Vice Leader.
3. **Second browser, a Protocol member**: they see the same plan, see only their own inbox and contributions, and their own duties on My schedule.
4. **Coordinator** submits for review. **President** reviews. Try to publish: it is refused until Music releases the month. Release it in Music, then publish.
5. **Music** edits the released month (swap a choir). The Coordinator gets an alert saying what changed; the Music schedule page lists it; the Protocol month is flagged until reviewed.
6. Set `SCHEDULE_GUARD=enforce` and repeat the Protocol steps as a plain member: building, reviewing and publishing must be refused.
7. Two people edit at once (two browsers, different parts): both changes survive.

Write down anything that surprises you, with the page and the person. Fix, then
repeat on fresh data (a new Neon branch makes this quick).

---

## Two environments: staging and production

| | Staging | Production |
| --- | --- | --- |
| Git branch | `staging` | `main` (protected; changes arrive by pull request from `staging`) |
| Who uses it | leaders testing, developers | the congregation |
| Neon database | the existing one (test data is fine) | a **new, separate** project, never shared with staging |
| Render service | the existing `kacyiru-api`, branch set to `staging` | new `kacyiru-api-prod` from `render.prod.yaml`, paid plan (always on) |
| Vercel project | the existing one, production branch set to `staging` | new project from the same repo, production branch `main` |
| `VITE_API_URL` | the staging Render URL | the production Render URL |
| `CORS_ORIGIN` | the staging Vercel URL | the production site URL |
| `JWT_SECRET` | its own | its own, different |
| Demo accounts / fallback | may be on while rehearsing | off: no `SEED_DEMO_ACCOUNTS`, `VITE_API_FALLBACK=false`, `VITE_DEMO_SEED=false` |
| Real roster | optional rehearsal copy | imported at launch only |

### Moving the existing deployment to staging (one time)

1. Create the branch from the current `main` and push it: `git checkout main`, `git pull`, `git checkout -b staging`, `git push -u origin staging`.
2. Render, existing service, Settings, Build & Deploy, Branch: `staging`, Save. It redeploys with the same URL, database and settings.
3. Vercel, existing project, Settings, Git, Production Branch: `staging`, Save, then redeploy the latest `staging` deployment.
4. Check the staging site still signs in and the sync badge is green. Nothing else changes for the people testing.

### Creating production

1. Neon: new project. Copy its connection string.
2. Render: New, Blueprint, same repo, Blueprint path `render.prod.yaml`. Fill in `DATABASE_URL`, `CORS_ORIGIN` (you can set it after Vercel gives the URL), and the two `BOOTSTRAP_*` passwords.
3. Vercel: Add New Project, same repo, Production Branch `main`, environment variables `VITE_API_URL` (the production Render URL), `VITE_API_FALLBACK=false`, `VITE_DEMO_SEED=false`.
4. Back on Render, set `CORS_ORIGIN` to the production Vercel URL (with `https://`), and redeploy.
5. Check: `https://PROD-API/api/health` answers, you can sign in as `pastor`, and the sync badge (if shown) is green.

### Everyday flow

Work on a feature branch, merge into `staging`, let the leaders test on the staging site, then open a pull request from `staging` to `main`. CI must be green. Merging deploys production. If something is wrong, redeploy the previous deployment in Render and Vercel (or reset `main` to the `live-before-protocol` tag for the very first rollback).
