# Moriah unit Person 360 Google Forms

**Revision review, 3 November 2026:** the choir-first changes are documented in [CHOIR_REVISION_REVIEW.md](CHOIR_REVISION_REVIEW.md). The original 21-form package below is preserved as the legacy version; revised questionnaires are reviewed by unit type, and Music is excluded from the new collection plan.

English questionnaires for the 21 unit systems defined in `server/src/lib/ministryOrgs.ts`: ten ministries, Worship, Protocol, Media, the Choir Ministry and seven named choirs. Central Administration and shared Finance are not separate unit forms. `units.json` lists the exact IDs. This is a static code list, not a live database audit; additional systems created through the app must be added explicitly.

## Current review status

The user explicitly approved creation of all 21 forms and response spreadsheets. Creation is complete. Live `verifyUnitForms` inspection on 2 November 2026 confirmed **21 READY forms, 43 questions per form, all unpublished, 21 distinct linked response spreadsheets, and zero responses**. No editor sharing, emails or Moriah imports were performed. The partial Music setup was completed in place; the existing Youth form was preserved and its empty internal form title completed.

All unit-by-unit review, responder and spreadsheet links are in [GOOGLE_UNIT_FORMS.md](../../GOOGLE_UNIT_FORMS.md). The verification metadata is saved in `created-unit-forms.json` as a local review artifact. Responder links become usable after the form owner publishes the chosen forms in Google Forms.

- Youth form editor: https://docs.google.com/forms/d/1zEYCMRkbCMvzxVExacWD_J2R0o0fjWpe0-M4Jeh3pg4/edit
- Youth response sheet: https://docs.google.com/spreadsheets/d/1FkUOIUx9NoNCSqSf9mrCesRu2YRA9AdyHYl8Jz-Bhoc/edit
- Youth responder link (unpublished): https://docs.google.com/forms/d/e/1FAIpQLSf4z7E-LTtB84J_veLVBtlyB2YN6G54_EsPfCWgNH1ljCeJyg/viewform

No forms have been published or shared by this work, and no responses have been submitted or imported.

## Setup and collection

The saved Google Apps Script project is **Moriah — Unit Person 360 Forms**:

https://script.google.com/home/projects/1Udftl0Dn5hJcn71wsZlQk7IGjzc4q7DWg9foPhf_0OS_GhGy6eM4ngEx/edit

The same reviewed source is in `Person360.gs`. Run `createUnitForms`. It creates a separate unpublished form and response spreadsheet for each unit. It first creates a questionnaire, then copies its questions for the remaining units, gives each form its own unit title and a fresh response destination, and verifies copied forms contain no responses. Respondents cannot see response summaries. It does not publish, grant editors, share spreadsheets, email links or call the Moriah API.

Execution pauses after a bounded time to avoid Google's execution limit. Run the same function again to continue. Completed forms are preserved. An unfinished form is resumed only when its ID and schema match, its title/questions have not been changed, and it is unpublished with no responses. Otherwise it stops that unit for review. Do not delete script properties: they map each unit to its existing form and question IDs.

`verifyUnitForms` is read-only. It reports unit IDs, form links/titles, publication status, question counts, response counts and response destinations; it never logs submitted answers. It also checks that all completed units have separate response destinations. The local integration suite passes 7 tests, including interrupted forms with an empty title or missing destination (Google throws for a missing destination rather than returning null).

Review each form and its response sheet, then use Google Forms' **Publish** control and choose the intended respondent access. Give respondents the responder link, not the editor or spreadsheet link. Google permissions are handled in your Google account; no Moriah role grants Google Drive access automatically. Do not expose response spreadsheets publicly. This package has not assigned any unit leaders as Google editors.

## Questions and import

Each form has eight sections and 43 questions corresponding to the current import template: basic details, additional contact, work, education, calling, family, baptism and marriage. Only full name is mandatory. Dates use **YYYY-MM-DD**, years use 1930–2100, and choices use English labels. Phone and National ID are text, preserving initial zeros.

One submission describes one person and one record per profile section, matching the flat template. More relatives, callings, contacts, work or education records can be added from the saved profile or through the existing JSON section import format. Documents and links to registered relatives are added after registration. Respondents may skip unknown or inapplicable fields; unit leaders review partially filled sections before importing.

To export:

1. Review the selected unit's responses in its spreadsheet/form. The exporter reads submitted Google Form responses, not manually edited spreadsheet cells; use the form's response editor to correct an answer, or correct the exported CSV before previewing it in Moriah.
2. In Apps Script, set `EXPORT_UNIT_ID` to the exact unit ID from `units.json`.
3. Run `exportUnitCsv`. Its log gives a new CSV file link and the matching `/s/<systemId>/people/import` route.
4. Download that CSV and open **People → Import** in that exact unit's Moriah system.
5. **Check the file**, resolve any errors, then add the accepted people.

The exporter maps English choices to Moriah's canonical enum codes, validates dates/years, preserves the exact 43 headers and excludes Google's Timestamp. It uses stored question IDs, so renaming a question does not rename a CSV column. Deleting a mapped question stops export. New questions not in the template are not exported. Do not export the raw response sheet as the Moriah template: headings and choice labels differ.

Export includes all responses each time, does not mark them imported and does not auto-update existing Moriah profiles. Moriah's importer skips duplicate people; a person already registered under another unit is not automatically given a new membership. Ask Central Administration to review those memberships. The form title fixes the intended collection unit; the CSV itself does not enforce a tenant or system boundary. Import authorization remains in Moriah's existing server-side checks.

## Reviewable source and checks

`scripts/build-person360-google-forms.ts` imports the pure unit constants and existing frontend profile field definitions; it never imports or runs `seed.ts`, Prisma or database commands. It generates `Person360.gs` and `units.json` from those sources.

Regenerate and run the local integration checks:

```
npm run test --prefix server -- googleForms.test.ts --maxWorkers 1 --no-file-parallelism
```

The test uses mocked Google services to cover all template headers/unit IDs, creation/copying, separate sheets, repeat runs, partial setup recovery, date validation, human-choice normalization and CSV import compatibility. These tests do not call Google or a database. A real-response round trip remains separate from these mocked checks.

This increment does not deploy the church app or change its database/schema. Existing scheduling ownership and non-atomic lifecycle-write limitations remain deferred.

Google references used: [Forms service](https://developers.google.com/apps-script/reference/forms/form), [FormApp](https://developers.google.com/apps-script/reference/forms/form-app), [text validation](https://developers.google.com/apps-script/reference/forms/text-validation-builder), [Drive files](https://developers.google.com/apps-script/reference/drive/file).

## Approved revised questionnaire

The family-contact follow-up is documented in `FAMILY_CONTACT_UPDATE.md`. The current Person 360 CSV template adds readable family Phone/National ID columns; the original 43-question Google package stays frozen for historical responses. Updated Google collections use `FamilyContactUpdate.gs` and `exportFamilyContactUnitCsv` to retain repeated relatives' phone/ID values in FAMILY JSON.

See `REVISED_UNIT_ROLLOUT.md` for the 17-unit revision and `RevisedUnitForms.gs` for its separate versioned creator/exporter. The original creator and links above are retained for historical responses. The revised family/spouse branching is checked using Google's [Choice navigation API](https://developers.google.com/apps-script/reference/forms/choice). Youth has a local review at `http://127.0.0.1:5190/tools/google-forms/youth-review.html`; its Google form remains unchanged pending review.
