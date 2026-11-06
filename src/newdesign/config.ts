/**
 * Scheduling configuration page helpers.
 *
 * Pure functions only: no hooks, no server calls, so each one is testable in
 * isolation. The wording keys live in `src/i18n/messages/en.ts` under `door.config.*`.
 */

import type {
  CategoryServicePolicyApi,
  ChoirCategoryApi,
  ChoirCategoryLinkApi,
  PlanningMode,
  ProtocolDutyPolicyApi,
  MusicRuleApi,
  ProtocolServiceRuleApi,
  RuleFrequencyApi,
  Recurrence,
  SchedulingServiceApi,
} from '../api/frontDoorApi';
import type { MessageKey } from '../i18n/messages/en';
import type { MessageParams } from '../i18n/translate';

type TFn = (k: MessageKey, params?: MessageParams) => string;

const WEEKDAY_KEYS = [
  'door.caring.weekday.0',
  'door.caring.weekday.1',
  'door.caring.weekday.2',
  'door.caring.weekday.3',
  'door.caring.weekday.4',
  'door.caring.weekday.5',
  'door.caring.weekday.6',
] as const satisfies readonly MessageKey[];

/** The tabs of the configuration page. Music shows the first four, in this order; Protocol shows services, protocol, duty. */
export const CONFIG_TABS = [
  'services',
  'categories',
  'choirs',
  'rules',
  'protocol',
  'duty',
] as const;
export type ConfigTab = (typeof CONFIG_TABS)[number];

export const configTabsForSystem = (systemId: string): readonly ConfigTab[] =>
  systemId === 'sys-music'
    ? CONFIG_TABS.filter((tab) => tab !== 'protocol' && tab !== 'duty')
    : systemId === 'sys-protocol'
      ? CONFIG_TABS.filter((tab) => tab === 'services' || tab === 'protocol' || tab === 'duty')
      : ['services'];

export const configTabKey = (tab: ConfigTab): MessageKey => `door.config.tab.${tab}`;

/** Old bookmarks (?tab=links, policies, fixed, availability, review, versions) land on the tab that now owns the content. */
export const normalizeConfigTab = (raw: string | null, tabs: readonly ConfigTab[]): ConfigTab => {
  const moved: Record<string, ConfigTab> = { links: 'choirs', availability: 'choirs', policies: 'rules', fixed: 'rules' };
  const wanted = (raw && moved[raw]) || raw;
  return tabs.find((tab) => tab === wanted) ?? tabs[0] ?? 'services';
};

/** A weekday 0-6 (Sunday-first) as a translated name. */
export const weekdayName = (t: TFn, weekday: number | null): string => {
  if (weekday === null || !Number.isInteger(weekday) || weekday < 0 || weekday >= WEEKDAY_KEYS.length) return '';
  return t(WEEKDAY_KEYS[weekday]);
};

export const serviceKindKey = (kind: SchedulingServiceApi['kind']): MessageKey => `door.config.kind.${kind}`;
export const recurrenceKey = (r: Recurrence): MessageKey => `door.config.recurrence.${r}`;
export const frequencyCountingKey = (c: CategoryServicePolicyApi['frequencyCounting']): MessageKey =>
  `door.config.counting.${c}`;
export const frequencyKindKey = (k: CategoryServicePolicyApi['frequencyKind']): MessageKey =>
  `door.config.frequencyKind.${k}`;
export const planningModeKey = (m: PlanningMode): MessageKey => `door.config.planningMode.${m}`;
export const extraDutyPolicyKey = (p: ProtocolDutyPolicyApi['extraDutyPolicy']): MessageKey =>
  `door.config.extraDuty.${p}`;

/** One line for a service row: "Sunday service · Every week · Active". */
export const serviceSummary = (s: SchedulingServiceApi, t: TFn): string => {
  const parts: string[] = [s.name];
  const when: string[] = [];
  const wd = weekdayName(t, s.weekday);
  if (wd) when.push(wd);
  if (s.time) when.push(s.time);
  if (when.length) when.push('·');
  when.push(t(recurrenceKey(s.recurrence)));
  if (when.length) parts.push(when.join(' '));
  parts.push(s.active ? t('door.config.service.active') : t('door.config.service.inactive'));
  return parts.join(' · ');
};

/** One line for a category row. */
export const categorySummary = (c: ChoirCategoryApi): string => c.description || c.code;

/** One line for a policy row. */
export const policySummary = (p: CategoryServicePolicyApi, t: TFn, includeEligibility = true): string => {
  const parts: string[] = includeEligibility ? [
    t('door.config.policy.eligibility', {
      value: t(p.eligible ? 'door.config.form.yes' : 'door.config.form.no'),
    }),
  ] : [];
  const frequencyKind = t(frequencyKindKey(p.frequencyKind));
  const frequencyCounting = t(frequencyCountingKey(p.frequencyCounting));
  if (p.frequencyTarget !== null) parts.push(t('door.config.policy.frequencySummary', {
      kind: frequencyKind,
      count: p.frequencyTarget,
      counting: frequencyCounting,
    }));
  if (p.minCount !== null) parts.push(t('door.config.policy.minValue', { count: p.minCount }));
  if (p.maxCount !== null) parts.push(t('door.config.policy.maxValue', { count: p.maxCount }));
  if (p.requireAll) parts.push(t('door.config.policy.requireAll'));
  if (p.frequencyPeriod) parts.push(t(("door.config.period." + p.frequencyPeriod) as MessageKey));
  parts.push(t(planningModeKey(p.planningMode)));
  return parts.join(' · ');
};

/** One line for a choir ↔ category link row. */
export const linkSummary = (
  l: ChoirCategoryLinkApi,
  t: TFn,
  choirName = t('door.config.nameUnavailable.choir'),
  categoryName = t('door.config.nameUnavailable.category'),
): string =>
  `${choirName} → ${categoryName} · ${l.active ? t('door.config.service.active') : t('door.config.service.inactive')}`;

/** One line for a protocol rule row. */
export const ruleSummary = (r: ProtocolServiceRuleApi, t: TFn): string =>
  `${r.serviceCode ?? t('door.config.nameUnavailable.service')} · ${t('door.config.protocol.defaultTeamSize')}: ${r.defaultTeamSize}`;

/** The human name of a service kind. */
export const serviceKindName = (k: SchedulingServiceApi['kind'], t: TFn): string => t(serviceKindKey(k));

/** The human name of a recurrence. */
export const recurrenceName = (r: Recurrence, t: TFn): string => t(recurrenceKey(r));

/** The human name of a frequency-counting mode. */
export const frequencyCountingName = (c: CategoryServicePolicyApi['frequencyCounting'], t: TFn): string =>
  t(frequencyCountingKey(c));

/** The human name of a frequency-kind. */
export const frequencyKindName = (k: CategoryServicePolicyApi['frequencyKind'], t: TFn): string =>
  t(frequencyKindKey(k));

/** The human name of a planning mode. */
export const planningModeName = (m: PlanningMode, t: TFn): string => t(planningModeKey(m));

/** The human name of an extra-duty policy. */
export const extraDutyPolicyName = (p: ProtocolDutyPolicyApi['extraDutyPolicy'], t: TFn): string =>
  t(extraDutyPolicyKey(p));

/* ─── Rules, in words ─── */

const FREQUENCY_SYMBOL = { MINIMUM: '≥', TARGET: '=', MAXIMUM: '≤' } as const;

/** "≥ 2 / month", "= 1 / quarter", "≤ 3 / year", or "—". Accepts the partial frequency of an exception. */
export const formatFrequency = (f: Partial<RuleFrequencyApi> | null | undefined, t: TFn): string => {
  if (!f || (f.target === undefined && f.kind === undefined && f.period === undefined)) return '—';
  const per = f.period ? ` / ${t(`door.config.rules.per.${f.period}` as MessageKey)}` : '';
  const dates = f.counting === 'DISTINCT_DATES' ? ` (${t('door.config.rules.perDates')})` : '';
  return `${f.kind ? FREQUENCY_SYMBOL[f.kind] + ' ' : ''}${f.target ?? ''}${per}${dates}`.trim();
};

/** "0–1", "2–∞", or blank when the rule has no counts (Fixed and Manual rules, or a rotation with neither set). */
export const formatMinMax = (r: Pick<MusicRuleApi, 'minCount' | 'maxCount'>): string =>
  r.minCount === null && r.maxCount === null ? '' : `${r.minCount ?? 0}–${r.maxCount ?? '∞'}`;

export interface RuleNames {
  /** Weekday-qualified label, for pickers and chips. */
  service: (id: string) => string;
  /** Plain service name, for sentences. */
  serviceShort: (id: string) => string;
  category: (id: string) => string;
  choir: (id: string) => string;
}

const list = (items: string[]) => {
  try { return new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); }
};

/** One English sentence per rule, assembled from the rule's fields and translated phrase templates. */
export const ruleSentences = (rules: MusicRuleApi[], names: RuleNames, t: TFn): string[] =>
  rules.map((r) => {
    const extra: string[] = [];
    if (r.minCount !== null && r.maxCount !== null) extra.push(t('door.config.rules.count', { min: r.minCount, max: r.maxCount }));
    else if (r.minCount !== null) extra.push(t('door.config.rules.countMin', { min: r.minCount }));
    else if (r.maxCount !== null) extra.push(t('door.config.rules.countMax', { max: r.maxCount }));
    if (r.requireAll) extra.push(t('door.config.rules.everyChoir'));
    if (r.frequency) extra.push(formatFrequency(r.frequency, t));
    return t('door.config.rules.sentence', {
      target: r.target.kind === 'category' ? names.category(r.target.categoryId) : names.choir(r.target.choirId),
      how: t(`door.config.rules.how.${r.arrangement}` as MessageKey),
      services: list(r.scope.map(names.serviceShort)),
      extra: extra.map((part) => `, ${part}`).join(''),
    });
  });
