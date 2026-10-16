# Languages

The app speaks three languages: English, Kinyarwanda and French. All three are **native**:
each is written in its own natural words by a speaker of that language. Nothing is
translated from another language, and nothing is machine translated.

## How it works

- All screen wording lives in `src/i18n/messages/`: `en.ts`, `rw.ts`, `fr.ts`.
- Screens never hold wording themselves. They call `useT()` and ask for a key, for example `t('login.signIn')`.
- `src/i18n/locales.ts` lists `ENABLED_LOCALES`. A language is added there only after it has been written, tested and reviewed by people. Today only English is enabled.
- The language picker appears automatically once more than one language is enabled.
- A test fails if an enabled language is missing any wording.

## Adding a language to users

1. Native speakers fill `rw.ts` (or `fr.ts`) in their own words for every key in `en.ts`.
2. People test every screen in that language and review the wording.
3. Only then add the language to `ENABLED_LOCALES`.

## Rule for every slice

A screen moves its wording into `en.ts` when it is built or reworked. Screens not yet moved still show English text directly; they move one slice at a time.
