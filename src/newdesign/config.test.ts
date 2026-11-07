import { describe, expect, it } from 'vitest';
import { configTabsForSystem, formatFrequency, formatMinMax, normalizeConfigTab, ruleSentences, type RuleNames } from './config';
import type { MusicRuleApi } from '../api/frontDoorApi';

// A tiny translator over the real phrase templates, so the sentences below are what users would read.
const phrases: Record<string, string> = {
  'door.config.rules.per.MONTH': 'month', 'door.config.rules.per.QUARTER': 'quarter', 'door.config.rules.per.YEAR': 'year', 'door.config.rules.per.HALF_YEAR': 'half-year',
  'door.config.rules.perDates': 'distinct dates',
  'door.config.rules.how.FIXED': 'is fixed', 'door.config.rules.how.ROTATION': 'rotates', 'door.config.rules.how.MANUAL': 'is placed by hand',
  'door.config.rules.count': '{min}–{max} choirs', 'door.config.rules.countMin': 'at least {min} choirs', 'door.config.rules.countMax': 'up to {max} choirs',
  'door.config.rules.everyChoir': 'every eligible choir', 'door.config.rules.sentence': '{target} {how} on {services}{extra}.',
};
const t = ((key: string, params: Record<string, string | number> = {}) =>
  (phrases[key] ?? key).replace(/\{(\w+)\}/g, (_m, name) => String(params[name]))) as never;

const names: RuleNames = {
  service: (id) => id, serviceShort: (id) => ({ tue: 'Tuesday', fri: 'Friday', s1: 'Sunday 1st', s2: 'Sunday 2nd' } as Record<string, string>)[id] ?? id,
  category: (id) => ({ primary: 'Primary', worship: 'Worship' } as Record<string, string>)[id] ?? id,
  choir: (id) => id.toUpperCase(),
};
const rule = (over: Partial<MusicRuleApi>): MusicRuleApi => ({
  id: 'r', scope: ['tue'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION',
  minCount: null, maxCount: null, frequency: null, requireAll: false, exceptions: [], ...over,
});

describe('frequency text', () => {
  it('writes the symbol, count and period', () => {
    expect(formatFrequency({ kind: 'MINIMUM', target: 2, period: 'MONTH', counting: 'ASSIGNMENTS' }, t)).toBe('≥ 2 / month');
    expect(formatFrequency({ kind: 'TARGET', target: 1, period: 'QUARTER', counting: 'ASSIGNMENTS' }, t)).toBe('= 1 / quarter');
    expect(formatFrequency({ kind: 'MAXIMUM', target: 3, period: 'YEAR', counting: 'DISTINCT_DATES' }, t)).toBe('≤ 3 / year (distinct dates)');
    expect(formatFrequency(null, t)).toBe('—');
  });
  it('copes with the partial frequency of an exception', () => {
    expect(formatFrequency({ target: 1 }, t)).toBe('1');
  });
});

describe('min / max', () => {
  it('is blank when there are no counts', () => expect(formatMinMax({ minCount: null, maxCount: null })).toBe(''));
  it('fills a missing side', () => {
    expect(formatMinMax({ minCount: 0, maxCount: 1 })).toBe('0–1');
    expect(formatMinMax({ minCount: 2, maxCount: null })).toBe('2–∞');
  });
});

describe('the whole configuration in words', () => {
  it('builds each sentence from the rule fields', () => {
    const sentences = ruleSentences([
      rule({ scope: ['s1', 's2'], target: { kind: 'choir', choirId: 'w1' }, arrangement: 'FIXED' }),
      rule({ scope: ['tue', 'fri'], minCount: 0, maxCount: 1 }),
      rule({ scope: ['s1'], frequency: { kind: 'MINIMUM', target: 2, period: 'MONTH', counting: 'ASSIGNMENTS' }, requireAll: true }),
    ], names, t);
    expect(sentences).toEqual([
      'W1 is fixed on Sunday 1st and Sunday 2nd.',
      'Primary rotates on Tuesday and Friday, 0–1 choirs.',
      'Primary rotates on Sunday 1st, every eligible choir, ≥ 2 / month.',
    ]);
  });
});

describe('tabs', () => {
  it('Music has four sections in order; Protocol keeps its own', () => {
    expect(configTabsForSystem('sys-music')).toEqual(['services', 'categories', 'choirs', 'rules']);
    expect(configTabsForSystem('sys-protocol')).toEqual(['services', 'protocol', 'duty']);
  });
  it('old bookmarks land on the tab that now owns the content', () => {
    const tabs = configTabsForSystem('sys-music');
    expect(normalizeConfigTab('links', tabs)).toBe('choirs');
    expect(normalizeConfigTab('availability', tabs)).toBe('choirs');
    expect(normalizeConfigTab('policies', tabs)).toBe('rules');
    expect(normalizeConfigTab('fixed', tabs)).toBe('rules');
    expect(normalizeConfigTab('review', tabs)).toBe('services');
    expect(normalizeConfigTab('versions', tabs)).toBe('services');
    expect(normalizeConfigTab(null, tabs)).toBe('services');
  });
});
