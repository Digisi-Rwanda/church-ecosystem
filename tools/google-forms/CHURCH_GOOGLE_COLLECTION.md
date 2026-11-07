# Church-wide Google collection

Authorized: create one new unpublished English/Kinyarwanda Google Form and a separate response spreadsheet. Preserve every existing form, response and saved collection registry. The user selected 20 sibling and 20 child sections.

Generated source: `ChurchWideForm.gs`; definition: `church-google-spec.json`; builder: `scripts/build-church-google-form.mjs`.

## Google Forms adaptations

- Add another sibling/child uses Yes/No section navigation, with 20 of each.
- Singer is a separate Yes/No question because Google Forms cannot navigate based on checkbox answers. Yes requires a choir from the code-defined register; other serving roles remain checkboxes with a named Other option.
- Education level requires an answer to route correctly; None skips all follow-ups. Are you still studying? follows start year. Only No opens finish year.
- The retired branch asks only retirement date.
- Business name is only reached through Business and trade; job role/employer only through Employed.
- No file uploads, automatic emails, app imports, publishing, sharing changes or existing form operations are performed.

## Import/export

`exportChurchWideCsv` exports responses to the existing English-header import contract. The response sheet stays untouched. Fields with code choices are decoded from bilingual labels. Only the selected section route is exported, excluding stale answers from revisited sections.

Additional descriptive answers (education still studying, ADEPR reception, recommendation, and employed business activity) use existing CONTACT records. Choir is preserved in a Singer calling note; it does not create choir membership automatically. Spouse is a FAMILY record, not a dated marriage record.

The existing importer limit of 50 profile records per person is unchanged. Export validates all rows first and refuses an oversized profile instead of creating a partial CSV. Original Google answers remain in the form and spreadsheet.

The creator uses a unique versioned registry, a lock, chunked metadata and a duplicate guard. An incomplete creation must be inspected before any retry; it does not silently create a second form. The verifier reads only this newly created form and checks required fields, choices, all routes, destination, zero responses and unpublished state.

Creation completed and live verification passed on 3 November 2026 at 15:18 Kigali. See GOOGLE_CHURCH_FORM.md in the repository root, church-google-created.json and church-google-verification.json. Verified unpublished with zero responses, 210 questions, 63 sections and 54 branching questions. All 19 focused tests pass. No live submission or application import was performed.
