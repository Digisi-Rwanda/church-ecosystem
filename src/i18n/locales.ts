/**
 * Languages of the app.
 *
 * All three are NATIVE languages: each one is written in its own natural words by a
 * speaker of that language, never translated from another one. So a language is only
 * listed in ENABLED_LOCALES after people have tested and reviewed it. Until then it
 * stays out of the app, so wording can never misrepresent the system.
 */
export const LOCALES = ['en', 'rw', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  rw: 'Kinyarwanda',
  fr: 'Français',
};

export const DEFAULT_LOCALE: Locale = 'en';

/** Languages users may choose. Add 'rw' or 'fr' here only after native review. */
export const ENABLED_LOCALES: readonly Locale[] = ['en'];

export function isEnabledLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (ENABLED_LOCALES as readonly string[]).includes(value);
}
