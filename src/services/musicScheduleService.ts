import type {
  MusicAssignment,
  MusicChoirSchedule,
  MusicConfirmedBatch,
  MusicConfirmedMonth,
  MusicHorizon,
  MusicLogAction,
  MusicLogChange,
  MusicLogEntry,
  MusicMonthState,
  MusicMonthView,
  MusicScheduleDraft,
  MusicScheduleNotification,
  MusicScheduleNotifKind,
  MusicServiceSlot,
} from '../domain/musicSchedule';
import {
  buildMusicCalendar,
  generateMusicChoirSchedule,
  type MusicEngineHistory,
  validateSchedule,
} from '../domain/musicScheduleEngine';
import { scheduleLocalDomainPersist } from '../data/localDomainStore';
import {
  addMusicUnit,
  getMusicUnits,
  renameMusicUnit,
  setMusicUnitActive,
  musicUnitKind,
  musicUnitName,
  replaceMusicUnits,
  resetMusicUnits,
} from '../domain/musicUnits';

function touchCanvasPersist() {
  scheduleLocalDomainPersist();
}

function nid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Stable content key — same choirs on same services = same fingerprint. */
function scheduleFingerprint(
  periodKey: string,
  horizon: MusicHorizon,
  services: MusicServiceSlot[],
  assignments: MusicAssignment[],
): string {
  const svc = [...services]
    .map((s) => `${s.id}|${s.date}|${s.kind}`)
    .sort()
    .join(';');
  const asg = [...assignments]
    .map((a) => `${a.serviceId}|${a.unitId}`)
    .sort()
    .join(';');
  return `${periodKey}|${horizon}|${svc}|${asg}`;
}

export type MusicPublishedChange = {
  periodKey: string;
  version: number;
  /** BATCH_CONFIRMED: one event per confirm action, listing every month in it. */
  kind: 'PUBLISHED' | 'UPDATED' | 'CONFIRMED' | 'BATCH_CONFIRMED';
  months?: string[];
  horizon?: string;
  /** Set when this event has an entry in the change log (see listLog). */
  logId?: string;
  summary?: string;
  stage?: 'CONFIRMED' | 'PUBLISHED';
  byPersonId?: string;
};
type MusicChangeListener = (c: MusicPublishedChange) => void;
const CHANGE_LISTENERS: MusicChangeListener[] = [];

function emitPublishedChange(c: MusicPublishedChange) {
  for (const l of CHANGE_LISTENERS) {
    try {
      l(c);
    } catch {
      // A listener must never break publishing.
    }
  }
}

let DRAFTS: MusicScheduleDraft[] = [];
let PUBLISHED: MusicChoirSchedule[] = [];
let CONFIRMED: MusicConfirmedMonth[] = [];
let NOTIFS: MusicScheduleNotification[] = [];
/** Every confirm, publish and edit, newest first. Never trimmed by hand. */
let LOG: MusicLogEntry[] = [];
const LOG_LIMIT = 2000;

function serviceText(sv: MusicServiceSlot): string {
  return `${sv.label} ${sv.date}`;
}

/** Row-level difference between two lineups of the same month. */
function diffLineup(
  beforeServices: MusicServiceSlot[] | null,
  beforeAssign: MusicAssignment[] | null,
  afterServices: MusicServiceSlot[],
  afterAssign: MusicAssignment[],
): MusicLogChange[] {
  const out: MusicLogChange[] = [];
  const bSv = new Map((beforeServices ?? []).map((x) => [x.id, x]));
  const aSv = new Map(afterServices.map((x) => [x.id, x]));
  const pairs = (list: MusicAssignment[] | null) =>
    new Set((list ?? []).map((a) => `${a.serviceId}|${a.unitId}`));
  const bP = pairs(beforeAssign);
  const aP = pairs(afterAssign);
  for (const [id, sv] of aSv) {
    const o = bSv.get(id);
    if (!o) out.push({ kind: 'SERVICE_ADDED', serviceId: id, text: `${serviceText(sv)} added` });
    else if (o.date !== sv.date || o.label !== sv.label) {
      out.push({
        kind: 'RESCHEDULED',
        serviceId: id,
        text: `${serviceText(o)} moved to ${serviceText(sv)}`,
      });
    }
  }
  for (const [id, sv] of bSv) {
    if (!aSv.has(id)) out.push({ kind: 'SERVICE_REMOVED', serviceId: id, text: `${serviceText(sv)} removed` });
  }
  const label = (id: string) => {
    const sv = aSv.get(id) ?? bSv.get(id);
    return sv ? serviceText(sv) : id;
  };
  for (const k of aP) {
    if (bP.has(k)) continue;
    const [serviceId, unitId] = k.split('|') as [string, string];
    out.push({
      kind: 'ADDED',
      serviceId,
      text: `${musicUnitName(unitId)} added to ${label(serviceId)}`,
    });
  }
  for (const k of bP) {
    if (aP.has(k)) continue;
    const [serviceId, unitId] = k.split('|') as [string, string];
    out.push({
      kind: 'REMOVED',
      serviceId,
      text: `${musicUnitName(unitId)} removed from ${label(serviceId)}`,
    });
  }
  return out;
}

function summarise(action: MusicLogAction, stage: string, changes: MusicLogChange[]): string {
  if (changes.length === 0) {
    return action === 'EDITED'
      ? `Saved with no change to the choir lineup (${stage.toLowerCase()})`
      : action === 'PUBLISHED'
        ? 'Released to the choirs'
        : action === 'CONFIRMED'
          ? 'Confirmed by Music'
          : 'Confirmed again, same lineup';
  }
  const shown = changes.slice(0, 3).map((c) => c.text).join('; ');
  return changes.length > 3 ? `${shown}; and ${changes.length - 3} more` : shown;
}

function recordLog(input: {
  periodKey: string;
  stage: 'CONFIRMED' | 'PUBLISHED';
  action: MusicLogAction;
  version: number;
  byPersonId: string;
  changes: MusicLogChange[];
}): MusicLogEntry {
  const entry: MusicLogEntry = {
    id: nid('mlog'),
    at: nowIso(),
    ...input,
    summary: summarise(input.action, input.stage, input.changes),
  };
  LOG = [entry, ...LOG].slice(0, LOG_LIMIT);
  return entry;
}

/** Working canvas before save (not yet a draft). */
let CANVAS: {
  periodKey: string;
  horizon: MusicHorizon;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
} | null = null;

export const musicScheduleService = {
  /** Subscribe to published-schedule changes (Protocol watches this). */
  onPublishedChange(listener: MusicChangeListener): () => void {
    CHANGE_LISTENERS.push(listener);
    return () => {
      const i = CHANGE_LISTENERS.indexOf(listener);
      if (i >= 0) CHANGE_LISTENERS.splice(i, 1);
    };
  },

  // ---- Choir lineup (add / retire / rename; never delete) ----------------

  listUnits() {
    return getMusicUnits();
  },

  /** Published months whose schedule still uses this choir. */
  unitUsage(unitId: string): string[] {
    return [...PUBLISHED, ...CONFIRMED]
      .filter((p) => p.assignments.some((a) => a.unitId === unitId))
      .map((p) => p.periodKey)
      .sort();
  },

  addUnit(input: Parameters<typeof addMusicUnit>[0]) {
    const r = addMusicUnit(input);
    if (r.ok) touchCanvasPersist();
    return r;
  },

  setUnitActive(unitId: string, active: boolean) {
    const r = setMusicUnitActive(unitId, active);
    if (r.ok) touchCanvasPersist();
    return { ...r, stillUsedIn: active ? [] : this.unitUsage(unitId) };
  },

  renameUnit(unitId: string, name: string) {
    const r = renameMusicUnit(unitId, name);
    if (r.ok) touchCanvasPersist();
    return r;
  },

  liveMonthKey(): string {
    return currentMonthKey();
  },

  allowedMonths(): string[] {
    const base = currentMonthKey();
    const [y, m] = base.split('-').map(Number);
    const out: string[] = [];
    for (let i = -1; i < 14; i++) {
      const d = new Date(Date.UTC(y, m - 1 + i, 1));
      out.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
    for (const m of this.plannedMonths()) if (!out.includes(m)) out.push(m);
    return out.sort();
  },

  getCanvas() {
    return CANVAS;
  },

  clearCanvas() {
    CANVAS = null;
  },

  listDrafts(periodKey?: string): MusicScheduleDraft[] {
    return DRAFTS.filter((d) =>
      periodKey ? d.periodKey === periodKey : true,
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getDraft(id: string): MusicScheduleDraft | null {
    return DRAFTS.find((d) => d.id === id) ?? null;
  },

  deleteDraft(id: string): boolean {
    const n = DRAFTS.length;
    DRAFTS = DRAFTS.filter((d) => d.id !== id);
    return DRAFTS.length < n;
  },

  getPublished(periodKey: string): MusicChoirSchedule | null {
    return PUBLISHED.find((p) => p.periodKey === periodKey) ?? null;
  },

  /**
   * The published schedule that covers a month. A quarter/half/year schedule is
   * stored under its first month but also covers the later ones.
   */
  getPublishedForMonth(monthKey: string): MusicChoirSchedule | null {
    return (
      PUBLISHED.find((p) => p.periodKey === monthKey) ??
      PUBLISHED.find((p) => p.services.some((s) => s.periodKey === monthKey)) ??
      null
    );
  },

  /** Every month that has a published Music schedule (sorted). */
  publishedMonths(): string[] {
    const out = new Set<string>();
    for (const p of PUBLISHED) {
      out.add(p.periodKey);
      for (const s of p.services) out.add(s.periodKey);
    }
    return [...out].sort();
  },

  // ---- Confirmed months (planned with Protocol, not yet released) --------

  getConfirmed(monthKey: string): MusicConfirmedMonth | null {
    return CONFIRMED.find((c) => c.periodKey === monthKey) ?? null;
  },

  listConfirmed(): MusicConfirmedMonth[] {
    return [...CONFIRMED].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  },

  confirmedMonths(): string[] {
    return this.listConfirmed().map((c) => c.periodKey);
  },

  monthState(monthKey: string): MusicMonthState {
    if (this.getPublishedForMonth(monthKey)) return 'PUBLISHED';
    if (this.getConfirmed(monthKey)) return 'CONFIRMED';
    return 'NONE';
  },

  /**
   * What Protocol plans against: the published schedule for the month, or the
   * confirmed one when Music has locked the month but not released it yet.
   */
  getPlannedForMonth(monthKey: string): MusicMonthView | null {
    const pub = this.getPublishedForMonth(monthKey);
    if (pub) return { ...pub, musicState: 'PUBLISHED' };
    const c = this.getConfirmed(monthKey);
    if (!c) return null;
    return {
      id: c.id,
      periodKey: c.periodKey,
      horizon: 'MONTH',
      status: 'PUBLISHED',
      publishedAt: c.confirmedAt,
      publishedByPersonId: c.confirmedByPersonId,
      updatedAt: c.updatedAt,
      updatedByPersonId: c.updatedByPersonId,
      version: c.version,
      services: c.services,
      assignments: c.assignments,
      warnings: c.warnings,
      musicState: 'CONFIRMED',
    };
  },

  /**
   * Confirmed drafts still being released: each batch is the span that was
   * generated (month, quarter, half year or year) with the state of every month.
   */
  listBatches(): MusicConfirmedBatch[] {
    const ids = [...new Set(CONFIRMED.map((c) => c.batchId).filter(Boolean))] as string[];
    return ids
      .map((batchId) => {
        const conf = CONFIRMED.filter((c) => c.batchId === batchId);
        const pub = PUBLISHED.filter((p) => p.batchId === batchId);
        const months = [
          ...conf.map((c) => ({
            month: c.periodKey,
            state: 'CONFIRMED' as const,
            version: c.version,
          })),
          ...pub.map((p) => ({
            month: p.periodKey,
            state: 'PUBLISHED' as const,
            version: p.version,
          })),
        ].sort((a, b) => a.month.localeCompare(b.month));
        return {
          batchId,
          horizon: (conf[0].batchHorizon ?? 'MONTH') as MusicHorizon,
          months,
          publishedCount: pub.length,
          total: months.length,
        };
      })
      .sort((a, b) => a.months[0].month.localeCompare(b.months[0].month));
  },

  /** Published or confirmed months, sorted. */
  plannedMonths(): string[] {
    return [
      ...new Set([...this.publishedMonths(), ...this.confirmedMonths()]),
    ].sort();
  },

  /** Months a draft covers, sorted. */
  draftMonths(draftId: string): string[] {
    const d = this.getDraft(draftId);
    if (!d) return [];
    return [...new Set(d.services.map((s) => s.periodKey))].sort();
  },

  /**
   * Demo bootstrap: if no published choir schedule exists for the period,
   * build a calendar, generate assignments, and publish in-memory.
   */
  ensureDemoPublished(periodKey = '2026-09'): MusicChoirSchedule {
    const existing = this.getPublished(periodKey);
    if (existing) return existing;

    const services = buildMusicCalendar(periodKey, 'MONTH');
    const generated = generateMusicChoirSchedule({
      services,
      history: this.historyFromPublished(),
      seed: 20260901,
    });
    const at = nowIso();
    const schedule: MusicChoirSchedule = {
      id: nid('msch'),
      periodKey,
      horizon: 'MONTH',
      status: 'PUBLISHED',
      publishedAt: at,
      publishedByPersonId: 'p-music',
      updatedAt: at,
      version: 1,
      services,
      assignments: generated.assignments,
      warnings: generated.ok
        ? generated.warnings
        : [
            ...(generated.reason ? [generated.reason] : []),
            ...generated.warnings,
          ],
    };
    PUBLISHED.unshift(schedule);
    return schedule;
  },

  listPublished(): MusicChoirSchedule[] {
    return [...PUBLISHED].sort((a, b) =>
      b.periodKey.localeCompare(a.periodKey),
    );
  },

  /** Step 1 — build empty service calendar on canvas. */
  buildCalendar(periodKey: string, horizon: MusicHorizon = 'MONTH') {
    const services = buildMusicCalendar(periodKey, horizon);
    CANVAS = {
      periodKey,
      horizon,
      services,
      assignments: [],
      warnings: [],
    };
    touchCanvasPersist();
    return CANVAS;
  },

  historyFromPublished(): MusicEngineHistory {
    const hist: MusicEngineHistory = {
      tuesdayHistory: [],
      fridayHistory: [],
      igaburoPairs: [],
      igaburoByUnit: {},
    };
    const ordered = [...PUBLISHED, ...CONFIRMED]
      .filter((p) => p.services.length > 0)
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
    for (const pub of ordered) {
      const byId = new Map(pub.services.map((s) => [s.id, s]));
      for (const s of pub.services
        .filter((x) => x.kind === 'TUESDAY')
        .sort((a, b) => a.date.localeCompare(b.date))) {
        const u = pub.assignments.find(
          (a) => a.serviceId === s.id && musicUnitKind(a.unitId) !== 'WORSHIP',
        );
        if (u) hist.tuesdayHistory.push(u.unitId);
      }
      for (const s of pub.services
        .filter((x) => x.kind === 'FRIDAY')
        .sort((a, b) => a.date.localeCompare(b.date))) {
        const u = pub.assignments.find((a) => a.serviceId === s.id);
        if (u) hist.fridayHistory.push(u.unitId);
      }
      for (const s of pub.services.filter((x) => x.kind === 'IGABURO')) {
        const units = pub.assignments
          .filter((a) => a.serviceId === s.id)
          .map((a) => a.unitId)
          .sort();
        if (units.length === 2) {
          hist.igaburoPairs.push(units);
          for (const u of units) {
            hist.igaburoByUnit[u] = [
              ...(hist.igaburoByUnit[u] ?? []),
              s.date,
            ];
          }
        }
      }
      void byId;
    }
    return hist;
  },

  /** Step 2 — generate / regenerate choir assignments on canvas. */
  buildChoirSchedule(): {
    ok: boolean;
    reason?: string;
    warnings: string[];
  } {
    if (!CANVAS || CANVAS.services.length === 0) {
      return { ok: false, reason: 'Build the service calendar first', warnings: [] };
    }
    const result = generateMusicChoirSchedule({
      services: CANVAS.services,
      history: this.historyFromPublished(),
    });
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? 'Generation failed',
        warnings: result.warnings,
      };
    }
    CANVAS = {
      ...CANVAS,
      assignments: result.assignments,
      warnings: result.warnings,
    };
    touchCanvasPersist();
    return { ok: true, warnings: result.warnings };
  },

  /** Manual swap / set assignment on canvas (engine or after generate). */
  setCanvasAssignment(
    serviceId: string,
    unitIds: string[],
  ): { ok: boolean; reason?: string; warnings?: string[] } {
    if (!CANVAS) return { ok: false, reason: 'No canvas' };
    const svc = CANVAS.services.find((s) => s.id === serviceId);
    if (!svc) return { ok: false, reason: 'Unknown service' };
    const rest = CANVAS.assignments.filter((a) => a.serviceId !== serviceId);
    const uniqueUnitIds = [...new Set(unitIds)];
    const next = [
      ...rest,
      ...uniqueUnitIds.map((unitId) => ({
        id: nid('masg'),
        serviceId,
        unitId,
        source: 'MANUAL' as const,
      })),
    ];
    const v = validateSchedule(CANVAS.services, next, 'manual');
    if (!v.ok) return { ok: false, reason: v.reason, warnings: v.warnings };
    CANVAS = { ...CANVAS, assignments: next, warnings: v.warnings };
    touchCanvasPersist();
    return { ok: true, warnings: v.warnings };
  },

  removeCanvasUnit(
    serviceId: string,
    unitId: string,
  ): { ok: boolean; reason?: string; warnings?: string[] } {
    if (!CANVAS) return { ok: false, reason: 'No canvas' };
    const units = this.assignmentsForService(CANVAS.assignments, serviceId).filter(
      (id) => id !== unitId,
    );
    return this.setCanvasAssignment(serviceId, units);
  },

  replaceCanvasUnit(
    serviceId: string,
    fromUnitId: string,
    toUnitId: string,
  ): { ok: boolean; reason?: string; warnings?: string[] } {
    if (!CANVAS) return { ok: false, reason: 'No canvas' };
    const units = this.assignmentsForService(CANVAS.assignments, serviceId);
    if (!units.includes(fromUnitId)) {
      return { ok: false, reason: 'Choir not on this service' };
    }
    if (units.includes(toUnitId) && toUnitId !== fromUnitId) {
      return { ok: false, reason: 'Replacement choir already scheduled' };
    }
    const next = units.map((id) => (id === fromUnitId ? toUnitId : id));
    return this.setCanvasAssignment(serviceId, next);
  },

  addCanvasUnit(
    serviceId: string,
    unitId: string,
  ): { ok: boolean; reason?: string; warnings?: string[] } {
    if (!CANVAS) return { ok: false, reason: 'No canvas' };
    const units = this.assignmentsForService(CANVAS.assignments, serviceId);
    if (units.includes(unitId)) {
      return { ok: false, reason: 'Choir already scheduled' };
    }
    return this.setCanvasAssignment(serviceId, [...units, unitId]);
  },

  /** Step 3 — save immutable draft (rejects duplicates of existing drafts). */
  saveDraft(personId: string, label?: string): {
    ok: boolean;
    reason?: string;
    draft?: MusicScheduleDraft;
  } {
    if (!CANVAS || CANVAS.assignments.length === 0) {
      return { ok: false, reason: 'Generate a choir schedule before saving' };
    }
    const v = validateSchedule(CANVAS.services, CANVAS.assignments);
    if (!v.ok) return { ok: false, reason: v.reason };

    const fingerprint = scheduleFingerprint(
      CANVAS.periodKey,
      CANVAS.horizon,
      CANVAS.services,
      CANVAS.assignments,
    );
    const duplicate = DRAFTS.find(
      (d) =>
        scheduleFingerprint(
          d.periodKey,
          d.horizon,
          d.services,
          d.assignments,
        ) === fingerprint,
    );
    if (duplicate) {
      return {
        ok: false,
        reason: `Same schedule as “${duplicate.label}”. Rebuild or change a choir before saving again.`,
      };
    }

    const draft: MusicScheduleDraft = {
      id: nid('mdraft'),
      periodKey: CANVAS.periodKey,
      horizon: CANVAS.horizon,
      label:
        label?.trim() ||
        `Draft ${CANVAS.periodKey} · ${new Date().toLocaleString()}`,
      status: 'DRAFT',
      createdAt: nowIso(),
      createdByPersonId: personId,
      services: structuredClone(CANVAS.services),
      assignments: structuredClone(CANVAS.assignments),
      warnings: [...CANVAS.warnings, ...v.warnings],
    };
    DRAFTS.unshift(draft);
    return { ok: true, draft };
  },

  /** One month of a draft. */
  sliceDraftMonth(draft: MusicScheduleDraft, monthKey: string) {
    const services = draft.services.filter((x) => x.periodKey === monthKey);
    const ids = new Set(services.map((x) => x.id));
    return {
      services: structuredClone(services),
      assignments: structuredClone(
        draft.assignments.filter((x) => ids.has(x.serviceId)),
      ),
    };
  },

  /** Take confirmed/published months out of every draft (drop emptied drafts). */
  _removeMonthsFromDrafts(months: string[]) {
    const gone = new Set(months);
    DRAFTS = DRAFTS.flatMap((d) => {
      const services = d.services.filter((x) => !gone.has(x.periodKey));
      if (services.length === 0) return [];
      if (services.length === d.services.length) return [d];
      const ids = new Set(services.map((x) => x.id));
      return [
        {
          ...d,
          services,
          assignments: d.assignments.filter((x) => ids.has(x.serviceId)),
        },
      ];
    });
  },

  /**
   * Confirm months of a draft: Music approves them and locks them for planning.
   * Protocol can now build against them; the choirs cannot see them yet.
   * Confirmed months leave the draft, so the draft keeps only what is undecided.
   */
  confirmDraftMonths(
    draftId: string,
    personId: string,
    months?: string[],
  ): {
    ok: boolean;
    reason?: string;
    confirmed?: MusicConfirmedMonth[];
  } {
    const draft = this.getDraft(draftId);
    if (!draft) return { ok: false, reason: 'Draft not found' };
    const have = this.draftMonths(draftId);
    const chosen = [...new Set(months ?? have)].sort();
    if (chosen.length === 0) return { ok: false, reason: 'Pick at least one month' };
    const unknown = chosen.filter((m) => !have.includes(m));
    if (unknown.length) {
      return { ok: false, reason: `Not in this draft: ${unknown.join(', ')}` };
    }
    const published = chosen.filter((m) => this.getPublishedForMonth(m));
    if (published.length) {
      return {
        ok: false,
        reason: `Already published: ${published.join(', ')}. Edit the published month instead.`,
      };
    }
    const confirmed: MusicConfirmedMonth[] = [];
    const at = nowIso();
    const batchId = nid('mbatch');
    for (const month of chosen) {
      const slice = this.sliceDraftMonth(draft, month);
      if (slice.assignments.length === 0) {
        return { ok: false, reason: `${month} has no choirs assigned yet` };
      }
      const existing = this.getConfirmed(month);
      const next: MusicConfirmedMonth = {
        id: existing?.id ?? nid('mcon'),
        periodKey: month,
        status: 'CONFIRMED',
        batchId,
        batchHorizon: draft.horizon,
        confirmedAt: existing?.confirmedAt ?? at,
        confirmedByPersonId: existing?.confirmedByPersonId ?? personId,
        updatedAt: at,
        updatedByPersonId: personId,
        version: (existing?.version ?? 0) + 1,
        services: slice.services,
        assignments: slice.assignments,
        warnings: [...draft.warnings],
      };
      CONFIRMED = [...CONFIRMED.filter((c) => c.periodKey !== month), next];
      confirmed.push(next);
      recordLog({
        periodKey: month,
        stage: 'CONFIRMED',
        action: existing ? 'RECONFIRMED' : 'CONFIRMED',
        version: next.version,
        byPersonId: personId,
        changes: existing
          ? diffLineup(existing.services, existing.assignments, next.services, next.assignments)
          : [],
      });
    }
    this._removeMonthsFromDrafts(chosen);
    touchCanvasPersist();
    for (const c of confirmed) {
      emitPublishedChange({
        periodKey: c.periodKey,
        version: c.version,
        kind: c.version > 1 ? 'UPDATED' : 'CONFIRMED',
      });
    }
    emitPublishedChange({
      periodKey: chosen[0]!,
      version: 0,
      kind: 'BATCH_CONFIRMED',
      months: chosen,
      horizon: draft.horizon,
    });
    return { ok: true, confirmed };
  },

  /** Release confirmed months to the choirs (one month at a time, or several). */
  publishMonths(
    months: string[],
    personId: string,
    recipientPersonIds: string[],
  ): { ok: boolean; reason?: string; published?: MusicChoirSchedule[] } {
    const chosen = [...new Set(months)].sort();
    if (chosen.length === 0) return { ok: false, reason: 'Pick at least one month' };
    const missing = chosen.filter((m) => !this.getConfirmed(m));
    if (missing.length) {
      return {
        ok: false,
        reason: `Confirm first: ${missing.join(', ')} (only confirmed months can be published)`,
      };
    }
    const out: MusicChoirSchedule[] = [];
    const logIds = new Map<string, MusicLogEntry>();
    for (const month of chosen) {
      const c = this.getConfirmed(month)!;
      const at = nowIso();
      const schedule: MusicChoirSchedule = {
        id: c.id,
        periodKey: month,
        horizon: 'MONTH',
        status: 'PUBLISHED',
        batchId: c.batchId,
        batchHorizon: c.batchHorizon,
        publishedAt: at,
        publishedByPersonId: personId,
        updatedAt: at,
        updatedByPersonId: personId,
        // Same content as the confirmed month, so Protocol sees no change.
        version: c.version,
        services: structuredClone(c.services),
        assignments: structuredClone(c.assignments),
        warnings: [...c.warnings],
      };
      PUBLISHED = [schedule, ...PUBLISHED.filter((p) => p.periodKey !== month)];
      CONFIRMED = CONFIRMED.filter((x) => x.periodKey !== month);
      out.push(schedule);
      logIds.set(
        month,
        recordLog({
          periodKey: month,
          stage: 'PUBLISHED',
          action: 'PUBLISHED',
          version: schedule.version,
          byPersonId: personId,
          changes: [],
        }),
      );
      this.notifyMany(recipientPersonIds, {
        kind: 'PUBLISHED',
        periodKey: month,
        scheduleId: schedule.id,
        title: 'Choir schedule published',
        body: `Choir schedule for ${month} is published (v${schedule.version}).`,
      });
    }
    touchCanvasPersist();
    for (const s of out) {
      const l = logIds.get(s.periodKey)!;
      emitPublishedChange({
        periodKey: s.periodKey,
        version: s.version,
        kind: 'PUBLISHED',
        logId: l.id,
        summary: l.summary,
        stage: 'PUBLISHED',
        byPersonId: personId,
      });
    }
    return { ok: true, published: out };
  },

  /**
   * Publish a whole draft in one go: confirms every month of it and releases
   * them all. Months that are already published are replaced (version + 1).
   * For a staged release use confirmDraftMonths + publishMonths instead.
   */
  publishDraft(
    draftId: string,
    personId: string,
    recipientPersonIds: string[],
  ): { ok: boolean; reason?: string; schedule?: MusicChoirSchedule } {
    const draft = this.getDraft(draftId);
    if (!draft) return { ok: false, reason: 'Draft not found' };
    const months = this.draftMonths(draftId);
    const already = months.filter((m) => this.getPublished(m));
    const fresh = months.filter((m) => !already.includes(m));
    const replaced: MusicChoirSchedule[] = [];
    const replacedLogs = new Map<string, MusicLogEntry>();
    for (const month of already) {
      const existing = this.getPublished(month)!;
      const slice = this.sliceDraftMonth(draft, month);
      const at = nowIso();
      const schedule: MusicChoirSchedule = {
        ...existing,
        id: existing.id,
        periodKey: month,
        horizon: 'MONTH',
        services: slice.services,
        assignments: slice.assignments,
        warnings: [...draft.warnings],
        updatedAt: at,
        updatedByPersonId: personId,
        version: existing.version + 1,
      };
      PUBLISHED = [schedule, ...PUBLISHED.filter((p) => p.id !== existing.id)];
      replaced.push(schedule);
      replacedLogs.set(
        month,
        recordLog({
          periodKey: month,
          stage: 'PUBLISHED',
          action: 'EDITED',
          version: schedule.version,
          byPersonId: personId,
          changes: diffLineup(existing.services, existing.assignments, schedule.services, schedule.assignments),
        }),
      );
      this.notifyMany(recipientPersonIds, {
        kind: 'PUBLISHED',
        periodKey: month,
        scheduleId: schedule.id,
        title: 'Choir schedule published',
        body: `Choir schedule for ${month} is published (v${schedule.version}).`,
      });
    }
    if (fresh.length) {
      const c = this.confirmDraftMonths(draftId, personId, fresh);
      if (!c.ok) return { ok: false, reason: c.reason };
      const p = this.publishMonths(fresh, personId, recipientPersonIds);
      if (!p.ok) return { ok: false, reason: p.reason };
    }
    this._removeMonthsFromDrafts(months);
    touchCanvasPersist();
    for (const s of replaced) {
      const l = replacedLogs.get(s.periodKey);
      emitPublishedChange({
        periodKey: s.periodKey,
        version: s.version,
        kind: 'PUBLISHED',
        ...(l ? { logId: l.id, summary: l.summary, stage: 'PUBLISHED' as const, byPersonId: personId } : {}),
      });
    }
    const schedule = this.getPublishedForMonth(months[0]) ?? undefined;
    return { ok: true, schedule };
  },

  /**
   * Edit a month's schedule: the published one (choirs are notified) or, if
   * Music has only confirmed it, the confirmed one (nobody outside is told,
   * but Protocol's Music-change banner reacts).
   */
  updatePublished(
    periodKey: string,
    personId: string,
    assignments: MusicAssignment[],
    recipientPersonIds: string[],
  ): { ok: boolean; reason?: string; schedule?: MusicChoirSchedule; warnings?: string[] } {
    const pub = this.getPublished(periodKey);
    if (!pub) {
      const conf = this.getConfirmed(periodKey);
      if (!conf) return { ok: false, reason: 'No choir schedule for this month' };
      const vc = validateSchedule(conf.services, assignments, 'manual');
      if (!vc.ok) return { ok: false, reason: vc.reason, warnings: vc.warnings };
      const next: MusicConfirmedMonth = {
        ...conf,
        assignments: structuredClone(assignments),
        warnings: vc.warnings,
        updatedAt: nowIso(),
        updatedByPersonId: personId,
        version: conf.version + 1,
      };
      CONFIRMED = CONFIRMED.map((c) => (c.periodKey === periodKey ? next : c));
      const entry = recordLog({
        periodKey,
        stage: 'CONFIRMED',
        action: 'EDITED',
        version: next.version,
        byPersonId: personId,
        changes: diffLineup(conf.services, conf.assignments, next.services, next.assignments),
      });
      touchCanvasPersist();
      emitPublishedChange({
        periodKey,
        version: next.version,
        kind: 'UPDATED',
        logId: entry.id,
        summary: entry.summary,
        stage: 'CONFIRMED',
        byPersonId: personId,
      });
      const view = this.getPlannedForMonth(periodKey)!;
      return { ok: true, schedule: view, warnings: vc.warnings };
    }
    const v = validateSchedule(pub.services, assignments, 'manual');
    if (!v.ok) return { ok: false, reason: v.reason, warnings: v.warnings };
    const updated: MusicChoirSchedule = {
      ...pub,
      assignments: structuredClone(assignments),
      warnings: v.warnings,
      updatedAt: nowIso(),
      updatedByPersonId: personId,
      version: pub.version + 1,
    };
    PUBLISHED = PUBLISHED.map((p) =>
      p.id === pub.id ? updated : p,
    );
    const entry = recordLog({
      periodKey,
      stage: 'PUBLISHED',
      action: 'EDITED',
      version: updated.version,
      byPersonId: personId,
      changes: diffLineup(pub.services, pub.assignments, updated.services, updated.assignments),
    });
    touchCanvasPersist();
    this.notifyMany(recipientPersonIds, {
      kind: 'UPDATED',
      periodKey,
      scheduleId: updated.id,
      title: 'Choir schedule updated',
      body: `Choir schedule for ${periodKey} was updated (v${updated.version}). Previous version replaced.`,
    });
    emitPublishedChange({
      periodKey,
      version: updated.version,
      kind: 'UPDATED',
      logId: entry.id,
      summary: entry.summary,
      stage: 'PUBLISHED',
      byPersonId: personId,
    });
    return { ok: true, schedule: updated, warnings: v.warnings };
  },

  removePublishedUnit(
    periodKey: string,
    personId: string,
    serviceId: string,
    unitId: string,
    recipientPersonIds: string[],
  ) {
    const pub = this.getPlannedForMonth(periodKey);
    if (!pub) return { ok: false as const, reason: 'No choir schedule for this month' };
    const units = this.assignmentsForService(pub.assignments, serviceId).filter(
      (id) => id !== unitId,
    );
    const rest = pub.assignments.filter((a) => a.serviceId !== serviceId);
    const next = [
      ...rest,
      ...units.map((uid) => ({
        id: nid('masg'),
        serviceId,
        unitId: uid,
        source: 'MANUAL' as const,
      })),
    ];
    return this.updatePublished(periodKey, personId, next, recipientPersonIds);
  },

  replacePublishedUnit(
    periodKey: string,
    personId: string,
    serviceId: string,
    fromUnitId: string,
    toUnitId: string,
    recipientPersonIds: string[],
  ) {
    const pub = this.getPlannedForMonth(periodKey);
    if (!pub) return { ok: false as const, reason: 'No choir schedule for this month' };
    const units = this.assignmentsForService(pub.assignments, serviceId);
    if (!units.includes(fromUnitId)) {
      return { ok: false as const, reason: 'Choir not on this service' };
    }
    if (units.includes(toUnitId) && toUnitId !== fromUnitId) {
      return { ok: false as const, reason: 'Replacement choir already scheduled' };
    }
    const nextUnits = units.map((id) => (id === fromUnitId ? toUnitId : id));
    const rest = pub.assignments.filter((a) => a.serviceId !== serviceId);
    const next = [
      ...rest,
      ...nextUnits.map((uid) => ({
        id: nid('masg'),
        serviceId,
        unitId: uid,
        source: 'MANUAL' as const,
      })),
    ];
    return this.updatePublished(periodKey, personId, next, recipientPersonIds);
  },

  addPublishedUnit(
    periodKey: string,
    personId: string,
    serviceId: string,
    unitId: string,
    recipientPersonIds: string[],
  ) {
    const pub = this.getPlannedForMonth(periodKey);
    if (!pub) return { ok: false as const, reason: 'No choir schedule for this month' };
    const units = this.assignmentsForService(pub.assignments, serviceId);
    if (units.includes(unitId)) {
      return { ok: false as const, reason: 'Choir already scheduled' };
    }
    const rest = pub.assignments.filter((a) => a.serviceId !== serviceId);
    const next = [
      ...rest,
      ...[...units, unitId].map((uid) => ({
        id: nid('masg'),
        serviceId,
        unitId: uid,
        source: 'MANUAL' as const,
      })),
    ];
    return this.updatePublished(periodKey, personId, next, recipientPersonIds);
  },

  notifyMany(
    personIds: string[],
    input: {
      kind: MusicScheduleNotifKind;
      periodKey: string;
      scheduleId: string;
      title: string;
      body: string;
    },
  ) {
    const unique = [...new Set(personIds.filter(Boolean))];
    for (const personId of unique) {
      NOTIFS.unshift({
        id: nid('mnot'),
        personId,
        kind: input.kind,
        periodKey: input.periodKey,
        scheduleId: input.scheduleId,
        title: input.title,
        body: input.body,
        createdAt: nowIso(),
      });
    }
  },

  /** The permanent trail of confirms, releases and edits, newest first. */
  listLog(periodKey?: string): MusicLogEntry[] {
    return LOG.filter((e) => !periodKey || e.periodKey === periodKey);
  },

  listNotifications(personId: string): MusicScheduleNotification[] {
    return NOTIFS.filter((n) => n.personId === personId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  unreadCount(personId: string): number {
    return NOTIFS.filter((n) => n.personId === personId && !n.readAt).length;
  },

  markRead(id: string, personId: string) {
    const n = NOTIFS.find((x) => x.id === id && x.personId === personId);
    if (n) n.readAt = nowIso();
  },

  /** Recipients: choir/worship context leaders + church pastor/AP/secretary. */
  resolvePublishRecipients(allPeopleIds: {
    churchLeaderIds: string[];
    musicLeaderIds: string[];
  }): string[] {
    return [
      ...new Set([
        ...allPeopleIds.churchLeaderIds,
        ...allPeopleIds.musicLeaderIds,
      ]),
    ];
  },

  assignmentsForService(
    assignments: MusicAssignment[],
    serviceId: string,
  ): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of assignments) {
      if (a.serviceId !== serviceId) continue;
      if (seen.has(a.unitId)) continue;
      seen.add(a.unitId);
      out.push(a.unitId);
    }
    return out;
  },

  formatAssignmentLine(unitIds: string[]): string {
    return unitIds.map(musicUnitName).join(' · ') || '—';
  },

  /** Browser-local persistence snapshot. */
  exportLocalState() {
    return {
      drafts: DRAFTS,
      published: PUBLISHED,
      confirmed: CONFIRMED,
      notifs: NOTIFS,
      log: LOG,
      canvas: CANVAS,
      units: getMusicUnits(),
    };
  },

  importLocalState(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const s = raw as {
      drafts?: MusicScheduleDraft[];
      published?: MusicChoirSchedule[];
      confirmed?: MusicConfirmedMonth[];
      notifs?: MusicScheduleNotification[];
      log?: MusicLogEntry[];
      canvas?: typeof CANVAS;
      units?: Parameters<typeof replaceMusicUnits>[0];
    };
    if (Array.isArray(s.drafts)) DRAFTS = s.drafts;
    if (Array.isArray(s.published)) PUBLISHED = s.published;
    if (Array.isArray(s.confirmed)) CONFIRMED = s.confirmed;
    if (Array.isArray(s.notifs)) NOTIFS = s.notifs;
    if (Array.isArray(s.log)) LOG = s.log;
    if (s.canvas !== undefined) CANVAS = s.canvas ?? null;
    if (s.units !== undefined) replaceMusicUnits(s.units);
  },

  /** Test helper — reset in-memory stores. */
  _resetForTests() {
    DRAFTS = [];
    PUBLISHED = [];
    CONFIRMED = [];
    NOTIFS = [];
    LOG = [];
    CANVAS = null;
    resetMusicUnits();
  },
};
