# Scheduling configuration flow: analysis and audit

Scope: the Music and Protocol scheduling configuration (versions, services, categories, choir links, rules, fixed designations, availability, Protocol rules and duty policy), how it is activated, how the Music and Protocol engines consume it, and how the schedule bulletin reads the result. Read-only audit of the repo as it is on your PC today. Nothing was changed.

Files read: `server/src/scheduling/{types,rules,store,configLoader,configRouter,musicConfigRules,choirRegisterSync}.ts`, `server/src/music/{configuredEngine,engine}.ts`, `server/src/protocol/engine.ts`, `server/src/routes/{musicSchedule,protocol}.ts`, `server/prisma/schema.prisma` (constraints), `src/newdesign/{DoorSchedulingConfigPage,SchedulingConfigEditors,MusicSetupReview,MusicParticipationEditor,schedulingForms,config,bulletins,Bulletins,MonthPlanPage}`, `src/i18n/messages/en.ts`.
Not run: the server test suite (the Prisma client cannot be generated in my environment), so every finding below is from reading code, not from a failing test. Each one is cheap to confirm with a test.

## 1. The flow as built

1. A writer opens Scheduling configuration. Music shows a 4-step setup (Services, Choirs, Rules, Review) plus a Versions tab. Protocol shows Rules, Duty policy and Versions.
2. Editing always happens in a DRAFT version. "Edit" reuses the first existing draft, or clones the active version (copying services, categories, rules, links, fixed designations, Protocol rules and duty policy with remapped ids). With no active version it creates an empty draft with a client-chosen number.
3. Every write checks: SCHEDULING W letter in the system, target version is a DRAFT, the row belongs to that draft, references exist in the same draft, and duplicates (unique constraints). Each change is audited.
4. Activation: Music runs `validateMusicConfigSnapshot`; Protocol runs no validation. Activation supersedes the previous ACTIVE row in one transaction.
5. Generation pins the draft or month to the active version (`configVersionId`). Later edits and confirm/publish load the pinned version, so a published schedule is reproducible against its rules.
6. Protocol plans pin both a Protocol version and the Music version they were built on, and flag staleness when Music changes.

The design is sound: versioned, snapshot-pinned, tenant-gated, audited, and drafts cannot be mutated once active. The problems are in the gaps between the stages.

## 2. Findings, most serious first

### A. Activation can pass, then every generation fails (high)

The validator checks what exists, but the engine requires things that may not exist.

- **Every active choir must have exactly one category link.** `configuredEngine.ts:204-210` fails generation for the whole month if any active choir has no link. `validateMusicConfigSnapshot` never checks choir coverage. `choirRegisterSync.ts:19` also skips a choir silently when no category matches its role, so a new choir can sit unlinked without any message.
- **Every active category needs an active rule for every music-required service.** `configuredEngine.ts:232-236` fails generation otherwise. The validator only checks rules that exist.
- **Service calendar fields are never validated at activation.** `engine.ts:208` throws for a WEEKLY service with no weekday, and `engine.ts:182` throws for CUSTOM with no dates. The editor offers "Any" as a weekday and the API accepts a null weekday (`ServiceSchema`). The error appears only at generate time as a 422.
- **Two shapes fail silently, producing no slots and no error.** SELECTED_DATES with no dates, and MONTHLY with no weekday and no dates (`engine.ts:185-202`). A service can vanish from the calendar without a message.
- **Service codes are case-sensitive in the database but case-insensitive in the engine.** `SS1` and `ss1` can both be saved (unique key is case-sensitive; the draft duplicate check is exact-case). `engine.ts:170-172` then throws "duplicated" at generation.
- **Selected dates are free text.** `selectedDates: z.array(z.string())`; the engine only checks the `YYYY-MM-` prefix, so `2026-10-99` passes everywhere.

Effect: a leader goes through Review, presses Activate, gets "Existing schedules will not be rebuilt", and finds out at the next generate that nothing can be built. Fix direction: one shared `validateForGeneration(snapshot)` used by activation, by a new "check this draft" endpoint, and by the Review step.

### B. The Review step does not review (high)

`MusicSetupReview.tsx:21-22` treats "ready" as "the lists finished loading". It prints the data and never calls validation. Activation errors come back as one string joined with " · " (`schedulingForms.ts:6`) and are shown once, after the dialog closes. There is no dry-run, no list of blockers with "fix this" links, and `activateBody` is generic (`en.ts:2299`). Protocol has no review at all and activates after a generic confirm.

### C. Stale drafts silently overwrite newer rules (high)

`activateConfigVersion` (`store.ts:194-213`) never compares the draft's `previousVersionId` with the current active version. Draft v5 cloned from v3 can be activated after v4 went live, and v4's changes are dropped without notice. The "retire service" route is one way this arises: it clones, retires and activates a new version immediately (`configRouter.ts:520-543`), so any other open draft is now based on an old version. `serviceWorkingDraft` (`DoorSchedulingConfigPage.tsx:48-52`) picks the first DRAFT it finds regardless of who made it or what it was based on. Nothing locks a draft or detects two writers (last write wins). Fix direction: reject or warn at activation when the base is not the current active; show "based on v3, active is v4".

### D. "Retire service" bypasses the safety path (high)

`configRouter.ts:520-543` creates and activates a version in one call with no `validateMusicVersion`, no confirmation of impact, and no check of Protocol rules. Protocol rules that referenced the service keep the old id; `configLoader.ts:140-145` then falls back to the stale id, so the rule is silently orphaned. The Protocol side only notices at plan time (`missingProtocolRules`).

### E. The fixed-choir check ignores capitalization the rest of the system honours (medium, real bug)

`configRouter.ts:831-832` reads `eligibilityOverride[service.code]` with an exact key. Everywhere else (`musicConfigRules.ts:56-59`, `configuredEngine.ts:177`, the link validator) the lookup is case-insensitive. An exception saved as `ss1` is respected by the engine but ignored when designating a fixed choir, so the API can wrongly allow or refuse a designation.

### F. "Configurable" is only partly true (medium)

- Protocol only understands four hard-coded kinds, `['SS1','SS2','TUESDAY','IGABURO']` (`protocol/engine.ts:599`); the route keeps its own `KINDS`. Rules for any other service, including FRIDAY, are saved and ignored. The route does report `unsupportedServices`, which is good, but the setup screen never warns while configuring.
- The "relaxable kinds" checkboxes are the same fixed list (`SchedulingConfigEditors.tsx:619`). `preserveRelaxableKinds` (`schedulingForms.ts:30`) strips only those four from the saved list, so a saved FRIDAY entry can never be removed from the UI.
- Worship behaviour is tied to a category with the code `WORSHIP` (`protocol/engine.ts:87`), and the register sync is tied to four category codes (`choirRegisterSync.ts:5`). Renaming or replacing a category changes behaviour with no warning.
- The generic calendar builder special-cases the code `IGABURO` (`engine.ts:188`).
- `targetTeamSize` is a database column that nothing can set and nothing reads, yet the Protocol Services tab shows it as the team size (`SchedulingConfigEditors.tsx:305`), so it always says 10 regardless of the real Protocol rule. Protocol's `defaultTeamSize: 10` constant in `buildRulesFromConfig` is similarly unused by the rule value.
- `affectedSchedules` and `validation` on a version are never populated; status `SCHEDULED` exists but nothing can create it; `exceptionsAllowed` on the duty policy is never read.

### G. Unsaved-changes protection has holes (medium)

- `onChangeCapture` marks the page dirty on any change event, including controls that do not edit data (`DoorSchedulingConfigPage.tsx:244`).
- The Activate button does not check the dirty flag (`:280`), so unsaved edits are neither activated nor warned about.
- Only tab and version switches are guarded: no `beforeunload`, no router blocker, so browser Back, the workspace link and refresh discard edits silently.

### H. Availability sits outside the versioned model (medium)

Choir unavailability is live and unversioned (`configLoader.ts:77`). It is applied to pinned drafts and to re-validation of old schedules, which weakens the "reproducible against its version" guarantee. It appears inside the draft flow but is not in Review, is editable while viewing the active version, and the UI cannot set the per-service option the API supports. The audit message for a range reads "for undefined" because it logs `b.serviceDate` (`configRouter.ts:974-975`).

### I. Races, error mapping and data integrity (medium/low)

- Unique-constraint violations (version number, duplicate rows under concurrent writes) are not caught, so users see a 500 instead of a message. The client picks the next version number (`DoorSchedulingConfigPage.tsx:41`), and `POST /config/versions` returns 200 "EXISTS" while ignoring the submitted label.
- `ProtocolDutyPolicy` has no unique key per version (`schema.prisma`), so concurrent creates can duplicate; the loader uses `findFirst`.
- No partial unique index guarantees one ACTIVE version per system; two concurrent activations could leave two.
- `GET /config/fixed-assignments` with no active version returns every version's rows (`configRouter.ts:785-790`).
- `activeSharedServiceExists` accepts a service from any Music version, not the draft's or active one (`:1030`).
- A dead error branch (`configRouter.ts:398`, "No active configuration") never fires; `configLoader.ts` header says the seed config is returned when none exists, but it returns an empty config.
- Protocol activation is unvalidated: no duty policy means silent defaults (`protocol/engine.ts:597`); missing rules are only reported at plan time.
- `configRouter.ts` awaits the audit write after the change, so an audit failure returns an error for a committed change.

### J. Smaller items

- Raw `Error.message` is shown in `VersionsTab` create (`DoorSchedulingConfigPage.tsx:328`) where the rest use `schedulingError`.
- `MonthPlanPage.tsx` contains four U+FFFD replacement characters (lines near 62, 182, 223), where a "·" separator was intended, so users see "�" in the service panel title and the PDF lines.
- `countFor` rebuilds its slot map on every call inside sort comparators (`configuredEngine.ts:84-113`); fine at today's size, quadratic if the choir count grows.

## 3. Can this flow produce the bulletin in your image?

**Configuration can express the schedule.**
- Worship Team on every Tuesday: a WORSHIP category with a FIXED rule and a fixed designation.
- Hope on every first Sunday service: a fixed designation scoped to that service.
- Tuesday and Friday rotation with one choir or none: a rotating category with min 0 / max 1.
- First and second Sunday services with 2 or 3 choirs.
- Last-Saturday Holy Communion with 2 choirs.

**What configuration cannot express** (not verified against your intent): limits across services, such as "not Tuesday and Sunday in the same week".

**The bulletin does not match the image yet.**
- **Language and layout.** Today's sheet is English ("FIRST WEEK", "TUESDAY", "ON SUNDAY"). The image is Kinyarwanda: "ICYUMWERU CYA MBERE CYO KUVA dd/mm - dd/mm", "KUWA KABIRI" (blue), "KUWA GATANU" (peach), "KU CYUMWERU: date" (green), "ITERANIRO RYA MBERE / RYA KABIRI", and "IGABURO RYERA RYO KU WA dd/mm/yyyy" in a yellow band with lavender rows. The title is "UKO AMAKORALI AZITABIRA AMATERANIRO MU UKWAKIRA 2026". The Tuesday and Friday dates sit in their own row; the Sunday date is inside the green header.
- **Weeks that cross months.** The image's first week runs from the prior Monday and includes a prior-month Tuesday. The page passes month-only services (`MonthPlanPage.tsx:105`, `servicesOfMonth`), so the first and last week would be partial. The image itself has a typo here: it prints 28/10 and 29/10 where 28/09 and 29/09 are meant. We should print the correct dates.
- **Hard-coded kinds.** `bulletins.ts:20,57-66` only knows TUESDAY, FRIDAY, IGABURO, SS1 and SS2. A service with any other code is dropped from the choir sheet without notice, and the kind labels (`en.ts:1314-1318`) exist for those five codes only.
- **Inconsistent header in the image.** The last week uses a white Sunday header; we should apply the colours consistently.

## 4. Recommended order of work

1. **One generation-ready validator** (finding A): choir coverage, category by service rule completeness, calendar fields, case-insensitive code uniqueness, date format. Use it at activation, in a "Check this draft" endpoint and in the Review step (finding B). Add Protocol checks: duty policy present, rules for every protocol-required service in a supported kind.
2. **Base-version check at activation and a "based on vX" notice** (finding C); route retire through the draft/validate path (D); fix E.
3. **Make the supported set explicit**: either generalise Protocol beyond four kinds, or show "this service is not used by Protocol" in the editor; drop or wire up `targetTeamSize`; unify the relaxable list (F).
4. **Unsaved guard** (G) and **availability in Review** with clear "applies immediately" labelling (H).
5. **Error mapping and constraints** (I): catch unique violations, add the missing unique key, partial unique index for one ACTIVE version.
6. **Bulletin** to match the image: Kinyarwanda wording and colours, week spans from neighbouring months, configuration-driven columns instead of five fixed kinds, plus the replacement-character fix.

Each step is independent. Steps 1 and 2 remove the failures users actually hit; step 6 is the visible change.
