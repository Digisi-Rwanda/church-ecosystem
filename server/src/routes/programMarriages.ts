/**
 * Marriage cases (the third case type): the unit's leader registers the couple, the Catechist verifies and schedules the announcements and
 * preparation meetings, the Church Leader approves. A postponement or cancellation is asked for by the unit leader, confirmed by the Catechist
 * and approved by the Church Leader. The other partner's church is free text: nobody outside this church is ever notified.
 */
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { notifySafely } from '../lib/notify.js';
import { NOTE_MAX } from '../work/rules.js';
import { canDecideForChurch, catechistIds, unitApproverIds } from '../work/plan.js';
import { FILE_MAX, FILE_TYPES } from './planFiles.js';
import {
  LIVE, audit, budgetOf, casesOf, caseTypeOf, detail, event, fail, iso, isManager, registerMarriage, isSubmitter, leadersOf, load, programCasesRouter, secretaryIds, tell, unitName, watchers,
  type CaseRow, type Data, type PlanRow, type Units,
} from './programCases.js';

interface Item { id: string; caseId: string; planId: string; kind: string; place: string; onDate: Date | string; atTime: string | null; status: string; createdById: string }
interface Change { kind: 'POSTPONE' | 'CANCEL'; reason: string; newDate: string | null; newTime: string | null; status: 'REQUESTED' | 'CONFIRMED'; byId: string; at: string }
interface Details { p1Name: string; p1Contact: string; p2Name: string; p2Church: string; p2Contact: string; date: string; time: string; place: string; certificateFileId: string | null }

const detailsOf = (c: CaseRow): Details => ({ p1Name: '', p1Contact: '', p2Name: '', p2Church: '', p2Contact: '', date: '', time: '', place: '', certificateFileId: null, ...(JSON.parse(c.detailsJson ?? '{}') as Partial<Details>) });
const changeOf = (c: CaseRow): Change | null => { try { return c.changeJson ? (JSON.parse(c.changeJson) as Change) : null; } catch { return null; } };
const itemsOf = async (caseId: string) => ((await prisma.programCaseItem.findMany({ where: { caseId } })) as Item[]).filter((i) => i.caseId === caseId).sort((a, b) => new Date(a.onDate).getTime() - new Date(b.onDate).getTime());
const day = (v: Date | string) => new Date(v).toISOString().slice(0, 10);

const isCatechist = (me: string, data: Data) => catechistIds(data).includes(me);
const isChurchLeader = (me: string, data: Data) => canDecideForChurch(me, data);
/** Announcements are the Catechist's (the Church Leader may too); preparation meetings are also arranged by the Secretary. */
const canArrange = (kind: string, p: PlanRow, me: string, data: Data) =>
  isCatechist(me, data) || isChurchLeader(me, data) || (kind === 'MEETING' && secretaryIds(data).includes(me)) || isManager(p, me, data);
const partnerLeaders = (c: CaseRow, units: Units, data: Data) => leadersOf(c.unitId, units, data);

export const marriageCanClose = (p: PlanRow, c: CaseRow, me: string, data: Data) => isCatechist(me, data) || isChurchLeader(me, data) || isManager(p, me, data);

export async function marriageBlock(p: PlanRow, c: CaseRow, me: string, data: Data, units: Units) {
  const d = detailsOf(c);
  const change = changeOf(c);
  const items = await itemsOf(c.id);
  const open = c.status !== 'CLOSED' && LIVE.includes(p.status);
  const leader = leadersOf(c.unitId, units, data).includes(me) || c.registeredById === me;
  const shape = (i: Item) => ({ id: i.id, place: i.place, date: day(i.onDate), time: i.atTime ?? '', status: i.status });
  return {
    p1Unit: unitName(c.unitId, units), ...d,
    status: c.status, awaiting: c.status === 'PENDING' ? 'CATECHIST' : c.status === 'VERIFIED' ? 'CHURCH_LEADER' : null,
    hasMoney: p.hasMoney !== false,
    announcements: items.filter((i) => i.kind === 'ANNOUNCEMENT').map(shape),
    meetings: items.filter((i) => i.kind === 'MEETING').map(shape),
    change: change ? { kind: change.kind, reason: change.reason, newDate: change.newDate, newTime: change.newTime, status: change.status } : null,
    canVerify: open && c.status === 'PENDING' && isCatechist(me, data),
    canApprove: open && c.status === 'VERIFIED' && isChurchLeader(me, data) && !change,
    canSendBack: open && (c.status === 'PENDING' || c.status === 'VERIFIED') && (isCatechist(me, data) || isChurchLeader(me, data)),
    canArrangeAnnouncements: open && c.status !== 'PENDING' && canArrange('ANNOUNCEMENT', p, me, data),
    canArrangeMeetings: open && c.status !== 'PENDING' && canArrange('MEETING', p, me, data),
    canRequestChange: open && (c.status === 'VERIFIED' || c.status === 'APPROVED') && !change && leader,
    canConfirmChange: open && change?.status === 'REQUESTED' && isCatechist(me, data),
    canDecideChange: open && change?.status === 'CONFIRMED' && isChurchLeader(me, data),
    maxSupport: p.hasMoney !== false ? c.gap : 0,
    remaining: p.hasMoney !== false ? (await budgetOf(p)).remaining : 0,
  };
}

async function loadMarriage(req: AuthedRequest, res: Parameters<typeof fail>[0]) {
  const got = await load(req, res);
  if (!got) return null;
  if (caseTypeOf(got.p) !== 'MARRIAGE') return fail(res, 409, 'NOT_MARRIAGE', 'This program does not hold marriages'), null;
  return got;
}
async function loadCase(req: AuthedRequest, res: Parameters<typeof fail>[0]) {
  const got = await loadMarriage(req, res);
  if (!got) return null;
  const c = (await casesOf(got.p.id)).find((x) => x.id === String(req.params.cid));
  if (!c) return fail(res, 404, 'NOT_FOUND', 'Case not found'), null;
  return { ...got, c };
}
const after = async (got: NonNullable<Awaited<ReturnType<typeof loadCase>>>) => {
  const fresh = (await casesOf(got.p.id)).find((x) => x.id === got.c.id) as CaseRow;
  return detail(got.p, fresh, got.me, got.data, got.units);
};
const unitNeed = (units: Units, id: string) => (units as Array<{ id: string }>).some((u) => u.id === id);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}$/);

/** The Youth Leader (or any unit leader) registers a couple. Partner 1 is a member of the unit; partner 2's church is free text. */
programCasesRouter.post('/:id/marriages', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadMarriage(req, res);
  if (!got) return;
  const { me, data, units, p } = got;
  if (!LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'The program is not running');
  const b = z.object({
    unitId: z.string().min(1), p1Name: z.string().trim().min(1).max(120), p1Contact: z.string().trim().max(120).default(''),
    p2Name: z.string().trim().min(1).max(120), p2Church: z.string().trim().max(160).default(''), p2Contact: z.string().trim().max(120).default(''),
    date: dateStr, time: timeStr.nullish(), place: z.string().trim().max(160).default(''),
    capacity: z.number().int().min(0).max(2_000_000_000).default(0), need: z.number().int().min(0).max(2_000_000_000).default(0),
    certificate: z.object({ name: z.string().trim().min(1).max(160), mime: z.string().max(120), data: z.string().min(1) }).nullish(),
  }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Give both names, the unit and the wedding date');
  if (!unitNeed(units, b.data.unitId)) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!(isManager(p, me, data) || isSubmitter(p, me) || leadersOf(b.data.unitId, units, data).includes(me))) return fail(res, 403, 'FORBIDDEN', 'Only the unit’s leader registers a marriage for it');
  const money = p.hasMoney !== false;
  const need = money ? b.data.need : 0;
  const capacity = money ? b.data.capacity : 0;
  let certificateFileId: string | null = null;
  if (b.data.certificate) {
    const f = b.data.certificate;
    if (!FILE_TYPES.includes(f.mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data)) return fail(res, 400, 'BAD_TYPE', 'That kind of file is not accepted');
    const size = Math.floor((f.data.length * 3) / 4) - (f.data.endsWith('==') ? 2 : f.data.endsWith('=') ? 1 : 0);
    if (size > FILE_MAX) return fail(res, 413, 'TOO_BIG', 'The file is too big (1.5 MB at most)');
    const row = (await prisma.planFile.create({ data: { planId: p.id, name: `Civil certificate — ${b.data.p1Name} & ${b.data.p2Name}`, mime: f.mime, size, dataBase64: f.data, uploadedById: me, uploadedAt: new Date() } })) as { id: string };
    certificateFileId = row.id;
  }
  const details: Details = { p1Name: b.data.p1Name, p1Contact: b.data.p1Contact, p2Name: b.data.p2Name, p2Church: b.data.p2Church, p2Contact: b.data.p2Contact, date: b.data.date, time: b.data.time ?? '', place: b.data.place, certificateFileId };
  const row = (await prisma.programCase.create({ data: { planId: p.id, systemId: p.systemId, caseType: 'MARRIAGE', unitId: b.data.unitId, name: `${b.data.p1Name} & ${b.data.p2Name}`, contact: b.data.p1Contact, issue: '', capacity, need, gap: Math.max(0, need - capacity), approved: 0, disbursed: 0, status: 'PENDING', registeredById: me, detailsJson: JSON.stringify(details) } })) as CaseRow;
  await event(row, 'REGISTERED', `Registered by the unit leader. Wedding on ${b.data.date}${b.data.place ? ` at ${b.data.place}` : ''}`, me);
  await tell([...catechistIds(data), p.leaderPersonId as string], p, me, `New marriage to verify: ${row.name}`, `${unitName(row.unitId, units)} · ${b.data.date}`, `marriage-new:${row.id}`, true);
  await audit(me, p.systemId, 'MARRIAGE_REGISTERED', `Registered a marriage in “${p.title}”`, { planId: p.id, caseId: row.id });
  res.status(201).json({ id: row.id });
});

/** The Catechist verifies the papers and the details, and may schedule the first announcements at once. */
programCasesRouter.post('/:id/cases/:cid/verify', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  if (!isCatechist(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Catechist verifies a marriage');
  if (c.status !== 'PENDING' || !LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'Not possible now');
  const b = z.object({ note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  await prisma.programCase.update({ where: { id: c.id }, data: { status: 'VERIFIED', verifiedById: me, verifiedAt: new Date() } });
  await event(c, 'REVIEWED', `Verified by the Catechist${b.success && b.data.note ? ` — ${b.data.note}` : ''}`, me);
  await tell(holdersOfChurchLeader(data), p, me, `Marriage to approve: ${c.name}`, 'Verified by the Catechist', `marriage-verified:${c.id}`, true);
  await tell(partnerLeaders(c, units, data), p, me, `Marriage verified: ${c.name}`, null, `marriage-verified-u:${c.id}`);
  await audit(me, p.systemId, 'MARRIAGE_VERIFIED', `Verified a marriage in “${p.title}”`, { planId: p.id, caseId: c.id });
  res.json(await after(got));
});
const holdersOfChurchLeader = (data: Data) => {
  const ids = [...new Set((data.positions as Array<{ personId: string }>).map((x) => x.personId))];
  return ids.filter((id) => canDecideForChurch(id, data));
};

/** Back to the unit leader to correct (the Catechist or the Church Leader). */
programCasesRouter.post('/:id/cases/:cid/send-back', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  if (!(isCatechist(me, data) || isChurchLeader(me, data))) return fail(res, 403, 'FORBIDDEN', 'Only the Catechist or the Church Leader sends a marriage back');
  if ((c.status !== 'PENDING' && c.status !== 'VERIFIED') || !LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'Not possible now');
  const b = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'REASON_REQUIRED', 'Say what to correct');
  await prisma.programCase.update({ where: { id: c.id }, data: { status: 'PENDING', verifiedById: null, verifiedAt: null } });
  await event(c, 'REVIEWED', `Sent back: ${b.data.reason}`, me);
  await tell(partnerLeaders(c, units, data), p, me, `Marriage sent back: ${c.name}`, b.data.reason, `marriage-back:${c.id}:${Date.now()}`, true);
  res.json(await after(got));
});

/** The Church Leader approves. With money on, they may also approve church support up to the gap and what the program has left. */
programCasesRouter.post('/:id/cases/:cid/approve', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  if (!isChurchLeader(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader approves a marriage');
  if (c.status !== 'VERIFIED' || !LIVE.includes(p.status) || changeOf(c)) return fail(res, 409, 'WRONG_STATE', 'The Catechist verifies it first');
  const b = z.object({ support: z.number().int().min(0).max(2_000_000_000).nullish() }).safeParse(req.body ?? {});
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Check the amount');
  const support = p.hasMoney === false ? 0 : b.data.support ?? 0;
  if (support > c.gap) return fail(res, 400, 'MORE_THAN_GAP', 'Support cannot be more than the gap');
  if (support > (await budgetOf(p)).remaining) return fail(res, 409, 'INSUFFICIENT_PROGRAM_BUDGET', 'The program does not have that much left this year', { remaining: (await budgetOf(p)).remaining, wanted: support });
  await prisma.programCase.update({ where: { id: c.id }, data: { status: 'APPROVED', approved: support } });
  if (support > 0) {
    const batch = (await prisma.programCaseBatch.create({ data: { planId: p.id, systemId: p.systemId, unitId: c.unitId, mode: 'PER_CASE', amount: support, status: 'READY', decidedById: me } })) as { id: string };
    await prisma.programCase.update({ where: { id: c.id }, data: { batchId: batch.id } });
    await tell((await import('../work/plan.js')).holdersWith(p.systemId, 'MONEY', 'W', data), p, me, `Support approved: ${p.title}`, `${support} RWF for ${c.name}`, `marriage-support:${batch.id}`, true);
  }
  await event(c, 'REVIEWED', `Approved by the Church Leader${support > 0 ? `, church support ${support} RWF` : ''}`, me);
  await tell([...partnerLeaders(c, units, data), ...catechistIds(data)], p, me, `Marriage approved: ${c.name}`, null, `marriage-approved:${c.id}`);
  await audit(me, p.systemId, 'MARRIAGE_APPROVED', `Approved a marriage in “${p.title}”`, { planId: p.id, caseId: c.id, support });
  res.json(await after(got));
});

/** Announcements and preparation meetings. */
programCasesRouter.post('/:id/cases/:cid/items', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  const b = z.object({ kind: z.enum(['ANNOUNCEMENT', 'MEETING']), onDate: dateStr, atTime: timeStr.nullish(), place: z.string().trim().max(160).default('') }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Give the date');
  if (!canArrange(b.data.kind, p, me, data)) return fail(res, 403, 'FORBIDDEN', b.data.kind === 'ANNOUNCEMENT' ? 'Only the Catechist schedules announcements' : 'You may not arrange meetings');
  if (c.status === 'PENDING' || c.status === 'CLOSED' || !LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'The Catechist verifies the marriage first');
  await prisma.programCaseItem.create({ data: { caseId: c.id, planId: p.id, kind: b.data.kind, place: b.data.place, onDate: new Date(`${b.data.onDate}T00:00:00Z`), atTime: b.data.atTime ?? null, status: 'SCHEDULED', createdById: me } });
  const what = b.data.kind === 'ANNOUNCEMENT' ? 'Announcement' : 'Preparation meeting';
  await event(c, 'PROGRESS', `${what} scheduled for ${b.data.onDate}${b.data.atTime ? ` ${b.data.atTime}` : ''}`, me);
  if (b.data.kind === 'ANNOUNCEMENT') await tell([...secretaryIds(data), ...catechistIds(data), ...partnerLeaders(c, units, data)], p, me, `Marriage announcement scheduled: ${c.name}`, `${b.data.onDate}${b.data.atTime ? ` ${b.data.atTime}` : ''}`, `marriage-ann:${c.id}:${b.data.onDate}`);
  res.status(201).json(await after(got));
});

/** Change a date without any approval, or mark it done / attended / cancelled. */
programCasesRouter.patch('/:id/cases/:cid/items/:iid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, p, c } = got;
  const item = ((await prisma.programCaseItem.findUnique({ where: { id: String(req.params.iid) } })) as Item | null);
  if (!item || item.caseId !== c.id) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!canArrange(item.kind, p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this');
  if (c.status === 'CLOSED' || !LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'The marriage is closed');
  const b = z.object({ onDate: dateStr.nullish(), atTime: timeStr.nullish(), place: z.string().trim().max(160).nullish(), status: z.enum(['SCHEDULED', 'DONE', 'CANCELLED']).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Check the change');
  await prisma.programCaseItem.update({ where: { id: item.id }, data: { ...(b.data.onDate ? { onDate: new Date(`${b.data.onDate}T00:00:00Z`) } : {}), ...(b.data.atTime !== undefined ? { atTime: b.data.atTime } : {}), ...(b.data.place != null ? { place: b.data.place } : {}), ...(b.data.status ? { status: b.data.status } : {}) } });
  await event(c, 'PROGRESS', `${item.kind === 'ANNOUNCEMENT' ? 'Announcement' : 'Preparation meeting'} ${b.data.status === 'DONE' ? (item.kind === 'MEETING' ? 'attended' : 'made') : b.data.status === 'CANCELLED' ? 'cancelled' : `moved to ${b.data.onDate ?? day(item.onDate)}`}`, me);
  res.json(await after(got));
});

/** The unit leader asks to postpone (with a new date) or cancel. */
programCasesRouter.post('/:id/cases/:cid/change', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  const leader = leadersOf(c.unitId, units, data).includes(me) || c.registeredById === me;
  if (!leader) return fail(res, 403, 'FORBIDDEN', 'Only the unit’s leader asks for a change');
  if ((c.status !== 'VERIFIED' && c.status !== 'APPROVED') || changeOf(c) || !LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'Not possible now');
  const b = z.object({ kind: z.enum(['POSTPONE', 'CANCEL']), reason: z.string().trim().min(1).max(NOTE_MAX), newDate: dateStr.nullish(), newTime: timeStr.nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'REASON_REQUIRED', 'Say why');
  if (b.data.kind === 'POSTPONE' && !b.data.newDate) return fail(res, 400, 'DATE_REQUIRED', 'Give the new wedding date');
  const change: Change = { kind: b.data.kind, reason: b.data.reason, newDate: b.data.kind === 'POSTPONE' ? b.data.newDate ?? null : null, newTime: b.data.newTime ?? null, status: 'REQUESTED', byId: me, at: new Date().toISOString() };
  await prisma.programCase.update({ where: { id: c.id }, data: { changeJson: JSON.stringify(change) } });
  await event(c, 'PROGRESS', `${b.data.kind === 'POSTPONE' ? `Postponement requested to ${b.data.newDate}` : 'Cancellation requested'}: ${b.data.reason}`, me);
  await tell(catechistIds(data), p, me, `${b.data.kind === 'POSTPONE' ? 'Postponement' : 'Cancellation'} requested: ${c.name}`, b.data.reason, `marriage-change:${c.id}`, true);
  res.json(await after(got));
});

/** The Catechist confirms and clears the announcements still ahead, so the new ones can be set after the decision. */
programCasesRouter.post('/:id/cases/:cid/change/confirm', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, p, c } = got;
  const change = changeOf(c);
  if (!isCatechist(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Catechist confirms a change');
  if (!change || change.status !== 'REQUESTED') return fail(res, 409, 'WRONG_STATE', 'There is nothing to confirm');
  for (const i of (await itemsOf(c.id)).filter((x) => x.kind === 'ANNOUNCEMENT' && x.status === 'SCHEDULED')) await prisma.programCaseItem.update({ where: { id: i.id }, data: { status: 'CANCELLED' } });
  await prisma.programCase.update({ where: { id: c.id }, data: { changeJson: JSON.stringify({ ...change, status: 'CONFIRMED' }) } });
  await event(c, 'PROGRESS', 'The Catechist confirmed the request and cleared the announcements still ahead', me);
  await tell(holdersOfChurchLeader(data), p, me, `${change.kind === 'POSTPONE' ? 'Postponement' : 'Cancellation'} to approve: ${c.name}`, change.reason, `marriage-change-ok:${c.id}`, true);
  res.json(await after(got));
});

/** The Church Leader decides. A postponement moves the wedding; a cancellation closes the case and gives back support not yet paid. */
programCasesRouter.post('/:id/cases/:cid/change/decide', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  const change = changeOf(c);
  if (!isChurchLeader(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader decides a change');
  if (!change || change.status !== 'CONFIRMED') return fail(res, 409, 'WRONG_STATE', 'The Catechist confirms it first');
  const b = z.object({ approve: z.boolean(), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Approve or decline');
  const who = [...catechistIds(data), ...partnerLeaders(c, units, data)];
  if (!b.data.approve) {
    await prisma.programCase.update({ where: { id: c.id }, data: { changeJson: null } });
    await event(c, 'REVIEWED', `Request declined by the Church Leader${b.data.note ? ` — ${b.data.note}` : ''}`, me);
    await tell(who, p, me, `Request declined: ${c.name}`, b.data.note ?? null, `marriage-change-no:${c.id}`);
    return res.json(await after(got));
  }
  if (change.kind === 'POSTPONE') {
    const d = detailsOf(c);
    await prisma.programCase.update({ where: { id: c.id }, data: { changeJson: null, detailsJson: JSON.stringify({ ...d, date: change.newDate ?? d.date, time: change.newTime ?? d.time }) } });
    await event(c, 'REVIEWED', `Postponement approved: the wedding is now on ${change.newDate}`, me);
    await tell([...who, ...holdersOfChurchLeader(data)], p, me, `Marriage postponed: ${c.name}`, `New date ${change.newDate}`, `marriage-postponed:${c.id}:${change.newDate}`, true);
  } else {
    let released = 0;
    if (c.batchId) {
      const batch = ((await prisma.programCaseBatch.findMany({ where: { planId: p.id } })) as Array<{ id: string; status: string; amount: number }>).find((x) => x.id === c.batchId);
      if (batch && (batch.status === 'READY' || batch.status === 'AWAITING_ALLOCATION')) {
        await prisma.programCaseBatch.update({ where: { id: batch.id }, data: { status: 'RELEASED' } });
        released = c.approved - c.disbursed;
      }
    }
    for (const i of (await itemsOf(c.id)).filter((x) => x.status === 'SCHEDULED')) await prisma.programCaseItem.update({ where: { id: i.id }, data: { status: 'CANCELLED' } });
    await prisma.programCase.update({ where: { id: c.id }, data: { status: 'CLOSED', outcome: 'CANCELLED', closeNote: change.reason, closedAt: new Date(), changeJson: null, approved: c.disbursed } });
    await event(c, 'CLOSED', `Cancellation approved${released > 0 ? `; ${released} RWF of support released` : ''}`, me);
    const tellMore = [...new Set([...who, ...watchers(p, data), ...holdersOfChurchLeader(data)])];
    await tell(tellMore, p, me, `Marriage cancelled: ${c.name}`, change.reason, `marriage-cancelled:${c.id}`, true);
  }
  await audit(me, p.systemId, 'MARRIAGE_CHANGE_DECIDED', `Decided a ${change.kind.toLowerCase()} in “${p.title}”`, { planId: p.id, caseId: c.id, approved: true });
  res.json(await after(got));
});

registerMarriage({ block: marriageBlock, canClose: marriageCanClose });
void iso;
void unitApproverIds;
void notifySafely;
