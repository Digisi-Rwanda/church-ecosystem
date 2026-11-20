# Church-wide Person 360 questionnaire

This supersedes the planned per-unit questionnaire rollout. A separate unpublished church-wide form is now created; see GOOGLE_CHURCH_FORM.md at the repository root. Existing forms, saved collection scripts, sheets and responses are preserved.

Preview: http://127.0.0.1:5190/tools/google-forms/church-review.html

- Every question and choice appears in English and Kinyarwanda. Import column headers and enum codes remain unchanged.
- Father and Mother names are required. Their phone and National ID are optional. Parents use PARENT with gender to retain Father/Mother distinction.
- Add a sibling replaces Add family member. Sibling names are required after adding; identifiers are optional.
- Are you married? Yes requires spouse name, phone and National ID. This is imported as a SPOUSE family record, not a sacramental marriage record: a marriage date was not collected.
- Do you have children? Yes requires at least one child. Add child allows repeated child names, optional phone and National ID without a questionnaire limit.
- Baptised? Yes requires date and an ADEPR/Other church choice. Other church requires its name and whether the person was officially received in ADEPR. The person-who-baptised question is removed. No excludes all baptism follow-ups from export.
- Employed requires sector, employer organisation, role and start date. Self-employed requires sector and start date, without a current job-title question. Business name is only asked/required for Business and trade. Hidden work fields are excluded from export.
- Own National ID is now required as requested. Own phone, email and church joining date remain optional. Full name, preferred name, date of birth, gender and address remain required. This ID requirement may need a later exception if the same questionnaire is used for children without National IDs; no exception is silently applied.
- Dates are DD-MM-YYYY on the questionnaire and validated/converted to ISO dates for import.
- Children ministry replaces Teach Sunday school. Singer requires a code-defined choir; the selected name is preserved in the Singer calling note. Import does not automatically create choir membership or organizational links.
- Education excludes Other. None hides all follow-ups; Primary hides subject and school; O' Level hides subject. Are you still studying? Yes hides finish year. The education selector remains visible to permit correcting None.
- Phone and National ID labels no longer include optional/si ngombwa; required fields use an asterisk.
- Existing import-compatible CONTACT records preserve the answers to Still studying and Officially received in ADEPR with descriptive labels. Those are not dedicated education/baptism database flags; no schema change is made. Hidden answers are omitted from CSV. Choir choices are taken from the code-defined register, not a live database lookup.
- ADEPR baptism asks ADEPR Kacyiru or another ADEPR congregation. Another congregation requires its name and whether a recommendation letter was brought. The latter is retained as a descriptive CONTACT record. Other church continues to ask the name and official ADEPR reception question. Changing branches excludes stale hidden answers.
- Parent headings use Papa wawe / Mama wawe. Ministry wording uses minisiteri y' abana, Umwinginzi and Ufata amashusho. Youth, Men, Women, Elderly and Family ministries have been added; Other retains a named custom role.
- Education now places Are you still studying? immediately after the start year and before the conditional finish year.

## Delivery limits to resolve before Google rollout

The local preview has unrestricted Add child/sibling controls. For the new Google form, the user explicitly approved 20 sibling and 20 child sections with Add another? navigation. Singer is adapted to a separate Yes/No routing question. See CHURCH_GOOGLE_COLLECTION.md for the Google-specific implementation.

The current application importer accepts at most 50 profile records per person (all sections combined). The review can collect more relatives; export explicitly refuses over-limit profiles and retains the answers on the page. No importer limits, production schema or database records were changed here.

The Kinyarwanda wording is ready for the user's language review. No real personal data was entered during verification.

- Retired now asks only the required retirement date. All previous-work questions were removed; stale previous-work details are excluded from CSV. Employed Business and trade activity remains preserved as a descriptive CONTACT record because the importer strips its business field.
