/**
 * Due to move (Systems redesign 1): the list of people due to change system, and the confirmation.
 * The president or secretary of the system a person is leaving confirms; nothing moves by itself.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { liveHoldings, lettersInSystem } from '../capabilities/engine.js';
import { DEFAULTS, resolve, type MoveRules } from '../settings/catalog.js';
import { canConfirmMove, isMoveSystem, suggestMove, validTarget, MOVE_SYSTEMS } from '../moves/rules.js';

export const movesRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const todayStr = () => new Date().toISOString().slice(0, 10);

interface PersonRow { id: string; fullName: string; gender?: string | null; dateOfBirth?: string | null; archivedAt?: Date | string | null; status?: string }
interface MemberRow { id: string; personId: string; systemId?: string | null; orgUnitId?: string | null; type: string; label?: string | null; status: string }
interface PairRow { personAId: string; personBId: string; status: string }
interface RecordRow { personId: string; section: string; status: string }
interface UnitRow { id: string; systemId?: string | null; parentId?: string | null }

async function rules(): Promise<MoveRules> {
  const rows = (await prisma.setting.findMany()) as Array<{ key: string; valueJson: string }>;
  return resolve(rows)['moves.rules'] ?? DEFAULTS['moves.rules'];
}

async function marriedIds(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const p of (await prisma.couplePair.findMany()) as PairRow[]) if (p.status === 'ACTIVE') { out.add(p.personAId); out.add(p.personBId); }
  for (const r of (await prisma.personRecord.findMany()) as RecordRow[]) if (r.section === 'MARRIAGE' && r.status === 'CURRENT') out.add(r.personId);
  return out;
}

movesRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : '';
  if (!isMoveSystem(systemId)) return fail(res, 404, 'NOT_FOUND', 'No move list here');
  const { data } = await loadAccessData(me);
  const peopleLetters = lettersInSystem(me, systemId, data).PEOPLE as string[];
  if (!peopleLetters.includes('R')) return fail(res, 404, 'NOT_FOUND', 'No move list here');
  const r = await rules();
  const married = await marriedIds();
  const members = ((await prisma.membership.findMany({ where: { systemId } })) as MemberRow[]).filter((m) => m.systemId === systemId && m.status === 'ACTIVE');
  const ids = [...new Set(members.map((m) => m.personId))];
  const people = ids.length ? ((await prisma.person.findMany({ where: { id: { in: ids } } })) as PersonRow[]) : [];
  const today = todayStr();
  const due = people
    .filter((p) => !p.archivedAt && (!p.status || p.status === 'ACTIVE'))
    .flatMap((p) => {
      const s = suggestMove(systemId, { dateOfBirth: p.dateOfBirth ?? null, gender: p.gender ?? null, married: married.has(p.id) }, r, today);
      return s ? [{ personId: p.id, fullName: p.fullName, age: s.age, reason: s.reason, toSystemId: s.toSystemId }] : [];
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const canConfirm = canConfirmMove(liveHoldings(me, data, new Date()), systemId);
  const names = new Map(((await prisma.churchSystem.findMany()) as Array<{ id: string; name?: string | null; shortName?: string | null }>).map((s) => [s.id, s.shortName ?? s.name ?? s.id]));
  res.json({ canConfirm, rules: r, due: due.map((d) => ({ ...d, toName: names.get(d.toSystemId) ?? d.toSystemId })) });
});

const confirmSchema = z.object({ personId: z.string().min(1), fromSystemId: z.string().min(1), toSystemId: z.string().min(1) });

movesRouter.post('/confirm', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Check the move and try again');
  const { personId, fromSystemId, toSystemId } = parsed.data;
  if (!isMoveSystem(fromSystemId) || !validTarget(fromSystemId, toSystemId)) return fail(res, 400, 'BAD_MOVE', 'That move is not allowed');
  const me = req.auth!.personId;
  const { data, units } = await loadAccessData(me);
  if (!lettersInSystem(me, fromSystemId, data).PEOPLE.includes('R')) return fail(res, 404, 'NOT_FOUND', 'No move list here');
  if (!canConfirmMove(liveHoldings(me, data, new Date()), fromSystemId)) return fail(res, 403, 'NOT_ALLOWED', 'Only the president or secretary confirms a move');
  const current = ((await prisma.membership.findMany({ where: { personId } })) as MemberRow[]).filter((m) => m.personId === personId && m.systemId === fromSystemId && m.status === 'ACTIVE');
  if (current.length === 0) return fail(res, 404, 'NOT_MEMBER', 'That person is not a member here');
  const person = (await prisma.person.findUnique({ where: { id: personId } })) as PersonRow | null;
  if (!person) return fail(res, 404, 'NOT_FOUND', 'Person not found');
  const now = new Date();
  const target = ((units as UnitRow[]).find((u) => u.systemId === toSystemId && !u.parentId) ?? (units as UnitRow[]).find((u) => u.systemId === toSystemId)) ?? null;
  const already = ((await prisma.membership.findMany({ where: { personId } })) as MemberRow[]).some((m) => m.systemId === toSystemId && m.status === 'ACTIVE');
  for (const m of current) await prisma.membership.update({ where: { id: m.id }, data: { status: 'ENDED', endDate: now } });
  if (!already) {
    await prisma.membership.create({
      data: { personId, systemId: toSystemId, orgUnitId: target?.id ?? null, type: 'MEMBER', label: 'Member', status: 'ACTIVE', startDate: now },
    });
  }
  await prisma.auditEvent.create({
    data: { at: now, actorId: me, systemId: fromSystemId, action: 'MEMBER_MOVED', resource: 'PEOPLE', detail: `${person.fullName} moved from ${fromSystemId} to ${toSystemId}`, metaJson: JSON.stringify({ personId, fromSystemId, toSystemId }) },
  });
  res.json({ ok: true });
});

export const MOVE_LIST = MOVE_SYSTEMS;
