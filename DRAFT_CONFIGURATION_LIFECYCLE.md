# Draft configuration lifecycle follow-up

Implemented 2026-11-01. Music and Protocol Configuration history now offers Archive draft and Delete draft for writable DRAFT versions, and Restore draft for ARCHIVED versions. Every action has a confirmation dialog and pending/error handling. Archived configurations remain visible and read-only. Restoring returns them to DRAFT, never ACTIVE.

POST /api/scheduling/config/versions/:id/archive
POST /api/scheduling/config/versions/:id/restore
DELETE /api/scheduling/config/versions/:id

The server checks write permission in the version's owning system. Archive/delete reject non-draft versions. References from Music drafts/months/logs, Protocol plans/history (including Music pins), and later configuration versions are protected. Deletion also protects external configuration-row references and supersession lineage, then removes only the unused draft's own configuration rows in dependency order. Choir registers, date availability, active configurations and schedules are preserved. Actions produce audit events.

ARCHIVED uses the existing string status field. No schema/migration changes or execution, database access, commits, pushes or deployments were performed. This adds a transaction only around the new draft operation; it does not redesign existing scheduling lifecycle writes or establish production concurrency/atomicity guarantees.

Verified with mocked storage: 304 frontend tests; 94 scheduling configuration/Music/Protocol integration tests; browser Archive → Restore → Delete on a disposable fixture draft. Both application builds, bundle budget, boundaries, translation checks and diff check are recorded in draft-version-*.log. The prior unrelated Catechist full-suite failure remains outside this change; the full backend suite was not rerun for this follow-up.

The two-hour in-memory preview is running at http://127.0.0.1:5173/acceptance-scheduling.html?route=%2Fs%2Fsys-music%2Fconfig%3Ftab%3Dservices%26version%3Dgen-28 with a new editable draft. The browser was left on Church services with Add and Change available. Preview data disappears when the fixture is restarted; production data is not involved.
