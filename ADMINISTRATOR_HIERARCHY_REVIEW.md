# Administrator hierarchy — local review

No deployment, database access, migration execution, account creation, or live appointments were performed.

## Roles
- ADMINISTRATOR remains the persisted code for Chief Administrator. Existing appointments keep their authority; the displayed title is now Chief Administrator.
- SYSTEM_ADMINISTRATOR is a new unit-scoped office. It is not written to the legacy systemAdmin flag.
- Chief Administrators retain church-wide appointment authority and may appoint System Administrators.
- System Administrators may appoint, end and set terms for PRESIDENT, SECRETARY and TREASURER only in the systems covered by their own live appointments. Office placement rules still apply, including the choir-specific TEAM correction.
- System Administrators cannot appoint administrators, grant themselves broader offices, manage other systems, or delegate administrator authority.
- Chief-only account/password administration remains Chief-only. No finance, scheduling or Person 360 write authority was added.
- Vacancy and appointment reads are scoped for System Administrators. The UI filters units and available actions accordingly.

## Validation
- 92 backend tests passed across accessLetters, choirOfficeEligibility, admin, capabilities and officeSplit.
- Full frontend suite: 312 passed; after adding one further dropdown regression test, the focused access suite passed 9 tests.
- Backend and frontend builds passed, bundle remained within budget, boundaries/i18n/diff checks passed.
- Browser verified Chief view with both sample choirs and System Administrator option; system view with only Grace Choir and President/Secretary/Treasurer choices.

## Outstanding
- Previous full backend run: 1108 passed, 8 skipped, 1 failed (known Catechist cross-system work-plan/report read issue); full acceptance remains blocked.
- First-Chief operator verification and opt-in seed are now prepared, with a no-op compatibility migration. See CHIEF_ADMINISTRATOR_RELEASE.md for review and deployment steps. No live role has been granted.
- The existing live choir-link audit remains incomplete because a suitable live session has not been available.
- No tenant isolation or lifecycle atomicity claim is made.

## Preview
http://127.0.0.1:5185/acceptance-scheduling.html?person=crew-0&route=%2Fs%2Fsys-choir-review%2Fpeople%2Fappointments
http://127.0.0.1:5185/acceptance-scheduling.html?person=p-outsider&route=%2Fs%2Fsys-main%2Fpeople%2Fappointments
Both use in-memory fixtures; selecting a persona starts that sample session in this browser origin.
