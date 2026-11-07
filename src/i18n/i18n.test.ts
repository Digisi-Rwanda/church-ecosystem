import { describe, expect, it } from 'vitest';
import { ENABLED_LOCALES, LOCALES } from './locales';
import { en } from './messages/en';
import { fill, missingKeys, translate } from './translate';

describe('wording system', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('Week of {date}', { date: '5 Oct' })).toBe('Week of 5 Oct');
    expect(fill('{count} unread', { count: 3 })).toBe('3 unread');
    expect(fill('Hello {who}', {})).toBe('Hello {who}');
  });

  it('has no empty English wording', () => {
    for (const [key, text] of Object.entries(en)) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('lists only languages that are complete (enabled languages must have every key)', () => {
    for (const locale of ENABLED_LOCALES) {
      expect(missingKeys(locale), `${locale} is enabled but incomplete`).toEqual([]);
    }
  });

  it('keeps unreviewed languages switched off', () => {
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      // Until native wording exists and is reviewed, the language must not be offered.
      if (missingKeys(locale).length > 0) {
        expect(ENABLED_LOCALES).not.toContain(locale);
      }
    }
  });

  it('falls back to English for an unwritten key', () => {
    expect(translate('rw', 'shell.signOut')).toBe(en['shell.signOut']);
  });
});
