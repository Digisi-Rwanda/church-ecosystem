import { DEFAULT_LOCALE, type Locale } from './locales';
import { en, type MessageKey, type Messages } from './messages/en';
import { fr } from './messages/fr';
import { rw } from './messages/rw';

export type { MessageKey } from './messages/en';

export const CATALOGS: Record<Locale, Partial<Messages>> = { en, rw, fr };

export type MessageParams = Record<string, string | number>;

/** Fill {name} placeholders. A missing value is left visible so it is noticed, never silently dropped. */
export function fill(text: string, params?: MessageParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Look a key up in a language; an unwritten key falls back to the default language. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const text = CATALOGS[locale][key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return fill(text, params);
}

/** Keys a language has not written yet. */
export function missingKeys(locale: Locale): MessageKey[] {
  const catalog = CATALOGS[locale];
  return (Object.keys(en) as MessageKey[]).filter((k) => !catalog[k]);
}

/**
 * Texts that change with a count. A key `x` is written as `x.one` and `x.other` (and `x.few` / `x.many`
 * where a language needs them), so a sentence is never built by joining pieces. `{count}` is filled in.
 */
export function translatePlural(locale: Locale, key: string, count: number, category: string, params?: MessageParams): string {
  const cat = CATALOGS[locale] as Record<string, string | undefined>;
  const base = CATALOGS[DEFAULT_LOCALE] as Record<string, string | undefined>;
  const text = cat[`${key}.${category}`] ?? cat[`${key}.other`] ?? base[`${key}.${category}`] ?? base[`${key}.other`] ?? key;
  return fill(text, { count, ...params });
}
