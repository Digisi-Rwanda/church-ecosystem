import type {
  MusicAssignment,
  MusicChoirSchedule,
  MusicHorizon,
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
import { musicUnitName } from '../domain/musicUnits';

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

let DRAFTS: MusicScheduleDraft[] = [];
let PUBLISHED: MusicChoirSchedule[] = [];
let NOTIFS: MusicScheduleNotification[] = [];

/** Working canvas before save (not yet a draft). */
let CANVAS: {
  periodKey: string;
  horizon: MusicHorizon;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
} | null = null;

export const musicScheduleService = {
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
    return out;
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
    return CANVAS;
  },

  historyFromPublished(): MusicEngineHistory {
    const hist: MusicEngineHistory = {
      tuesdayHistory: [],
      fridayHistory: [],
      igaburoPairs: [],
      igaburoByUnit: {},
    };
    const ordered = [...PUBLISHED].sort((a, b) =>
      a.periodKey.localeCompare(b.periodKey),
    );
    for (const pub of ordered) {
      const byId = new Map(pub.services.map((s) => [s.id, s]));
      for (const s of pub.services
        .filter((x) => x.kind === 'TUESDAY')
        .sort((a, b) => a.date.localeCompare(b.date))) {
        const u = pub.assignments.find(
          (a) => a.serviceId === s.id && a.unitId !== 'mu-worship',
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
    const next = [
      ...rest,
      ...unitIds.map((unitId) => ({
        id: nid('masg'),
        serviceId,
        unitId,
        source: 'MANUAL' as const,
      })),
    ];
    const v = validateSchedule(CANVAS.services, next, 'manual');
    if (!v.ok) return { ok: false, reason: v.reason, warnings: v.warnings };
    CANVAS = { ...CANVAS, assignments: next, warnings: v.warnings };
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

  /**
   * Publish one draft as Choir schedule.
   * Deletes other drafts for that period. Notifies recipients.
   */
  publishDraft(
    draftId: string,
    personId: string,
    recipientPersonIds: string[],
  ): { ok: boolean; reason?: string; schedule?: MusicChoirSchedule } {
    const draft = this.getDraft(draftId);
    if (!draft) return { ok: false, reason: 'Draft not found' };
    const existing = this.getPublished(draft.periodKey);
    const schedule: MusicChoirSchedule = {
      id: existing?.id ?? nid('msch'),
      periodKey: draft.periodKey,
      horizon: draft.horizon,
      status: 'PUBLISHED',
      publishedAt: existing?.publishedAt ?? nowIso(),
      publishedByPersonId: existing?.publishedByPersonId ?? personId,
      updatedAt: nowIso(),
      updatedByPersonId: personId,
      version: (existing?.version ?? 0) + 1,
      services: structuredClone(draft.services),
      assignments: structuredClone(draft.assignments),
      warnings: [...draft.warnings],
    };
    PUBLISHED = PUBLISHED.filter((p) => p.periodKey !== draft.periodKey);
    PUBLISHED.unshift(schedule);
    DRAFTS = DRAFTS.filter((d) => d.periodKey !== draft.periodKey);
    this.notifyMany(recipientPersonIds, {
      kind: 'PUBLISHED',
      periodKey: schedule.periodKey,
      scheduleId: schedule.id,
      title: 'Choir schedule published',
      body: `Choir schedule for ${schedule.periodKey} is published (v${schedule.version}).`,
    });
    return { ok: true, schedule };
  },

  /** Edit published schedule; notify. Recipients only see latest. */
  updatePublished(
    periodKey: string,
    personId: string,
    assignments: MusicAssignment[],
    recipientPersonIds: string[],
  ): { ok: boolean; reason?: string; schedule?: MusicChoirSchedule; warnings?: string[] } {
    const pub = this.getPublished(periodKey);
    if (!pub) return { ok: false, reason: 'No published choir schedule' };
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
      p.periodKey === periodKey ? updated : p,
    );
    this.notifyMany(recipientPersonIds, {
      kind: 'UPDATED',
      periodKey,
      scheduleId: updated.id,
      title: 'Choir schedule updated',
      body: `Choir schedule for ${periodKey} was updated (v${updated.version}). Previous version replaced.`,
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
    const pub = this.getPublished(periodKey);
    if (!pub) return { ok: false as const, reason: 'No published choir schedule' };
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
    const pub = this.getPublished(periodKey);
    if (!pub) return { ok: false as const, reason: 'No published choir schedule' };
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
    const pub = this.getPublished(periodKey);
    if (!pub) return { ok: false as const, reason: 'No published choir schedule' };
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
    return assignments
      .filter((a) => a.serviceId === serviceId)
      .map((a) => a.unitId);
  },

  formatAssignmentLine(unitIds: string[]): string {
    return unitIds.map(musicUnitName).join(' · ') || '—';
  },

  /** Browser-local persistence snapshot. */
  exportLocalState() {
    return {
      drafts: DRAFTS,
      published: PUBLISHED,
      notifs: NOTIFS,
      canvas: CANVAS,
    };
  },

  importLocalState(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const s = raw as {
      drafts?: MusicScheduleDraft[];
      published?: MusicChoirSchedule[];
      notifs?: MusicScheduleNotification[];
      canvas?: typeof CANVAS;
    };
    if (Array.isArray(s.drafts)) DRAFTS = s.drafts;
    if (Array.isArray(s.published)) PUBLISHED = s.published;
    if (Array.isArray(s.notifs)) NOTIFS = s.notifs;
    if (s.canvas !== undefined) CANVAS = s.canvas ?? null;
  },

  /** Test helper — reset in-memory stores. */
  _resetForTests() {
    DRAFTS = [];
    PUBLISHED = [];
    NOTIFS = [];
    CANVAS = null;
  },
};
