# Database migrations (replacing `prisma db push`)

Why: `db push` changes the live database on every start with no history and no way back. Migrations are numbered SQL files in Git that run once, in order.

The cloud workspace cannot download Prisma's engines, so the baseline must be created **on your computer** (Windows). Do it once, on branch `staging`, after the slice-1 changes are pushed.

## A. Create the baseline file (once)

```
cd C:\Users\ihimb\Music\kacyiru\server
npm install
mkdir prisma\migrations\0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script --output prisma/migrations/0_init/migration.sql
```

Also create `server\prisma\migrations\migration_lock.toml` containing exactly:

```
provider = "postgresql"
```

Open `0_init\migration.sql`: it should start with `-- CreateTable` and include `"Person"` with `"nationalId"`.

## B. Tell the existing staging database "this is already applied" (once per existing database)

The staging Neon database already has these tables, so it must not run `0_init` again.
Use the staging **direct** connection string from Neon (Dashboard → Connection details):

```
set DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
npx prisma migrate resolve --applied 0_init --schema=prisma/schema.postgres.prisma
```

Expected: `Migration 0_init marked as applied.`

## C. Switch the start command

In `server/package.json` replace `db:push:pg` inside `start:render` with a migrate step:

```
"db:migrate:pg": "prisma migrate deploy --schema=prisma/schema.postgres.prisma",
"start:render": "npm run db:migrate:pg && npm run db:seed:pg && npm start",
```

Commit and push to `staging`. Render's log should say `No pending migrations to apply.`

## D. Every future schema change

1. Edit `schema.postgres.prisma` (and `schema.prisma` for local SQLite).
2. `npx prisma migrate dev --name what_changed --schema=prisma/schema.postgres.prisma` against a **local/throwaway** Postgres, never against staging or production.
3. Commit the new folder under `prisma/migrations/`. Render applies it on the next deploy.

## E. New production database

Nothing to resolve: the empty database runs `0_init` and everything after it by itself.
