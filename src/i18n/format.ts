import type { Locale } from './locales';

/**
 * Dates, numbers, money and plurals that follow the person's language. Screens call these
 * instead of building text by hand, so a second language never needs a code change.
 */
const TAG: Record<Locale, string> = { en: 'en-GB', rw: 'rw-RW', fr: 'fr-RW' };

/** The browser may not know Kinyarwanda; fall back to the nearest language it does know. */
function tagFor(locale: Locale): string {
  const wanted = TAG[locale];
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([wanted]).length > 0 ? wanted : locale === 'rw' ? 'fr-RW' : 'en-GB';
  } catch {
    return 'en-GB';
  }
}

export interface Format {
  date: (d: Date | string | number, style?: 'short' | 'long' | 'weekday') => string;
  time: (d: Date | string | number) => string;
  number: (n: number) => string;
  /** Whole francs, grouped by thousands: "12,500 RWF" (English) or "12 500 RWF" (French). */
  rwf: (n: number) => string;
  /** The plural category for a count: 'one' | 'other' (and 'few', 'many' where a language needs them). */
  plural: (n: number) => Intl.LDMLPluralRule;
}

const asDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

export function makeFormat(locale: Locale): Format {
  const tag = tagFor(locale);
  const opts: Record<'short' | 'long' | 'weekday', Intl.DateTimeFormatOptions> = {
    short: { day: 'numeric', month: 'short' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    weekday: { weekday: 'long', day: 'numeric', month: 'long' },
  };
  const num = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const rules = new Intl.PluralRules(tag);
  return {
    date: (d, style = 'long') => asDate(d).toLocaleDateString(tag, opts[style]),
    time: (d) => asDate(d).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' }),
    number: (n) => num.format(n),
    rwf: (n) => `${num.format(Math.round(n))} RWF`,
    plural: (n) => rules.select(n),
  };
}
