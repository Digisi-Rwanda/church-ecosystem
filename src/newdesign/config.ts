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
  ConfigStatus,
  ConfigVersionApi,
  PlanningMode,
  ProtocolDutyPolicyApi,
  ProtocolServiceRuleApi,
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

/** The seven tabs of the configuration page, in the order they appear. */
export const CONFIG_TABS = [
  'services',
  'categories',
  'policies',
  'links',
  'fixed',
  'availability',
  'protocol',
  'duty',
  'review',
  'versions',
] as const;
export type ConfigTab = (typeof CONFIG_TABS)[number];

export const configTabsForSystem = (systemId: string): readonly ConfigTab[] =>
  systemId === 'sys-music'
    ? CONFIG_TABS.filter((tab) => tab !== 'protocol' && tab !== 'duty')
    : systemId === 'sys-protocol'
      ? CONFIG_TABS.filter((tab) => tab === 'services' || tab === 'protocol' || tab === 'duty' || tab === 'versions')
      : ['services', 'versions'];

export const configTabKey = (tab: ConfigTab): MessageKey => `door.config.tab.${tab}`;

export const MUSIC_SETUP_STEPS = ['services','links','policies','review'] as const;
export function musicSetupStep(tab: string): number {
  if (tab === 'categories' || tab === 'links') return 1;
  if (tab === 'policies' || tab === 'fixed' || tab === 'availability') return 2;
  return tab === 'review' ? 3 : 0;
}

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
export const configStatusKey = (s: ConfigStatus): MessageKey => `door.config.status.${s}`;
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

/** One line for a config version row. */
export const versionSummary = (v: ConfigVersionApi, t: TFn): string =>
  `${v.label} · ${t(configStatusKey(v.status))} · v${v.version}`;

/** The human name of a config version status. */
export const versionStatusName = (v: ConfigVersionApi, t: TFn): string => t(configStatusKey(v.status));

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
