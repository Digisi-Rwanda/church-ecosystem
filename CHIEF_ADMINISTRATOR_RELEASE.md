# Chief Administrator release for operator review

No deployment, push, migration execution, or live role assignment was performed.

The release now also includes scoped unit Person 360 recording/import for
President, Vice President and Secretary, including baptism and marriage. See
UNIT_PERSON_360_REVIEW.md. ADMINISTRATOR_COMMIT_FILES.txt is the exact combined
review list; staging that list excludes local preview/cache artifacts. It also
includes the scheduling form clarity updates requested during review.

## Compatibility and authority

`ADMINISTRATOR` remains the persisted Chief Administrator office. Existing holders
retain their access. `SYSTEM_ADMINISTRATOR` is scoped to its appointed system and
may manage President, Secretary and Treasurer appointments there. Chief holders
can manage these appointments and System Administrators church-wide. Account and
password administration remains Chief-only. The legacy `systemAdmin` boolean is
never set for System Administrators.

Migration `0063_administrator_hierarchy` is deliberately a no-op compatibility
marker: `Position.office` is already text. No column, enum, identity, historical
appointment or scheduling record needs conversion. Review it with the code;
do not replace existing migration files.

## Verify the initial identity

From `server`, against the intended deployment environment, the operator runs:

```sh
npm run chief:verify -- --username EXISTING_USERNAME
```

This defaults to a read-only transaction and prints the exact username, person
ID and full name. Verify all three before enabling the seed. Samuel Habimana's
live username has NOT been verified here; no guessed username or demo person ID
is embedded in code. The script requires an existing active, unarchived person,
existing account and valid Media system/unit link. It creates neither passwords
nor people. Do not run the broad demo seed to create this appointment.

## Opt-in deployment seed

After reviewing the identity, configure these environment variables in Render:

```text
SEED_FIRST_CHIEF_ADMINISTRATOR=true
FIRST_CHIEF_ADMINISTRATOR_USERNAME=<verified existing username>
FIRST_CHIEF_ADMINISTRATOR_PERSON_ID=<verified exact person ID>
```

The dedicated seed command is `npm run db:seed:chief`. It skips without the
explicit opt-in, before importing Prisma. When enabled it atomically creates the
initial appointment and audit event and preserves the account password. A repeat
for the same verified live holder writes nothing; an existing other/historical
Chief or identity mismatch fails rather than escalating another account.

For a migration-and-seed deployment workflow, the operator can configure the
Render start command (service root `server`) as:

```sh
npm run migrate:pg && npm run db:seed:chief && npm start
```

Review ALL pending migrations before allowing auto-deploy. This command runs
migrations when Render starts; none have been run as part of this task. It
replaces the existing `start:render` command's broad `db:seed:pg` invocation;
the source startup default has deliberately not been changed. Keep the existing
`build:render` build command. Disable the first-Chief opt-in after success.
Publish the matching frontend changes through the existing Vercel Git workflow.

## Demo-to-real transition

All authorization uses appointments linked to people, never Samuel's name or
demo IDs. Before retiring a demo Chief, register the real person, arrange their
sign-in, appoint them Chief through the normal Chief appointment screen, and
verify their access. Existing minimum-holder and self-removal rules still apply.
The bootstrap seed is not an account replacement or recovery tool. Disable its
opt-in before retiring or deleting the designated demo identity.

## Known limits

Previous full backend verification: 1108 passed, 8 skipped, 1 failed, before
these seed changes. The failure is the previously identified Catechist
cross-system work-plan/report read isolation issue. It is not fixed by this role
release. Global scheduling-record ownership and non-atomic scheduling lifecycle
writes remain deferred. No tenant isolation or full acceptance claim is made.
Live choir-link audit and live account/role verification are still pending.
