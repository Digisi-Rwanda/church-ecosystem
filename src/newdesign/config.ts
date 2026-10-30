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

type TFn = (k: MessageKey) => string;

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
  'protocol',
  'duty',
  'versions',
] as const;
export type ConfigTab = (typeof CONFIG_TABS)[number];

export const configTabKey = (tab: ConfigTab): MessageKey => `door.config.tab.${tab}`;

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
  parts.push(s.active ? t('door.config.service.active') : t('door.music.retire'));
  return parts.join(' · ');
};

/** One line for a category row. */
export const categorySummary = (c: ChoirCategoryApi): string => c.description || c.code;

/** One line for a policy row. */
export const policySummary = (p: CategoryServicePolicyApi, t: TFn): string => {
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
export const linkSummary = (l: ChoirCategoryLinkApi, t: TFn): string =>
  `${l.choirId} → ${l.categoryId} · ${l.active ? t('door.config.service.active') : t('door.music.retire')}`;

/** One line for a protocol rule row. */
export const ruleSummary = (r: ProtocolServiceRuleApi, t: TFn): string =>
  `${r.serviceId} · ${t('door.config.protocol.defaultTeamSize')}: ${r.defaultTeamSize} · ${r.required ? t('door.config.protocol.required') : t('door.config.protocol.rule')}`;

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
