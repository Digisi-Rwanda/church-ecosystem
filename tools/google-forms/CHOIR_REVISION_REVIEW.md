# Choir-first questionnaire revision — 3 November 2026

**Rollout follow-up:** the design is now approved for the 17 eligible units. See `REVISED_UNIT_ROLLOUT.md` and the verified revised link index. The review notes below describe the earlier design stage; the original Google resources remain untouched. Youth now has a separate local review preview without Marriage.

Review the interactive preview at `http://127.0.0.1:5190/tools/google-forms/choir-review.html`. It is local, does not save responses or send them to Google/Moriah, and can generate a compatible CSV for inspection. Existing Google Forms, response sheets and answers have not been changed in this revision.

## Choir template

- All nine About you fields are required in the local preview, Google blueprint and CSV validation: full name, preferred name, phone, email, birth date, National ID, gender, joined-church date and address.
- Work labels are “What's your job title/role?” and “When did this work begin?”.

- All visible dates use DD-MM-YYYY. Export converts real calendar dates to ISO YYYY-MM-DD for the existing Person 360 importer; ambiguous formats are not guessed.
- Membership status and the entire Additional contact section are removed from the questionnaire. Moriah's existing registration default remains unchanged.
- Work keeps work situation, sector, employer, role, business and start date. Study school/subject questions have been removed from Work; Education remains separate.
- Serving is a multi-select checkbox question: Evangelist, Intercessor, Teach Sunday school, Deacon, Protocol, Singer, Instrumentalist, Media, and Other with a name. Calling start date and notes are removed. Each selection exports as a separate CALLING record.
- Family supports up to 20 members per response: relationship, name, optional birth date and gender. The local preview uses Add another family member / Remove. The Google Forms blueprint uses a Yes/No navigation question to add another member or skip to Baptism; unused family pages are skipped. Notes are removed. Members export as a FAMILY JSON array, which the existing importer already accepts.
- Baptism remains.
- Marriage keeps its existing facts, provides Yes and No for the spouse-passing question, and labels the date “If yes, when did your spouse pass away?”. No skips that date page in the Google blueprint; the local preview hides it. Export writes DEATH only for Yes, checks both dates and chronological order, and never writes a “No” enum into Person 360.

The exported CSV retains the recognized existing flat headers, with removed fields blank, plus the supported CALLING and FAMILY JSON columns for repeated records. A live Google response/import round trip has not been performed.

## Unit-specific next steps

`template-plan.json` records the proposed unit profiles. Named choirs share one CHOIR template. The Children unit excludes employment and marriage; Youth excludes marriage. Music is marked collect=false because it consumes information from choirs. These other revised unit questionnaires have not been built or applied yet: the user requested review unit by unit, starting with choirs. No existing Music form or response sheet was deleted.

The original 21 Google forms and legacy `Person360.gs` remain preserved. Do not rerun the legacy all-unit creator as the revised template workflow. This revision is in `ChoirReview.gs`, with separate identifiers and export functions.

## Google review blueprint

`ChoirReview.gs` is ready to add as a separate Apps Script file. `createChoirReview` creates exactly one new unpublished review form and response sheet, never edits/deletes the existing unit forms, and stores its versioned question mapping. It has not been run in Google in this revision: this is the choir-first design review, before rollout.

The interactive local preview was verified through the existing browser's documented tab API after its normal focus helper timed out. Browser checks covered three selected serving roles including a named Other, two family members, Yes/No controlling the spouse-passing date, and a downloaded CSV. The downloaded file contained ISO birth date 1990-11-03, three CALLING records and two FAMILY records, matching the existing importer. No real person data was used or imported.

Validation: the earlier combined check passed 12 tests across choirFormReview and legacy googleForms. The required-fields/wording follow-up passed all 6 current choirFormReview tests; browser DOM checks confirmed all nine basic controls are required and both revised labels appear. Earlier frontend build, unchanged bundle budget, lint and boundaries passed; the follow-up diff check passed. The live revised Google form and its navigation/export still need verification when this design is approved for Google setup.

`exportChoirReviewCsv` exports responses from this review form. This is a review-template exporter; a later approved rollout must bind each choir's actual system ID and preserve its own response destination.

Regenerate and verify using the mocked/pure test runner:

```
npm run test --prefix server -- choirFormReview.test.ts googleForms.test.ts --maxWorkers 1 --no-file-parallelism
```

No database access, migration, seed, app deployment, commit or push is part of this revision.
