/**
 * Central Administration home (slice 2.4): what needs the leaders now (Urgent), how every
 * system is doing (Oversight), and the reports systems have sent in (Reports received, empty
 * until the template systems report in Phase 3). Read-only; every figure comes from the same
 * records and letters the other screens use, so nothing here can disagree with them.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { loadSettings } from '../settings/store.js';
import { computeVacancies } from '../lib/appointments.js';
import { canRead, mayApprove } from '../governance/rules.js';
import { canSend } from '../letters/rules.js';

export const centralRouter = Router();

/** Central Administration is the main church's own system. */
export const CENTRAL_SYSTEM = 'sys-main';
export const URGENT_MAX = 40;

interface UnitRow { id: string; name: string; kind?: string | null; code?: string | null; systemId?: string | null }
interface SystemRow { id: string; name?: string | null; shortName?: string | null }
interface MeetingRow { id: string; systemId: string; orgUnitId: string; title: string; scheduledAt: Date | string; status: string }
interface DecisionRow { id: string; systemId: string; orgUnitId: string; title: string; status: string; createdById: string; createdAt: Date | string }
interface LetterRow { id: string; systemId: string; orgUnitId: string; reference: string; subject: string; status: string; printedAt?: Date | string | null; createdAt: Date | string }

const at = (v: Date | string) => (v instanceof Date ? v : new Date(v)).getTime();

export type UrgentKind = 'DECISION_TO_APPROVE' | 'MEETING_OVERDUE' | 'LETTER_TO_DELIVER' | 'LETTER_TO_PRINT' | 'VACANCY' | 'TERM_ENDING';
const PRIORITY: Record<UrgentKind, number> = {
  DECISION_TO_APPROVE: 0,
  LETTER_TO_DELIVER: 1,
  LETTER_TO_PRINT: 2,
  MEETING_OVERDUE: 3,
  VACANCY: 4,
  TERM_ENDING: 5,
};

centralRouter.get('/overview', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const now = new Date();
  const { data, units } = await loadAccessData(me);
  // The home is for those who run the church: it needs Governance in the main church.
  if (!canRead(me, CENTRAL_SYSTEM, data, now)) {
    return res.status(403).json({ error: 'You may not open Central Administration', code: 'NOT_ALLOWED' });
  }
  const settings = await loadSettings();
  const allUnits = units as UnitRow[];
  const systems = (await prisma.churchSystem.findMany()) as SystemRow[];
  const readable = systems.filter((s) => canRead(me, s.id, data, now));
  const systemName = (id: string) => {
    const s = systems.find((x) => x.id === id);
    return s?.name || s?.shortName || id;
  };
  const unitName = (id: string) => allUnits.find((u) => u.id === id)?.name ?? '';
  const open = (id: string) => readable.some((s) => s.id === id);

  const meetings = ((await prisma.meeting.findMany()) as MeetingRow[]).filter((m) => open(m.systemId));
  const decisions = ((await prisma.decision.findMany()) as DecisionRow[]).filter((d) => open(d.systemId));
  const letters = ((await prisma.letter.findMany()) as LetterRow[]).filter((l) => open(l.systemId));
  const { vacancies } = computeVacancies(allUnits, data.positions, now, settings['access.termReminderDays']);

  const urgent: Array<{ key: string; kind: UrgentKind; systemId: string; systemName: string; unitName: string; subject: string; id: string | null; at: string | null }> = [];
  const push = (kind: UrgentKind, systemId: string, unit: string, subject: string, id: string | null, when: Date | string | null) =>
    urgent.push({ key: `${kind}:${id ?? `${unit}:${subject}`}`, kind, systemId, systemName: systemName(systemId), unitName: unit, subject, id, at: when ? new Date(when).toISOString() : null });

  for (const d of decisions) {
    if (d.status === 'DRAFT' && mayApprove(me, d.systemId, d.createdById, data, now).allowed) push('DECISION_TO_APPROVE', d.systemId, unitName(d.orgUnitId), d.title, d.id, d.createdAt);
  }
  for (const l of letters) {
    if (l.status !== 'DRAFT' || !canSend(me, l.systemId, data, now)) continue;
    push(l.printedAt ? 'LETTER_TO_DELIVER' : 'LETTER_TO_PRINT', l.systemId, unitName(l.orgUnitId), `${l.reference} · ${l.subject}`, l.id, l.createdAt);
  }
  for (const m of meetings) {
    if (m.status === 'PLANNED' && at(m.scheduledAt) < now.getTime()) push('MEETING_OVERDUE', m.systemId, unitName(m.orgUnitId), m.title, m.id, m.scheduledAt);
  }
  const unitSystem = (id: string) => allUnits.find((u) => u.id === id)?.systemId ?? CENTRAL_SYSTEM;
  for (const v of vacancies) {
    const sys = unitSystem(v.unitId);
    if (!open(sys)) continue;
    push(v.reason === 'EMPTY' ? 'VACANCY' : 'TERM_ENDING', sys, v.unitName, v.office + (v.endsOn ? ` · ${v.endsOn}` : ''), null, v.endsOn ?? null);
  }
  urgent.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || (a.at ?? '').localeCompare(b.at ?? ''));

  const oversight = readable
    .map((s) => ({
      systemId: s.id,
      name: systemName(s.id),
      units: allUnits.filter((u) => u.systemId === s.id).length,
      plannedMeetings: meetings.filter((m) => m.systemId === s.id && m.status === 'PLANNED').length,
      overdueMeetings: meetings.filter((m) => m.systemId === s.id && m.status === 'PLANNED' && at(m.scheduledAt) < now.getTime()).length,
      decisionsWaiting: decisions.filter((d) => d.systemId === s.id && d.status === 'DRAFT').length,
      lettersOpen: letters.filter((l) => l.systemId === s.id && l.status === 'DRAFT').length,
      vacancies: vacancies.filter((v) => unitSystem(v.unitId) === s.id).length,
    }))
    .sort((a, b) => (a.systemId === CENTRAL_SYSTEM ? -1 : b.systemId === CENTRAL_SYSTEM ? 1 : a.name.localeCompare(b.name)));

  res.json({
    urgent: urgent.slice(0, URGENT_MAX),
    urgentTotal: urgent.length,
    oversight,
    // Systems report in from Phase 3; until then the list is honestly empty.
    reports: [] as unknown[],
  });
});
