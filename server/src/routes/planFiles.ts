/**
 * Files attached to an activity (a proposal, a letter, a budget sheet, a picture). Mounted under /api/work-plans ahead of the plan routes.
 * Anyone who may see the activity may read its files; those who run it, or hold the writing letter of its unit, add and remove them.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { canSee } from '../work/rules.js';
import { asWorkRow, canManagePlan, type PlanRow } from '../work/plan.js';

export const planFilesRouter = Router();
type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });

export const FILE_MAX = 1_500_000;
export const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
interface FileRow { id: string; planId: string; name: string; mime: string; size: number; dataBase64?: string; uploadedById: string; uploadedAt: Date | string; deletedAt?: Date | string | null }
interface Plan extends PlanRow { title: string }

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as Plan | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  return { me, data, p };
}

const live = async (planId: string) =>
  ((await prisma.planFile.findMany({ where: { planId } })) as FileRow[]).filter((f) => f.planId === planId && !f.deletedAt).sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));

/** How many live files each activity holds: one pass for the whole list. */
export async function fileCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const f of (await prisma.planFile.findMany()) as FileRow[]) if (!f.deletedAt) out.set(f.planId, (out.get(f.planId) ?? 0) + 1);
  return out;
}

planFilesRouter.get('/:id/files', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const rows = await live(got.p.id);
  const who = new Map(((await prisma.person.findMany({ where: { id: { in: [...new Set(rows.map((f) => f.uploadedById))] } } })) as Array<{ id: string; fullName: string }>).map((x) => [x.id, x.fullName]));
  res.json({
    canWrite: canManagePlan(got.p, got.me, got.data) && got.p.status !== 'CANCELLED',
    items: rows.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, uploadedByName: who.get(f.uploadedById) ?? '', uploadedAt: new Date(f.uploadedAt).toISOString() })),
  });
});

planFilesRouter.post('/:id/files', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  if (!canManagePlan(got.p, got.me, got.data)) return fail(res, 403, 'FORBIDDEN', 'You may not add files to this activity');
  if (got.p.status === 'CANCELLED') return fail(res, 409, 'WRONG_STATE', 'This activity is cancelled');
  const parsed = z.object({ name: z.string().trim().min(1).max(160), mime: z.string().max(120), data: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the file');
  const b = parsed.data;
  if (!FILE_TYPES.includes(b.mime)) return fail(res, 400, 'BAD_TYPE', 'That kind of file is not accepted');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)) return fail(res, 400, 'BAD_INPUT', 'Check the file');
  const size = Math.floor((b.data.length * 3) / 4) - (b.data.endsWith('==') ? 2 : b.data.endsWith('=') ? 1 : 0);
  if (size > FILE_MAX) return fail(res, 413, 'TOO_BIG', 'The file is too big (1.5 MB at most)');
  if ((await live(got.p.id)).length >= 20) return fail(res, 409, 'TOO_MANY', 'An activity holds 20 files at most');
  const row = (await prisma.planFile.create({ data: { planId: got.p.id, name: b.name, mime: b.mime, size, dataBase64: b.data, uploadedById: got.me, uploadedAt: new Date() } })) as FileRow;
  await prisma.auditEvent.create({ data: { at: new Date(), actorId: got.me, systemId: got.p.systemId, action: 'WORKPLAN_FILE_ADDED', resource: 'WORK', detail: `${b.name} on “${got.p.title}”`, metaJson: JSON.stringify({ planId: got.p.id, fileId: row.id }) } });
  res.status(201).json({ id: row.id });
});

planFilesRouter.get('/:id/files/:fileId/file', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const f = (await prisma.planFile.findUnique({ where: { id: String(req.params.fileId) } })) as FileRow | null;
  if (!f || f.planId !== got.p.id || f.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  res.json({ name: f.name, mime: f.mime, data: f.dataBase64 ?? '' });
});

planFilesRouter.delete('/:id/files/:fileId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  if (!canManagePlan(got.p, got.me, got.data)) return fail(res, 403, 'FORBIDDEN', 'You may not remove files from this activity');
  const f = (await prisma.planFile.findUnique({ where: { id: String(req.params.fileId) } })) as FileRow | null;
  if (!f || f.planId !== got.p.id || f.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  await prisma.planFile.update({ where: { id: f.id }, data: { deletedAt: new Date(), deletedById: got.me } });
  await prisma.auditEvent.create({ data: { at: new Date(), actorId: got.me, systemId: got.p.systemId, action: 'WORKPLAN_FILE_REMOVED', resource: 'WORK', detail: `${f.name} from “${got.p.title}”`, metaJson: JSON.stringify({ planId: got.p.id, fileId: f.id }) } });
  res.json({ ok: true });
});
