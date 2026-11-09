# Fixed choirs and unavailability ranges

Prepared locally for review. No deployment, commit, push, database access,
migration execution, seeding or historical schedule rewrite was performed.

## Fixed assignments

The form selects a choir and service directly. The server resolves the choir's
category rule inside the selected draft; users no longer select policy IDs.
The assignment can apply at every service occurrence, on one date, at a service
start time, or on one date and start time. A date/time narrows the existing
service calendar; it does not create another service or an intra-service
performance time. Invalid occurrence dates and mismatched start times are rejected.

Scoped designations also work with a rotation rule. Other occurrences continue
rotating. Extra normal required positions can rotate without filling a vacant
designated position automatically. Existing FIXED rules remain recurring.

An inactive, unavailable, or ineligible designated choir is omitted with a
warning. No automatic replacement fills its position. Leaders may add an
eligible replacement manually, subject to existing category, frequency and
service capacities. Available designated choirs remain required. Fixed-only
vacancies can pass confirmation and publication with warnings; ordinary empty
or otherwise invalid schedules remain protected. This is a targeted validation
change, not a lifecycle transaction redesign.

## Choir unavailability

Choose a choir, an inclusive From/To date range, and an optional reason. The
range applies to all services in that interval. Reversed and overlapping ranges
are rejected. Existing one-day and service-specific records retain their meaning
and remain removable. Existing saved schedules are not rewritten automatically.

## Persistence and migration

Migration 0064 adds optional fixed serviceDate/serviceTime and a scopeKey used
by a unique index so one choir can have distinct dated designations. It also
adds optional MusicChoirUnavailability.endDate. Legacy null end dates mean the
original single day. Existing fixed rows default to the ALL scope. Draft cloning
copies the scope. Both Prisma schema variants and the configuration loader were
updated. Review and apply the migration through the normal release process
before running this backend against an existing database. It has NOT been applied.

## Verification and limitations

- 177 backend tests passed across eight Music/Protocol suites, including new
  range boundaries, overlap rejection, fixed date/time matching, cloning,
  inactive/ineligible vacancies, manual replacements, confirmation and publishing.
- Both SQLite and PostgreSQL schemas validated without connecting to a database.
- Frontend: 321 tests passed; frontend/backend builds, bundle budget,
  translation, import-boundary and diff checks passed.
- Browser saves verified against the isolated in-memory API.
- Full backend suite was not repeated. The previously documented Catechist
  cross-system work-plan/report read failure remains unresolved.
- Global scheduling-record ownership and non-atomic lifecycle writes remain
  deferred and unchanged. No tenant-isolation or transaction-atomicity claim is made.
# Participation display follow-up

Category cards list only active, eligible services. Excluded services remain editable inside collapsed “Change other services”; stored rules are preserved. The Choir register labels its type selector “Choir category” and resolves names from matching active scheduling category codes (falling back to existing register labels when unavailable). Draft-only category renames take effect in the register after activation. This preserves the existing four register category codes; custom scheduling categories do not become new register types.

Month plan card and list assignments display choir names without category tags. Verified both views and matching register names against the in-memory preview; generated only a mock schedule. Frontend: 321 tests / 56 files passed, build, bundle, translations, boundaries and diff checks passed. No deployment or real database changes.

