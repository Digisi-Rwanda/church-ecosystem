/**
 * People tools (phase 3): a CSV import with a preview, a scan for probable duplicates, and the
 * birthdays and anniversaries coming up. Add-only: it reads and creates people exactly as the
 * directory does, with the same permission and the same member-code counter.
 * Merging two records is not offered here: it touches every table that names a person.
 */
import { Router } from 'express';
import { z } from 'zod';
import { nextMemberCode, normaliseName, normalisePhone } from '../lib/codes.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { personTier } from '../policy/personAccess.js';
import { authorizePerson } from '../policy/index.js';
import { loadAccessData } from '../notifications/feed.js';
import { unitPeopleSystems } from '../lib/unitPeople.js';
import { accessFor, cleanData, SECTIONS, type Section } from '../person360/rules.js';

export const peopleToolsRouter = Router();

const MAX_ROWS = 500;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const rowSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is missing').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('Email is not valid').optional().or(z.literal('')),
  dateOfBirth: date.optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE']).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'VISITOR']).optional().or(z.literal('')),
  joinedChurchOn: date.optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  records: z.array(z.object({section:z.enum(SECTIONS),data:z.record(z.string(),z.unknown())})).max(50).optional(),
});
const bodySchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ROWS), commit: z.boolean().optional(), systemId:z.string().min(1).optional() });

type RowResult = { line: number; fullName: string; state: 'OK' | 'DUPLICATE' | 'ERROR'; message?: string; matches?: string[] };

async function mayManage(personId: string): Promise<boolean> {
  return (await authorizePerson({ personId, systemId: 'sys-main', resource: 'PERSON', action: 'MANAGE' })).allowed;
}

/** Check every row and, when `commit` is true, create the ones that are fine. Duplicates and errors are skipped and reported. */
peopleToolsRouter.post('/import', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: `Send between 1 and ${MAX_ROWS} rows`, code: 'BAD_INPUT' });
  const me = req.auth!.personId;
  const systemId = parsed.data.systemId ?? 'sys-main';
  const global = await mayManage(me);
  const {data: access} = await loadAccessData(me);
  const unit = systemId !== 'sys-main' && unitPeopleSystems(me, access).includes(systemId);
  if (!global && !unit) return res.status(403).json({ error: 'You may not add people in this system', code: 'NOT_ALLOWED' });
  const home = systemId === 'sys-main' ? null : (await prisma.churchSystem.findUnique({where:{id:systemId}}))?.orgUnitId;
  if (systemId !== 'sys-main' && !home) return res.status(400).json({error:'System has no organizational unit',code:'BAD_INPUT'});
  const writable = unit ? [...SECTIONS] : accessFor(me, access).write;
  const existing = (await prisma.person.findMany({})) as Array<{ fullName: string; dateOfBirth?: string | null; phone?: string | null; memberCode?: string | null }>;
  const seen = existing.map((p) => ({ name: normaliseName(p.fullName), dob: p.dateOfBirth ?? '', phone: normalisePhone(p.phone), label: `${p.fullName}${p.memberCode ? ` (${p.memberCode})` : ''}` }));
  const results: RowResult[] = [];
  const toCreate: Array<z.infer<typeof rowSchema>> = [];
  parsed.data.rows.forEach((raw, i) => {
    const line = i + 1;
    let records: Array<{section:Section;data:Record<string,unknown>}> = [];
    try {
      records = Array.isArray(raw.records) ? raw.records as typeof records : [];
      for (const section of SECTIONS) if (raw[section]) {
        const values = typeof raw[section] === 'string' ? JSON.parse(raw[section] as string) : raw[section];
        for (const data of Array.isArray(values) ? values : [values]) records.push({section,data});
      }
    } catch { return void results.push({line,fullName:String(raw.fullName ?? ''),state:'ERROR',message:'Profile sections must contain valid JSON'}); }
    const r = rowSchema.safeParse({...raw,records});
    if (!r.success) return void results.push({ line, fullName: String(raw.fullName ?? ''), state: 'ERROR', message: r.error.issues[0]?.message ?? 'Row is not valid' });
    const d = r.data;
    const singles = new Set<string>();
    for (const record of d.records ?? []) {
      const cleaned = cleanData(record.section,record.data);
      if (!writable.includes(record.section) || !cleaned || record.data.relatedPersonId || record.data.spousePersonId || record.data.orgUnitId
        || (['BAPTISM','MARRIAGE'].includes(record.section) && singles.has(record.section))) {
        return void results.push({line,fullName:d.fullName,state:'ERROR',message:'Invalid or unauthorized profile section; use names for family/spouse and record unit links individually'});
      }
      singles.add(record.section);
      record.data = cleaned;
    }
    const key = { name: normaliseName(d.fullName), dob: d.dateOfBirth ?? '', phone: normalisePhone(d.phone) };
    const same = seen.filter((p) => p.name === key.name && ((!!key.dob && p.dob === key.dob) || (!!key.phone && p.phone === key.phone) || (!key.dob && !key.phone)));
    if (same.length) return void results.push({ line, fullName: d.fullName, state: 'DUPLICATE', ...(global ? {matches: same.slice(0, 3).map((p) => p.label)} : {message:'Possible duplicate; ask Central Administration to review'}) });
    seen.push({ ...key, label: `${d.fullName} (this file, line ${line})` });
    toCreate.push(d);
    results.push({ line, fullName: d.fullName, state: 'OK' });
  });
  const summary = { ok: results.filter((r) => r.state === 'OK').length, duplicates: results.filter((r) => r.state === 'DUPLICATE').length, errors: results.filter((r) => r.state === 'ERROR').length };
  if (!parsed.data.commit) return res.json({ committed: false, summary, rows: results });
  let created = 0;
  for (const d of toCreate) {
    await prisma.$transaction(async tx => {
    const person = await tx.person.create({
      data: {
        id: `p-${crypto.randomUUID().slice(0, 8)}`,
        memberCode: await nextMemberCode(tx as unknown as typeof prisma),
        fullName: d.fullName,
        phone: d.phone || undefined,
        email: d.email || undefined,
        dateOfBirth: d.dateOfBirth || undefined,
        gender: d.gender || undefined,
        status: d.status || 'ACTIVE',
        joinedChurchOn: d.joinedChurchOn || undefined,
        address: d.address || undefined,
      },
    });
    if (home) await tx.membership.create({data:{id:`mem-${crypto.randomUUID()}`,personId:person.id,orgUnitId:home,systemId,type:'MEMBER',label:'Member',status:'ACTIVE',startDate:new Date()}});
    for (const record of d.records ?? []) await tx.personRecord.create({data:{personId:person.id,section:record.section,dataJson:JSON.stringify(record.data),status:'CURRENT',recordedById:me}});
    });
    created++;
  }
  await prisma.auditEvent.create({ data: { at: new Date(), actorId: req.auth!.personId, systemId, action: 'PERSON_IMPORT', resource: 'PERSON', detail: `Imported ${created} people`, metaJson: JSON.stringify(summary) } });
  res.status(201).json({ committed: true, created, summary, rows: results });
});

/** Groups of records that look like one person: the same name and birth date, or the same name and phone. */
peopleToolsRouter.get('/duplicates', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await mayManage(req.auth!.personId))) return res.status(403).json({ error: 'You may not review duplicates', code: 'NOT_ALLOWED' });
  const rows = (await prisma.person.findMany({ where: { archivedAt: null } })) as Array<{ id: string; fullName: string; memberCode?: string | null; dateOfBirth?: string | null; phone?: string | null }>;
  const groups = new Map<string, typeof rows>();
  const add = (k: string, p: (typeof rows)[number]) => groups.set(k, [...(groups.get(k) ?? []), p]);
  for (const p of rows) {
    const n = normaliseName(p.fullName);
    if (!n) continue;
    if (p.dateOfBirth) add(`${n}|dob|${p.dateOfBirth}`, p);
    const ph = normalisePhone(p.phone);
    if (ph) add(`${n}|ph|${ph}`, p);
  }
  const out: Array<{ key: string; people: Array<{ id: string; fullName: string; memberCode: string | null }> }> = [];
  const used = new Set<string>();
  for (const [key, g] of groups) {
    const fresh = g.filter((p) => !used.has(p.id));
    if (g.length < 2 || fresh.length < 1) continue;
    g.forEach((p) => used.add(p.id));
    out.push({ key, people: g.map((p) => ({ id: p.id, fullName: p.fullName, memberCode: p.memberCode ?? null })) });
  }
  res.json({ groups: out.slice(0, 100), total: out.length });
});

const DAY = 24 * 3600 * 1000;
/** The next time a MM-DD comes round, from `from` (church time, UTC+2), as a YYYY-MM-DD. */
export function nextOccurrence(isoDay: string, from: Date): { day: string; years: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m) return null;
  const today = new Date(from.getTime() + 2 * 3600 * 1000);
  const y = today.getUTCFullYear();
  const at = (yy: number) => new Date(Date.UTC(yy, Number(m[2]) - 1, Number(m[3])));
  const start = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  let next = at(y);
  if (next.getTime() < start) next = at(y + 1);
  return { day: next.toISOString().slice(0, 10), years: next.getUTCFullYear() - Number(m[1]) };
}

/** Birthdays and joining anniversaries in the next days. Only people who may see the people module read them. */
peopleToolsRouter.get('/upcoming', requireAuth, async (req: AuthedRequest, res) => {
  const tier = await personTier(req.auth!.personId, '\u0000');
  if (tier !== 'FULL' && tier !== 'BASIC') return res.status(403).json({ error: 'You may not see this', code: 'NOT_ALLOWED' });
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const now = new Date();
  const limit = now.getTime() + days * DAY;
  const rows = (await prisma.person.findMany({ where: { archivedAt: null } })) as Array<{ id: string; fullName: string; memberCode?: string | null; status: string; dateOfBirth?: string | null; joinedChurchOn?: string | null }>;
  const events: Array<{ personId: string; name: string; memberCode: string | null; kind: 'BIRTHDAY' | 'ANNIVERSARY'; day: string; years: number }> = [];
  for (const p of rows) {
    if (p.status === 'INACTIVE') continue;
    for (const [kind, src] of [['BIRTHDAY', p.dateOfBirth], ['ANNIVERSARY', p.joinedChurchOn]] as const) {
      const n = src ? nextOccurrence(src, now) : null;
      if (n && n.years > 0 && new Date(`${n.day}T00:00:00Z`).getTime() <= limit) events.push({ personId: p.id, name: p.fullName, memberCode: p.memberCode ?? null, kind, day: n.day, years: n.years });
    }
  }
  events.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  res.json({ days, events: events.slice(0, 200) });
});
