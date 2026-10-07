/**
 * Music schedule documents (slice 3.16): the lifecycle helpers around the old engine.
 * A draft is generated and edited; months are confirmed (Protocol may plan against them) and
 * published (the choirs see them). Every change is logged with a readable summary.
 */
import type { MusicAssignment, MusicHorizon, MusicScheduleUnit, MusicServiceSlot } from './types.js';
import type { MusicEngineHistory } from './engine.js';

export interface MonthDoc {
  periodKey: string;
  state: 'CONFIRMED' | 'PUBLISHED';
  version: number;
  batchId?: string | null;
  batchHorizon?: string | null;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
}
export interface DraftDoc {
  id: string;
  label: string;
  horizon: MusicHorizon;
  startMonth: string;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
}
export interface LogChange { kind: 'ADDED' | 'REMOVED' | 'SERVICE_ADDED' | 'SERVICE_REMOVED' | 'RESCHEDULED'; serviceId: string; text: string }
export type LogAction = 'CONFIRMED' | 'RECONFIRMED' | 'PUBLISHED' | 'EDITED';

export const parse = <T>(json: string | null | undefined, fallback: T): T => {
  try {
    return json ? (JSON.parse(json) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** The register's choirs as units: a choir's id is its unit id, its role is its kind. */
export function unitsFrom(choirs: Array<{ id: string; name: string; role: string; active: boolean; systemId?: string | null }>): MusicScheduleUnit[] {
  return choirs.map((c) => ({
    id: c.id, kind: c.role as MusicScheduleUnit['kind'], name: c.name, active: c.active,
    systemId: (c.systemId === 'sys-worship' ? 'sys-worship' : 'sys-choir') as 'sys-choir' | 'sys-worship',
  }));
}

/** What the engine needs to rotate fairly: who served Tuesdays, Fridays and Igaburo in the months already decided. */
export function historyFrom(months: MonthDoc[], units: readonly MusicScheduleUnit[]): MusicEngineHistory {
  const hist: MusicEngineHistory = { tuesdayHistory: [], fridayHistory: [], igaburoPairs: [], igaburoByUnit: {} };
  const kindOf = new Map(units.map((u) => [u.id, u.kind]));
  for (const m of [...months].filter((x) => x.services.length > 0).sort((a, b) => a.periodKey.localeCompare(b.periodKey))) {
    const byDate = (kind: string) => m.services.filter((x) => x.kind === kind).sort((a, b) => a.date.localeCompare(b.date));
    for (const s of byDate('TUESDAY')) {
      const u = m.assignments.find((a) => a.serviceId === s.id && kindOf.get(a.unitId) !== 'WORSHIP');
      if (u) hist.tuesdayHistory.push(u.unitId);
    }
    for (const s of byDate('FRIDAY')) {
      const u = m.assignments.find((a) => a.serviceId === s.id);
      if (u) hist.fridayHistory.push(u.unitId);
    }
    for (const s of byDate('IGABURO')) {
      const ids = m.assignments.filter((a) => a.serviceId === s.id).map((a) => a.unitId).sort();
      if (ids.length === 2) {
        hist.igaburoPairs.push(ids);
        for (const u of ids) hist.igaburoByUnit[u] = [...(hist.igaburoByUnit[u] ?? []), s.date];
      }
    }
  }
  return hist;
}

export function fingerprint(startMonth: string, horizon: string, services: MusicServiceSlot[], assignments: MusicAssignment[]): string {
  const svc = services.map((s) => `${s.id}|${s.date}|${s.kind}`).sort().join(';');
  const asg = assignments.map((a) => `${a.serviceId}|${a.unitId}`).sort().join(';');
  return `${startMonth}|${horizon}|${svc}|${asg}`;
}

export const monthsOf = (services: MusicServiceSlot[]): string[] => [...new Set(services.map((s) => s.periodKey))].sort();

/** One month of a draft. */
export function sliceMonth(d: { services: MusicServiceSlot[]; assignments: MusicAssignment[] }, month: string) {
  const services = d.services.filter((s) => s.periodKey === month);
  const ids = new Set(services.map((s) => s.id));
  return { services, assignments: d.assignments.filter((a) => ids.has(a.serviceId)) };
}

const serviceText = (s: MusicServiceSlot) => `${s.label} ${s.date}`;

/** Row-level difference between two lineups of one month, in words. */
export function diffLineup(
  before: { services: MusicServiceSlot[]; assignments: MusicAssignment[] } | null,
  after: { services: MusicServiceSlot[]; assignments: MusicAssignment[] },
  nameOf: (unitId: string) => string,
): LogChange[] {
  const out: LogChange[] = [];
  const bSv = new Map((before?.services ?? []).map((x) => [x.id, x]));
  const aSv = new Map(after.services.map((x) => [x.id, x]));
  const pairs = (list: MusicAssignment[] | undefined) => new Set((list ?? []).map((a) => `${a.serviceId}|${a.unitId}`));
  const bP = pairs(before?.assignments);
  const aP = pairs(after.assignments);
  for (const [id, sv] of aSv) {
    const o = bSv.get(id);
    if (!o) out.push({ kind: 'SERVICE_ADDED', serviceId: id, text: `${serviceText(sv)} added` });
    else if (o.date !== sv.date || o.label !== sv.label) out.push({ kind: 'RESCHEDULED', serviceId: id, text: `${serviceText(o)} moved to ${serviceText(sv)}` });
  }
  for (const [id, sv] of bSv) if (!aSv.has(id)) out.push({ kind: 'SERVICE_REMOVED', serviceId: id, text: `${serviceText(sv)} removed` });
  const label = (id: string) => {
    const sv = aSv.get(id) ?? bSv.get(id);
    return sv ? serviceText(sv) : id;
  };
  for (const k of aP) {
    if (bP.has(k)) continue;
    const [serviceId, unitId] = k.split('|') as [string, string];
    out.push({ kind: 'ADDED', serviceId, text: `${nameOf(unitId)} added to ${label(serviceId)}` });
  }
  for (const k of bP) {
    if (aP.has(k)) continue;
    const [serviceId, unitId] = k.split('|') as [string, string];
    out.push({ kind: 'REMOVED', serviceId, text: `${nameOf(unitId)} removed from ${label(serviceId)}` });
  }
  return out;
}

export function summarise(action: LogAction, stage: string, changes: LogChange[]): string {
  if (changes.length === 0) {
    return action === 'EDITED'
      ? `Saved with no change to the choir lineup (${stage.toLowerCase()})`
      : action === 'PUBLISHED' ? 'Released to the choirs' : action === 'CONFIRMED' ? 'Confirmed by Music' : 'Confirmed again, same lineup';
  }
  const shown = changes.slice(0, 3).map((c) => c.text).join('; ');
  return changes.length > 3 ? `${shown}; and ${changes.length - 3} more` : shown;
}

/** The unit ids on a service. */
export const unitsOn = (assignments: MusicAssignment[], serviceId: string): string[] => assignments.filter((a) => a.serviceId === serviceId).map((a) => a.unitId);

/** Replace the lineup of one service, keeping every other service. */
export function withService(assignments: MusicAssignment[], serviceId: string, unitIds: string[]): MusicAssignment[] {
  const keep = assignments.filter((a) => a.serviceId !== serviceId);
  const old = new Map(assignments.filter((a) => a.serviceId === serviceId).map((a) => [a.unitId, a]));
  return [
    ...keep,
    ...[...new Set(unitIds)].map((unitId) => old.get(unitId) ?? { id: `masg-${serviceId}-${unitId}`, serviceId, unitId, source: 'MANUAL' as const }),
  ];
}
