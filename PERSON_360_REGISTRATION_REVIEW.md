# Full Person 360 registration and import — local review

Add person collects full name, preferred name, phone, email, date of birth, National ID, gender, address, joined-church date and status. Optional expandable Contact, Work, Education, Callings, Family, Baptism and Marriage sections collect profile records before saving. Repeatable sections support several entries; baptism and marriage allow one current record each. Conditional fields reuse the existing Person 360 definitions. An unfinished record prevents saving rather than being dropped.

Registration options are supplied by the server for the selected system. The server checks authority again when saving. Direct live unit Presidents, Vice Presidents and Secretaries may register all seven sections in their own system and the new person receives that system's membership. Existing church-wide section restrictions remain in force. No role or authentication redesign was made.

The people import screen downloads `person-360-template.csv` with 10 basic columns and up to 33 profile columns (43 total when all sections are writable). Headers are readable, such as `Work - Employer` and `Marriage - Spouse name`. Dates use YYYY-MM-DD. The page lists allowed enumeration values. The template includes only sections the viewer may write. Existing JSON section columns and record arrays continue to support multiple entries; flat columns contribute one additional record in that section. Imports preserve add-only duplicate handling and now also check National IDs, including duplicates in the same file.

Registration and import share profile cleaning, singleton validation and link restrictions. Relatives and spouses are recorded by name at registration/import; links to registered people, unit links and supporting documents are added from the saved profile using existing permissions. CSV does not contain document uploads, login credentials, office assignments, financial history or computed Person 360 activity.

The registration endpoint writes its new person, membership, profile records and audit in one transaction. Validation precedes creation. Tests use a fake Prisma client; no real-database rollback, concurrency, tenant-isolation or atomicity verification is claimed. Existing scheduling global ownership and non-atomic lifecycle writes remain deferred and unchanged by this increment.

## Validation

- Backend build passed.
- Focused backend: 82 tests in 6 files passed (`unitPerson360`, `person360`, `peopleTools`, `peopleUnits`, `people.privacy`, `codes`). Includes all seven sections on creation/import, each unit office, foreign-system denial, expired office denial, church-wide marriage restriction, malformed records, singleton duplicates and National ID duplicates.
- Frontend suite: 324 tests in 57 files passed. Template header mapping, section rights and conditional registration fields are covered.
- Frontend build, unchanged bundle budget, translation check, import boundaries and diff checks passed. Kinyarwanda and French remain disabled pending translation review.
- Browser against in-memory fixture: entered and saved all seven registration sections, opened resulting Person 360, downloaded and inspected the 43-column template, previewed and committed a synthetic import covering all seven sections.
- Full backend suite was not rerun for this increment. The previously reported unrelated Catechist cross-system work-plan/report isolation failure remains unresolved; this report is not full application acceptance.
- No real database access, migration execution, seed, commit, push or deployment. No schema migration needed for this increment.

## Files for this increment

```
server/src/person360/registration.ts
server/src/routes/people.ts
server/src/routes/peopleTools.ts
server/tests/unitPerson360.test.ts
src/api/frontDoorApi.ts
src/api/personRegistrationApi.ts
src/i18n/messages/en.ts
src/newdesign/AddPersonPage.tsx
src/newdesign/PeopleImportPage.tsx
src/newdesign/PersonRegistrationSections.tsx
src/newdesign/personRegistration.ts
src/newdesign/personRegistration.test.ts
src/newdesign/peopleImportMapping.ts
src/newdesign/peopleTools.ts
src/newdesign/peopleTools.test.ts
PERSON_360_REGISTRATION_REVIEW.md
```

These layer onto existing uncommitted changes. Review the combined manifest in `ADMINISTRATOR_COMMIT_FILES.txt` before staging. Preview HTML/fixtures, screenshots, logs and downloaded CSV are local review artifacts, not required production files.
