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

/** The seven tabs of the configuration page, in the order they appear. */
export const CONFIG_TABS = [
  'services',
  'categories',
  'policies',
  'links',
  'protocol',
  'duty',
  'versions',
] as const;
export type ConfigTab = (typeof CONFIG_TABS)[number];

export const configTabKey = (tab: ConfigTab): string => `door.config.tab.${tab}` as const;

/** A weekday 0-6 (Sunday-first) as a translated name. */
export const weekdayName = (t: (k: string) => string, weekday: number | null): string => {
  if (weekday === null || weekday < 0 || weekday > 6) return '';
  return t(`door.caring.weekday.${weekday}` as 'door.caring.weekday.0');
};

export const serviceKindKey = (kind: SchedulingServiceApi['kind']): string => `door.config.kind.${kind}` as const;
export const recurrenceKey = (r: Recurrence): string => `door.config.recurrence.${r}` as const;
export const frequencyCountingKey = (c: CategoryServicePolicyApi['frequencyCounting']): string =>
  `door.config.counting.${c}` as const;
export const frequencyKindKey = (k: CategoryServicePolicyApi['frequencyKind']): string =>
  `door.config.frequencyKind.${k}` as const;
export const planningModeKey = (m: PlanningMode): string => `door.config.planningMode.${m}` as const;
export const configStatusKey = (s: ConfigStatus): string => `door.config.status.${s}` as const;
export const extraDutyPolicyKey = (p: ProtocolDutyPolicyApi['extraDutyPolicy']): string =>
  `door.config.extraDuty.${p}` as const;

/** One line for a service row: "Sunday service · Every week · Active". */
export const serviceSummary = (s: SchedulingServiceApi, t: (k: string) => string): string => {
  const parts: string[] = [s.name];
  const when: string[] = [];
  const wd = weekdayName(t, s.weekday);
  if (wd) when.push(wd);
  if (s.time) when.push(s.time);
  if (when.length) when.push('·');
  when.push(t(recurrenceKey(s.recurrence)));
  if (when.length) parts.push(when.join(' '));
  parts.push(s.active ? t('door.config.service.active') : t('door.music.retire'));
  return parts.join(' · ');
};

/** One line for a category row. */
export const categorySummary = (c: ChoirCategoryApi): string => c.description || c.code;

/** One line for a policy row. */
export const policySummary = (p: CategoryServicePolicyApi, t: (k: string) => string): string => {
  const parts: string[] = [
    t('door.config.policy.eligible') + ':',
    p.eligible ? t('door.config.policy.kind') : t('door.config.policy.kind'),
    t(frequencyKindKey(p.frequencyKind)),
  ];
  if (p.frequencyTarget !== null) parts.push(String(p.frequencyTarget));
  parts.push('·', t(planningModeKey(p.planningMode)));
  return parts.join(' ');
};

/** One line for a choir ↔ category link row. */
export const linkSummary = (l: ChoirCategoryLinkApi, t: (k: string) => string): string =>
  `${l.choirId} → ${l.categoryId} · ${l.active ? t('door.config.service.active') : t('door.music.retire')}`;

/** One line for a protocol rule row. */
export const ruleSummary = (r: ProtocolServiceRuleApi, t: (k: string) => string): string =>
  `${r.serviceId} · ${t('door.config.protocol.defaultTeamSize')}: ${r.defaultTeamSize} · ${r.required ? t('door.config.protocol.required') : t('door.config.protocol.rule')}`;

/** One line for a config version row. */
export const versionSummary = (v: ConfigVersionApi, t: (k: string) => string): string =>
  `${v.label} · ${t(configStatusKey(v.status))} · v${v.version}`;

/** The human name of a config version status. */
export const versionStatusName = (v: ConfigVersionApi, t: (k: string) => string): string => t(configStatusKey(v.status));

/** The human name of a service kind. */
export const serviceKindName = (k: SchedulingServiceApi['kind'], t: (k2: string) => string): string => t(serviceKindKey(k));

/** The human name of a recurrence. */
export const recurrenceName = (r: Recurrence, t: (k: string) => string): string => t(recurrenceKey(r));

/** The human name of a frequency-counting mode. */
export const frequencyCountingName = (c: CategoryServicePolicyApi['frequencyCounting'], t: (k: string) => string): string =>
  t(frequencyCountingKey(c));

/** The human name of a frequency-kind. */
export const frequencyKindName = (k: CategoryServicePolicyApi['frequencyKind'], t: (k2: string) => string): string =>
  t(frequencyKindKey(k));

/** The human name of a planning mode. */
export const planningModeName = (m: PlanningMode, t: (k: string) => string): string => t(planningModeKey(m));

/** The human name of an extra-duty policy. */
export const extraDutyPolicyName = (p: ProtocolDutyPolicyApi['extraDutyPolicy'], t: (k: string) => string): string =>
  t(extraDutyPolicyKey(p));