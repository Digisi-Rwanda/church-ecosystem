# Family details follow-up — 3 November 2026

**Completed Google update and verification:** 17/17 existing revised unit forms remain unpublished, each with 171 questions including 40 optional phone/National ID questions across 20 family-member pages. Placement, Yes/No navigation, response-sheet identity and response-count preservation checks all passed. Same form links; no new collection forms were created. Timestamped results are in `family-contact-verification.json`.

Requested changes:

- Youth, Children and Hope questionnaire profiles exclude Spouse from family relationships. Adult and other choir profiles retain it.
- Every family member can have an optional phone number and National ID, both text with a 30-character limit. Leading zeros are preserved.
- The shared Google template builder and local choir/Youth previews include these fields. `template-plan.json` records the allowed family relationships and contact fields for all code-defined unit profiles. Children and Hope still await their tailored questionnaire review; their original historical Google forms are not replaced by this follow-up.
- The current Person 360 add/edit forms and readable CSV template include family phone and National ID. Server validation accepts them within existing FAMILY JSON records. No database schema change or migration is needed.

## Existing revised Google forms

`FamilyContactUpdate.gs` is added alongside the existing saved Google scripts. It targets the 17 form IDs recorded in `revised-unit-forms.json` and their original versioned registries. It adds two optional questions after each family member's gender, updates the question-ID map, and keeps form URLs, response destinations, answers and unpublished status intact. Interrupted additions resume from the saved mapping instead of duplicating questions. No historical form is deleted or replaced.

Run `addFamilyContactQuestions` in bounded batches until 17/17 are ready, then `verifyFamilyContactQuestions` until verification is complete. The verifier checks optional fields, family navigation, unpublished state and preserved response destinations/counts. The earlier 131-question structural verifier describes the previous questionnaire and should not be used for this additive revision.

Use **`exportFamilyContactUnitCsv`**, setting `FAMILY_CONTACT_EXPORT_UNIT_ID` first, for the updated collections. It exports repeated FAMILY records with phone and National ID through the new validator. The saved existing `exportRevisedUnitCsv` also now delegates to the contact-aware exporter when a collection has been updated; if that exporter is absent, it stops instead of silently dropping identifiers. The original v1 exporter remains unchanged for historical forms.

`RevisedUnitForms-existing-collection.gs` is the exact saved collection script with that compatibility safeguard and its original `044d5db099adcd2d` registry version preserved. The generated `RevisedUnitForms.gs` describes a future full template revision; do not replace a saved collection's registry/version with it just to perform this additive update.

**Deployment requirement:** Person 360 acceptance/display changes are local code only. Deploy the updated frontend and backend before importing/editing these new details in the live app: an older backend may strip them, and an older UI does not provide their family-record controls. Google retains collected answers independently until the app is ready. No app deployment, database access, migration, commit or push is performed in this follow-up.

## Verification

- Backend/profile/template focused check: 47 tests passed across five files; later focused template/updater checks cover the exporter compatibility safeguards too.
- Frontend Person 360/registration: 12 tests passed.
- Frontend and backend builds passed. Boundaries and translation checks passed (rw/fr remain intentionally disabled pending review). Lint completed with warnings.
- The unchanged frontend first-visit bundle budget currently fails by 5 compressed bytes beyond 150 KiB. No budget increase or functionality removal was made; this remains a frontend release blocker.
- Google update and verification completed for all 17 approved collections. No real Google response or Moriah import was submitted. The Youth/Children/Hope historical Google forms remain pending their separate tailored-template approval; their revised template relationship rules exclude Spouse.
