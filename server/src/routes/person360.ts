/**
 * Person 360 (slice 3.6): the whole person, kept with history. Contact, work, education, gifts and
 * callings, family, baptism (usually recorded from a programme cohort) and marriage. Church-wide
 * offices only; marriage is the Church Leader's alone.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { liveHoldings } from '../capabilities/engine.js';
import { counts } from '../money/block.js';
import { SECTIONS, SINGLE, accessFor, cleanData, isSection, type Section } from '../person360/rules.js';

export const person360Router = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

interface PersonRow {
  id: string; fullName: string; memberCode?: string | null; status?: string; archivedAt?: Date | string | null; dateOfBirth?: string | null; gender?: string | null;
  joinedChurchOn?: string | null; phone?: string | null; email?: string | null; address?: string | null; nationalId?: string | null;
}
interface RecordRow {
  id: string; personId: string; section: Section; dataJson: string; status: string; supersedesId?: string | null; programId?: string | null;
  recordedById: string; recordedAt: Date | string; voidReason?: string | null; voidedById?: string | null; voidedAt?: Date | string | null;
}
interface ProgramRow { id: string; name: string; programType?: string | null; cohortLabel?: string | null; status: string }
interface EnrolRow { programId: string; personId: string; status: string }

const parse = (r: RecordRow): Record<string, unknown> => {
  try {
    return JSON.parse(r.dataJson);
  } catch {
    return {};
  }
};
async function names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as PersonRow[];
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}
async function audit(actorId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: 'sys-main', action, resource: 'PERSON_360', detail, metaJson: JSON.stringify(meta) } });
}
async function access(me: string) {
  const { data } = await loadAccessData(me);
  return accessFor(me, data);
}
const personOf = async (id: string) => (await prisma.person.findUnique({ where: { id } })) as PersonRow | null;
const archived = (p: PersonRow) => !!p.archivedAt;

async function shapeRecords(rows: RecordRow[], a: { write: Section[] }) {
  const who = await names(rows.flatMap((r) => [r.recordedById, r.voidedById, ...(r.section === 'FAMILY' ? [String(parse(r).relatedPersonId ?? '')] : []), ...(r.section === 'MARRIAGE' ? [String(parse(r).spousePersonId ?? '')] : [])]));
  const programs = (await prisma.program.findMany()) as ProgramRow[];
  return rows.map((r) => {
    const d = parse(r);
    return {
      id: r.id, section: r.section, data: d, status: r.status, recordedByName: who.get(r.recordedById) ?? '', recordedAt: iso(r.recordedAt),
      voidReason: r.voidReason ?? null, voidedByName: r.voidedById ? who.get(r.voidedById) ?? '' : null,
      relatedName: r.section === 'FAMILY' && d.relatedPersonId ? who.get(String(d.relatedPersonId)) ?? '' : r.section === 'MARRIAGE' && d.spousePersonId ? who.get(String(d.spousePersonId)) ?? '' : '',
      programName: r.programId ? programs.find((p) => p.id === r.programId)?.name ?? '' : '',
      canChange: r.status === 'CURRENT' && a.write.includes(r.section),
    };
  });
}

/** What this person may do in Person 360 at all. 404 for everyone else, so it is not even confirmed to exist. */
person360Router.get('/access', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  res.json({ read: a.read, write: a.write, allowed: a.read.length > 0, leader: a.leader });
});

person360Router.get('/cohorts', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  if (!a.write.includes('BAPTISM')) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const programs = ((await prisma.program.findMany()) as ProgramRow[]).filter((p) => /bapt/i.test(`${p.programType ?? ''} ${p.name}`) && p.status !== 'DRAFT');
  const enrol = (await prisma.programEnrollment.findMany()) as EnrolRow[];
  const records = ((await prisma.personRecord.findMany()) as RecordRow[]).filter((r) => r.section === 'BAPTISM' && r.status === 'CURRENT');
  const done = new Set(records.map((r) => r.personId));
  const out = [];
  for (const p of programs) {
    const rows = enrol.filter((e) => e.programId === p.id && (e.status === 'ACTIVE' || e.status === 'COMPLETED'));
    const who = await names(rows.map((e) => e.personId));
    out.push({
      id: p.id, name: p.name, cohortLabel: p.cohortLabel ?? '',
      learners: rows.map((e) => ({ personId: e.personId, name: who.get(e.personId) ?? '', baptised: done.has(e.personId) })).sort((x, y) => x.name.localeCompare(y.name)),
    });
  }
  res.json({ cohorts: out });
});

person360Router.post('/baptism-cohort', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z
    .object({
      programId: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      place: z.string().trim().max(120).optional(),
      baptisedBy: z.string().trim().max(120).optional(),
      personIds: z.array(z.string().min(1)).min(1).max(200),
    })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a cohort, a date and who was baptised');
  const a = await access(me);
  if (!a.write.includes('BAPTISM')) return fail(res, 403, 'FORBIDDEN', 'You may not record baptisms');
  const b = parsed.data;
  const program = (await prisma.program.findUnique({ where: { id: b.programId } })) as ProgramRow | null;
  if (!program) return fail(res, 404, 'NOT_FOUND', 'Cohort not found');
  const enrolled = new Set(((await prisma.programEnrollment.findMany()) as EnrolRow[]).filter((e) => e.programId === b.programId && (e.status === 'ACTIVE' || e.status === 'COMPLETED')).map((e) => e.personId));
  const current = ((await prisma.personRecord.findMany()) as RecordRow[]).filter((r) => r.section === 'BAPTISM' && r.status === 'CURRENT');
  const created: string[] = [], skipped: string[] = [];
  for (const id of new Set(b.personIds)) {
    const person = await personOf(id);
    if (!person || archived(person) || !enrolled.has(id) || current.some((r) => r.personId === id)) {
      skipped.push(id);
      continue;
    }
    const data = cleanData('BAPTISM', { date: b.date, place: b.place, baptisedBy: b.baptisedBy });
    if (!data) return fail(res, 400, 'BAD_INPUT', 'Enter a valid date');
    await prisma.personRecord.create({ data: { personId: id, section: 'BAPTISM', dataJson: JSON.stringify(data), status: 'CURRENT', programId: b.programId, recordedById: me } });
    created.push(id);
  }
  await audit(me, 'BAPTISM_COHORT_RECORDED', `${created.length} baptised from ${program.name}`, { programId: b.programId, created, skipped });
  res.status(201).json({ created: created.length, skipped: skipped.length });
});

person360Router.get('/records/:id/history', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  const r = (await prisma.personRecord.findUnique({ where: { id: String(req.params.id) } })) as RecordRow | null;
  if (!r || !a.read.includes(r.section)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const chain: RecordRow[] = [r];
  const all = ((await prisma.personRecord.findMany()) as RecordRow[]).filter((x) => x.personId === r.personId && x.section === r.section);
  for (let cur = r; cur.supersedesId; ) {
    const prev = all.find((x) => x.id === cur.supersedesId);
    if (!prev) break;
    chain.push(prev);
    cur = prev;
  }
  res.json({ history: await shapeRecords(chain, a) });
});

person360Router.get('/:personId', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  if (a.read.length === 0) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const p = await personOf(String(req.params.personId));
  if (!p) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rows = ((await prisma.personRecord.findMany()) as RecordRow[])
    .filter((r) => r.personId === p.id && r.status === 'CURRENT' && a.read.includes(r.section))
    .sort((x, y) => +new Date(y.recordedAt) - +new Date(x.recordedAt));
  res.json({
    person: {
      id: p.id, fullName: p.fullName, memberCode: p.memberCode ?? null, status: p.status ?? 'ACTIVE', archived: archived(p), dateOfBirth: p.dateOfBirth ?? null, gender: p.gender ?? null,
      joinedChurchOn: p.joinedChurchOn ?? null, phone: p.phone ?? null, email: p.email ?? null, address: p.address ?? null, nationalId: a.leader ? p.nationalId ?? null : null,
    },
    read: a.read,
    write: archived(p) ? [] : a.write,
    records: await shapeRecords(rows, { write: archived(p) ? [] : a.write }),
  });
});

/**
 * What a person has given or pledged anywhere in the church: contributions on approved lists, approved
 * donations, sponsorship pledges and confirmed claims. For the Church Leader only; everyone else gets a 404.
 */
person360Router.get('/:personId/participation', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  if (!a.leader) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const p = await personOf(String(req.params.personId));
  if (!p) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const systems = new Map(((await prisma.churchSystem.findMany()) as Array<{ id: string; name: string; shortName?: string | null }>).map((x) => [x.id, x.shortName || x.name]));
  const sysName = (id: string) => systems.get(id) ?? id;
  const day = (v: Date | string) => iso(v)!.slice(0, 10);
  type Item = { id: string; kind: 'CONTRIBUTION' | 'DONATION' | 'SPONSORSHIP' | 'CLAIM' | 'GOOD_DEED'; amount: number; day: string; system: string | null; label: string; status: string };
  const items: Item[] = [];

  const lines = (await prisma.contributionLine.findMany({ where: { personId: p.id } })) as Array<{ id: string; listId: string; amount: number }>;
  if (lines.length) {
    const lists = (await prisma.contributionList.findMany()) as Array<{ id: string; systemId: string; level: string; status: string; typeName: string; month: string; decidedAt?: Date | string | null }>;
    for (const x of lines) {
      const l = lists.find((y) => y.id === x.listId);
      if (l && counts(l)) items.push({ id: x.id, kind: 'CONTRIBUTION', amount: x.amount, day: l.decidedAt ? day(l.decidedAt) : `${l.month}-01`, system: sysName(l.systemId), label: l.typeName, status: 'COUNTED' });
    }
  }
  for (const d of (await prisma.donation.findMany({ where: { donorPersonId: p.id } })) as Array<{ id: string; systemId: string; amount: number; receivedOn: Date | string; status: string; note?: string | null }>) {
    if (d.status === 'APPROVED') items.push({ id: d.id, kind: 'DONATION', amount: d.amount, day: day(d.receivedOn), system: sysName(d.systemId), label: d.note ?? '', status: 'COUNTED' });
  }
  const sponsors = (await prisma.choirSponsor.findMany({ where: { personId: p.id } })) as Array<{ id: string; choirId: string }>;
  if (sponsors.length) {
    const choirs = (await prisma.musicChoir.findMany()) as Array<{ id: string; name: string; systemId?: string | null }>;
    const pledges = (await prisma.sponsorPledge.findMany()) as Array<{ id: string; sponsorId: string; amount: number; pledgedOn: Date | string; receivedOn?: Date | string | null; status: string }>;
    for (const sp of sponsors) {
      const c = choirs.find((y) => y.id === sp.choirId);
      for (const pl of pledges.filter((y) => y.sponsorId === sp.id && y.status !== 'CANCELLED')) {
        items.push({ id: pl.id, kind: 'SPONSORSHIP', amount: pl.amount, day: day(pl.status === 'RECEIVED' && pl.receivedOn ? pl.receivedOn : pl.pledgedOn), system: sysName(c?.systemId ?? 'sys-music'), label: c?.name ?? '', status: pl.status === 'RECEIVED' ? 'COUNTED' : 'PLEDGED' });
      }
    }
  }
  for (const c of (await prisma.contributionClaim.findMany({ where: { personId: p.id } })) as Array<{ id: string; systemId: string; typeLabel: string; amount: number; confirmedAmount?: number | null; occurredOn: Date | string; status: string }>) {
    if (c.status === 'CONFIRMED' || c.status === 'PARTIAL') items.push({ id: c.id, kind: 'CLAIM', amount: c.confirmedAmount ?? c.amount, day: day(c.occurredOn), system: sysName(c.systemId), label: c.typeLabel, status: 'COUNTED' });
  }
  for (const d of ((await prisma.personDeed.findMany()) as DeedRow[]).filter((x) => x.personId === p.id && !x.deletedAt)) {
    items.push({ id: d.id, kind: 'GOOD_DEED', amount: 0, day: d.day, system: d.unitId ? sysName(d.unitId) : null, label: d.note, status: 'COUNTED' });
  }
  items.sort((x, y) => y.day.localeCompare(x.day));
  const year = new Date().toISOString().slice(0, 4);
  const sum = (list: Item[]) => list.reduce((n, i) => n + i.amount, 0);
  res.json({
    year,
    totals: { given: sum(items.filter((i) => i.status === 'COUNTED' && i.day.startsWith(year))), pledged: sum(items.filter((i) => i.status === 'PLEDGED')) },
    items: items.slice(0, 100),
    more: items.length > 100,
  });
});

/* ── Files and documents on a profile: small files kept as base64, for those who may read or record here ── */

const DOC_MAX = 1_500_000;
const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
interface DocRow { id: string; personId: string; name: string; mime: string; size: number; dataBase64?: string; note?: string | null; uploadedById: string; uploadedAt: Date | string; deletedAt?: Date | string | null }

person360Router.get('/:personId/documents', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  const p = await personOf(String(req.params.personId));
  if (a.read.length === 0 || !p) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rows = ((await prisma.personDocument.findMany()) as DocRow[]).filter((d) => d.personId === p.id && !d.deletedAt).sort((x, y) => +new Date(y.uploadedAt) - +new Date(x.uploadedAt));
  const who = await names(rows.map((d) => d.uploadedById));
  res.json({
    canWrite: a.write.length > 0 && !archived(p),
    items: rows.map((d) => ({ id: d.id, name: d.name, mime: d.mime, size: d.size, note: d.note ?? '', uploadedByName: who.get(d.uploadedById) ?? '', uploadedAt: iso(d.uploadedAt) })),
  });
});

person360Router.post('/:personId/documents', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const a = await access(me);
  const p = await personOf(String(req.params.personId));
  if (a.read.length === 0 || !p) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (a.write.length === 0) return fail(res, 403, 'FORBIDDEN', 'You may not add files here');
  if (archived(p)) return fail(res, 409, 'PERSON_ARCHIVED', 'This person is archived');
  const parsed = z.object({ name: z.string().trim().min(1).max(160), mime: z.string().max(120), data: z.string().min(1), note: z.string().trim().max(300).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the file');
  const b = parsed.data;
  if (!DOC_TYPES.includes(b.mime)) return fail(res, 400, 'BAD_TYPE', 'That kind of file is not accepted');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)) return fail(res, 400, 'BAD_INPUT', 'Check the file');
  const size = Math.floor((b.data.length * 3) / 4) - (b.data.endsWith('==') ? 2 : b.data.endsWith('=') ? 1 : 0);
  if (size > DOC_MAX) return fail(res, 413, 'TOO_BIG', 'The file is too big (1.5 MB at most)');
  const row = (await prisma.personDocument.create({ data: { personId: p.id, name: b.name, mime: b.mime, size, dataBase64: b.data, note: b.note || null, uploadedById: me } })) as DocRow;
  await audit(me, 'PERSON_DOCUMENT_ADDED', `${b.name} for ${p.fullName}`, { documentId: row.id, personId: p.id });
  res.status(201).json({ id: row.id });
});

person360Router.get('/documents/:docId/file', requireAuth, async (req: AuthedRequest, res) => {
  const a = await access(req.auth!.personId);
  const d = (await prisma.personDocument.findUnique({ where: { id: String(req.params.docId) } })) as DocRow | null;
  if (a.read.length === 0 || !d || d.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  res.json({ name: d.name, mime: d.mime, data: d.dataBase64 ?? '' });
});

person360Router.delete('/documents/:docId', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const a = await access(me);
  const d = (await prisma.personDocument.findUnique({ where: { id: String(req.params.docId) } })) as DocRow | null;
  if (a.read.length === 0 || !d || d.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (a.write.length === 0) return fail(res, 403, 'FORBIDDEN', 'You may not remove files here');
  await prisma.personDocument.update({ where: { id: d.id }, data: { deletedAt: new Date(), deletedById: me } });
  await audit(me, 'PERSON_DOCUMENT_REMOVED', `${d.name}`, { documentId: d.id, personId: d.personId });
  res.json({ ok: true });
});

/* ── Good deeds: any Unit Secretary (or the Church Secretary, Pastor, Church Leader) records them; the Church Leader sees them under Participation ── */

interface DeedRow { id: string; personId: string; note: string; day: string; recordedById: string; unitId?: string | null; recordedAt: Date | string; deletedAt?: Date | string | null }
const DEED_OFFICES = ['SECRETARY', 'CHURCH_SECRETARY', 'PASTOR', 'CHURCH_LEADER'];
async function deedSeats(me: string) {
  const { data } = await loadAccessData(me);
  return liveHoldings(me, data).filter((h) => DEED_OFFICES.includes(String(h.office)));
}
const unitNames = async (): Promise<Map<string, string>> => new Map(((await prisma.orgUnit.findMany()) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));

person360Router.get('/:personId/deeds', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const seats = await deedSeats(me);
  const a = await access(me);
  const p = await personOf(String(req.params.personId));
  if ((seats.length === 0 && a.read.length === 0) || !p) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rows = ((await prisma.personDeed.findMany()) as DeedRow[]).filter((d) => d.personId === p.id && !d.deletedAt).sort((x, y) => y.day.localeCompare(x.day) || +new Date(y.recordedAt) - +new Date(x.recordedAt));
  const who = await names(rows.map((d) => d.recordedById));
  const units = await unitNames();
  res.json({
    canRecord: seats.length > 0 && !archived(p),
    items: rows.map((d) => ({ id: d.id, note: d.note, day: d.day, recordedByName: who.get(d.recordedById) ?? '', unitName: d.unitId ? units.get(d.unitId) ?? '' : '', mine: d.recordedById === me || a.leader })),
  });
});

person360Router.post('/:personId/deeds', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const seats = await deedSeats(me);
  const p = await personOf(String(req.params.personId));
  if (!p) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (seats.length === 0) return fail(res, 403, 'FORBIDDEN', 'Only a secretary may record a good deed');
  if (archived(p)) return fail(res, 409, 'PERSON_ARCHIVED', 'This person is archived');
  const parsed = z.object({ note: z.string().trim().min(3).max(300), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Describe the good deed');
  const day = parsed.data.day ?? new Date().toISOString().slice(0, 10);
  if (day > new Date().toISOString().slice(0, 10)) return fail(res, 400, 'BAD_INPUT', 'The date cannot be in the future');
  const row = (await prisma.personDeed.create({ data: { personId: p.id, note: parsed.data.note, day, recordedById: me, unitId: seats.find((h) => h.orgUnitId)?.orgUnitId ?? null } })) as DeedRow;
  await audit(me, 'PERSON_DEED_ADDED', `Good deed for ${p.fullName}`, { deedId: row.id, personId: p.id });
  res.status(201).json({ id: row.id });
});

person360Router.delete('/deeds/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const a = await access(me);
  const d = (await prisma.personDeed.findUnique({ where: { id: String(req.params.id) } })) as DeedRow | null;
  if (!d || d.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (d.recordedById !== me && !a.leader) return fail(res, 403, 'FORBIDDEN', 'Only who recorded it, or the Church Leader, may remove it');
  await prisma.personDeed.update({ where: { id: d.id }, data: { deletedAt: new Date(), deletedById: me } });
  await audit(me, 'PERSON_DEED_REMOVED', 'Good deed removed', { deedId: d.id, personId: d.personId });
  res.json({ ok: true });
});

person360Router.post('/:personId/records', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const section = req.body?.section;
  if (!isSection(section)) return fail(res, 400, 'BAD_INPUT', 'Unknown section');
  const a = await access(me);
  const p = await personOf(String(req.params.personId));
  if (!p || !a.read.includes(section)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!a.write.includes(section)) return fail(res, 403, 'FORBIDDEN', 'You may not record this here');
  if (archived(p)) return fail(res, 409, 'PERSON_ARCHIVED', 'This person is archived');
  const data = cleanData(section, req.body?.data);
  if (!data) return fail(res, 400, 'BAD_INPUT', 'Check the fields');
  for (const k of ['relatedPersonId', 'spousePersonId']) {
    if (data[k] && !(await personOf(String(data[k])))) return fail(res, 400, 'PERSON_NOT_FOUND', 'That person was not found');
  }
  if (SINGLE.includes(section) && ((await prisma.personRecord.findMany()) as RecordRow[]).some((r) => r.personId === p.id && r.section === section && r.status === 'CURRENT')) {
    return fail(res, 409, 'ALREADY_EXISTS', 'Already recorded: change that record instead');
  }
  const row = (await prisma.personRecord.create({ data: { personId: p.id, section, dataJson: JSON.stringify(data), status: 'CURRENT', recordedById: me } })) as RecordRow;
  await audit(me, 'PERSON_RECORD_ADDED', `${section} for ${p.fullName}`, { recordId: row.id, personId: p.id, section });
  res.status(201).json({ id: row.id });
});

person360Router.patch('/records/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const a = await access(me);
  const r = (await prisma.personRecord.findUnique({ where: { id: String(req.params.id) } })) as RecordRow | null;
  if (!r || !a.read.includes(r.section)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!a.write.includes(r.section)) return fail(res, 403, 'FORBIDDEN', 'You may not change this');
  if (r.status !== 'CURRENT') return fail(res, 409, 'WRONG_STATE', 'Only the current record can be changed');
  const data = cleanData(r.section, req.body?.data);
  if (!data) return fail(res, 400, 'BAD_INPUT', 'Check the fields');
  for (const k of ['relatedPersonId', 'spousePersonId']) {
    if (data[k] && !(await personOf(String(data[k])))) return fail(res, 400, 'PERSON_NOT_FOUND', 'That person was not found');
  }
  const next = (await prisma.personRecord.create({ data: { personId: r.personId, section: r.section, dataJson: JSON.stringify(data), status: 'CURRENT', supersedesId: r.id, programId: r.programId ?? null, recordedById: me } })) as RecordRow;
  await prisma.personRecord.update({ where: { id: r.id }, data: { status: 'SUPERSEDED' } });
  await audit(me, 'PERSON_RECORD_CHANGED', `${r.section} changed`, { recordId: next.id, replaced: r.id, personId: r.personId, section: r.section });
  res.json({ id: next.id });
});

person360Router.post('/records/:id/void', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const a = await access(me);
  const r = (await prisma.personRecord.findUnique({ where: { id: String(req.params.id) } })) as RecordRow | null;
  if (!r || !a.read.includes(r.section)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!a.write.includes(r.section)) return fail(res, 403, 'FORBIDDEN', 'You may not change this');
  if (r.status !== 'CURRENT') return fail(res, 409, 'WRONG_STATE', 'Only the current record can be voided');
  const parsed = z.object({ reason: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.personRecord.update({ where: { id: r.id }, data: { status: 'VOIDED', voidReason: parsed.data.reason, voidedById: me, voidedAt: new Date() } });
  await audit(me, 'PERSON_RECORD_VOIDED', `${r.section} voided`, { recordId: r.id, personId: r.personId, section: r.section, reason: parsed.data.reason });
  res.json({ ok: true });
});

export const PERSON_SECTIONS = SECTIONS;
