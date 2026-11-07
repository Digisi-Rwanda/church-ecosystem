# Unit Person 360 review

President, Vice President and Secretary can register, update and import people
in systems where they hold a direct live unit office. They can record all seven
Person 360 sections for those systems' live members/office holders: contact,
employment, education, callings, family, baptism and marriage. Parent-system
reach and delegated letters do not grant these profile rights. Ending the office
or the target's membership removes access on the next request. Holding a valid
church-wide office retains its existing section permissions separately.

Direct record-history, record mutation, document download and document removal
URLs are subject to the same membership check. Unit profile access does not grant
church-wide financial participation or baptism-cohort administration. Baptism can
be recorded individually or imported. Existing archived-person protection applies.
No new database columns or migration are needed for these application permissions.

## Where to use it

Sign in as the unit officer, open that unit system, then People. Add registers a
person with automatic membership in that system. Open their Person 360 profile
to record sections and files. Import opens CSV preview; the server rechecks
authority when Add commits. Existing people are not overwritten or transferred
by import. Possible cross-unit duplicates receive a generic review message;
Central Administration must resolve them.

## Full-profile CSV

The existing basic columns remain: fullName, phone, email, dateOfBirth, gender,
status, joinedChurchOn, address. Optional section columns are CONTACT, EMPLOYMENT,
EDUCATION, CALLING, FAMILY, BAPTISM, MARRIAGE. Each cell contains a JSON object or
array of section objects. CSV quoting doubles embedded quotation marks:

```csv
fullName,BAPTISM,MARRIAGE
Example Person,"{""date"":""2020-05-03"",""place"":""Kacyiru""}","{""date"":""2021-06-12"",""spouseName"":""Example Spouse""}"
```

All supplied sections are validated in preview. A bad section rejects the whole
row; baptism and marriage accept at most one record each. Use names for spouse
and family during CSV import; linked person IDs and calling unit IDs must be
added individually through the scoped record endpoint. Each valid imported row
creates its person, membership and profile records in one transaction. Existing
general import remains add-only, with partial success across separate rows.

Profiles remain shared person records: an officer may update a person who is a
live member of their own system even if that person also belongs to another
system. Updates are visible wherever that shared profile is authorized. This is
not separate copies per unit and makes no tenant-isolation claim.

No deployment, database access, migration execution, seed or live appointment
has been performed. ADMINISTRATOR_COMMIT_FILES.txt includes this change and the
previous administrator hierarchy. Review the staged diff before committing.

## Verification (2026-11-02)

- Backend build passed; 165 tests passed across 10 focused backend suites.
- Frontend build passed; full frontend suite: 318 tests across 56 files passed.
- Import-boundary, translation and diff checks passed. Bundle: 149 kB compressed
  against the existing 150 kB budget.
- Tests exercise all seven sections for each office, unrelated people, direct
  history/file/mutation URLs, mixed church/unit roles, ended appointments,
  ended membership, import authorization on commit, invalid rows and duplicate
  detail suppression. CSV mapping preserves quoted baptism/marriage JSON.
- Full backend suite was not repeated for this increment. The previously
  documented Catechist cross-system work-plan/report isolation failure remains
  unresolved. No live verification or full acceptance claim is made.
