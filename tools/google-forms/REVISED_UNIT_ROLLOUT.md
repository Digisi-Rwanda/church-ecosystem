# Revised Person 360 unit forms — 3 November 2026

The approved adult/choir questionnaire is rolled out as **new unpublished versions**, preserving the original 21 forms, all existing responses and response destinations. Original links remain historical collection versions; use the revised links listed in `revised-unit-forms.json` after verification. No responses are copied, deleted or rewritten.

**Completed and verified 3 November 2026:** 17/17 revised unit forms are unpublished, with 17 unique response sheets, 131 questions each (including conditional family-member pages), nine required About you fields and matching question/navigation structures. All original-preservation checks passed; the inspected originals had zero responses. Full links are in `../../GOOGLE_REVISED_UNIT_FORMS.md`, and timestamped verification reports are in `revised-unit-forms.json`. One additional unpublished master review template and its separate review sheet were created to generate the unit copies.

## Approved units

Six named choirs: Ijwi ry' umwami Yesu, El bethel, Integuza, Elim, Beulah and Yerusalemu. Other units: Men, Women, Family, Elderly, Evangelism, Intercessors, Deacon, Worship, Protocol, Media and Choir Ministry. Total: 17.

Hope, Children and Youth are excluded from this rollout. Music is also excluded as previously requested: Music consumes choir registration information instead of collecting it again. Existing excluded forms are left intact.

## Saved script

Add generated `RevisedUnitForms.gs` alongside the original `Code.gs` in the existing Moriah Apps Script project. Do not add `ChoirReview.gs` as well: it contains the same template constant/functions.

1. `createChoirReview` creates the new unpublished master and a separate review response sheet.
2. `createRevisedUnitForms` makes versioned copies for the approved units. Completed versions are reused; bounded batches can be rerun. A changed, published or answered partial form blocks further setup for inspection.
3. `verifyRevisedUnitForms` checks unpublished state, unique response destinations, required basic fields, item titles/types and family/spouse navigation. It compares original item IDs/titles/types, destination and publishing status to the pre-copy snapshot; original response counts must not decrease. Verification uses bounded batches: rerun until all 17 are reported. Starting again after a completed run performs fresh checks rather than returning the previous run's results.
4. Set `REVISED_EXPORT_UNIT_ID` to the selected eligible system ID and run `exportRevisedUnitCsv` to create an import-compatible CSV after responses exist. Existing legacy exporters remain unchanged. Export reads Google Form answers, not manually edited response-sheet cells. It does not import into Moriah.

No function publishes, shares, emails, submits answers, modifies original questions or writes to Moriah.

## Youth review only

Open `http://127.0.0.1:5190/tools/google-forms/youth-review.html`.

Sections: About you (all nine required), Work, Education, Serving in the church (multiple selections and named Other), Family (up to 20 members), Baptism. Marriage is omitted. Dates use DD-MM-YYYY. The local preview can download a compatible CSV, but does not send or save data to Google or Moriah. Youth's existing Google form is not changed by this rollout.

Validation: 16 focused tests passed across the legacy and revised template suites, including rejection of stale verification results after a form's publishing state changes. Youth browser checks cover absence of Marriage, repeated family members, named Other and reset behavior. Google rollout results are recorded separately after completion; no live response/import round trip is performed.
