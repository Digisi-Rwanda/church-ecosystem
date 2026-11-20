/**
 * Announcements (slice 1.5): post to an audience you may send to, read what reaches you,
 * take a post down. Visibility is worked out on every read from the letters engine.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { type AccessData } from '../capabilities/engine.js';
import {
  AUDIENCE_KINDS,
  BODY_MAX,
  MAIN,
  TITLE_MAX,
  canPostTo,
  canSendIn,
  canWithdraw,
  isOpen,
  reaches,
  readKey,
  targetSystem,
  type AnnouncementRow,
} from '../announcements/rules.js';
import { OFFICE_CODES } from '../shared/vocabulary.js';

export const announcementsRouter = Router();

const LIST_LIMIT = 100;

const fail = (res: import('express').Response, status: number, code: string, error: string) =>
  res.status(status).json({ error, code });

async function names(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids)];
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}

const systemName = async (): Promise<Map<string, string>> => {
  const rows = (await prisma.churchSystem.findMany()) as Array<{ id: string; name: string; shortName?: string }>;
  return new Map(rows.map((s) => [s.id, s.shortName || s.name]));
};

const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

/** What this person sees, newest first, with read state and whether they may take each post down. */
async function visibleTo(personId: string, data: AccessData, now = new Date()) {
  const rows = (await prisma.announcement.findMany({ where: { status: 'PUBLISHED' } })) as AnnouncementRow[];
  const mine = rows
    .filter((a) => isOpen(a, now) && reaches(a, personId, data, now))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, LIST_LIMIT);
  const reads = (await prisma.notificationRead.findMany({ where: { personId } })) as Array<{ key: string }>;
  const seen = new Set(reads.map((r) => r.key));
  const who = await names(mine.map((a) => a.authorId));
  const systems = await systemName();
  return mine.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    audience: {
      kind: a.audienceKind,
      systemId: a.audienceSystemId ?? null,
      systemName: a.audienceSystemId ? (systems.get(a.audienceSystemId) ?? a.audienceSystemId) : null,
      office: a.audienceOffice ?? null,
    },
    authorId: a.authorId,
    authorName: who.get(a.authorId) ?? '',
    publishedAt: iso(a.publishedAt),
    expiresAt: iso(a.expiresAt),
    editedAt: iso(a.editedAt),
    read: seen.has(readKey(a.id)) || a.authorId === personId,
    mine: a.authorId === personId,
    canWithdraw: canWithdraw(a, personId, data, now),
  }));
}

announcementsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const { data } = await loadAccessData(req.auth!.personId);
  const items = await visibleTo(req.auth!.personId, data);
  res.json({ items, unread: items.filter((i) => !i.read).length });
});

/** The count for the Portal bar and the few latest for the Portal home strip. */
announcementsRouter.get('/summary', requireAuth, async (req: AuthedRequest, res) => {
  const { data } = await loadAccessData(req.auth!.personId);
  const items = await visibleTo(req.auth!.personId, data);
  res.json({ unread: items.filter((i) => !i.read).length, latest: items.slice(0, 3) });
});

/** What this person may post to, so the form offers only audiences the server will accept. */
announcementsRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const systems = (await prisma.churchSystem.findMany()) as Array<{ id: string; name: string; shortName?: string; kind?: string }>;
  const wholeChurch = canSendIn(me, MAIN, data);
  res.json({
    wholeChurch,
    offices: wholeChurch ? [...OFFICE_CODES] : [],
    systems: systems
      .filter((s) => (s.kind ?? 'MINISTRY') !== 'SHARED' && canSendIn(me, s.id, data))
      .map((s) => ({ id: s.id, name: s.name, shortName: s.shortName ?? s.name })),
    limits: { titleMax: TITLE_MAX, bodyMax: BODY_MAX },
  });
});

const postSchema = z.object({
  title: z.string().trim().min(3).max(TITLE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
  audience: z.object({
    kind: z.enum(AUDIENCE_KINDS),
    systemId: z.string().optional(),
    office: z.string().optional(),
  }),
  /** A calendar day, YYYY-MM-DD. */
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

announcementsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Give a title, a message and an audience');
  const d = parsed.data;
  const me = req.auth!.personId;
  const now = new Date();
  const aud = d.audience;
  if (aud.kind === 'SYSTEM') {
    if (!aud.systemId) return fail(res, 400, 'BAD_AUDIENCE', 'Choose which system this is for');
    const known = await prisma.churchSystem.findUnique({ where: { id: aud.systemId } });
    if (!known) return fail(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }
  if (aud.kind === 'OFFICE' && !(OFFICE_CODES as readonly string[]).includes(aud.office ?? '')) {
    return fail(res, 400, 'BAD_AUDIENCE', 'Choose an office');
  }
  const { data } = await loadAccessData(me);
  if (!canPostTo(me, aud, data, now)) {
    return fail(res, 403, 'CANNOT_SEND_TO_AUDIENCE', 'You may not send to this audience');
  }
  let expiresAt: Date | null = null;
  if (d.expiresAt) {
    expiresAt = new Date(`${d.expiresAt}T00:00:00.000Z`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() + 24 * 3600 * 1000 <= now.getTime()) {
      return fail(res, 400, 'BAD_DATES', 'The last day must not be in the past');
    }
  }
  const row = (await prisma.announcement.create({
    data: {
      title: d.title,
      body: d.body,
      audienceKind: aud.kind,
      audienceSystemId: aud.kind === 'SYSTEM' ? aud.systemId : null,
      audienceOffice: aud.kind === 'OFFICE' ? aud.office : null,
      systemId: targetSystem({ kind: aud.kind, systemId: aud.systemId }),
      authorId: me,
      status: 'PUBLISHED',
      publishedAt: now,
      expiresAt,
    },
  })) as AnnouncementRow;
  await prisma.auditEvent.create({
    data: {
      at: now,
      actorId: me,
      systemId: row.systemId,
      action: 'ANNOUNCEMENT_POSTED',
      resource: 'ANNOUNCEMENT',
      detail: `Posted “${d.title}” to ${aud.kind}`,
      metaJson: JSON.stringify({ announcementId: row.id, audience: aud }),
    },
  });
  res.status(201).json({ announcement: { id: row.id } });
});

const withdrawSchema = z.object({ reason: z.string().trim().max(300).optional() });

announcementsRouter.post('/:id/withdraw', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Check the reason');
  const me = req.auth!.personId;
  const now = new Date();
  const row = (await prisma.announcement.findUnique({ where: { id: String(req.params.id) } })) as AnnouncementRow | null;
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Announcement not found');
  if (row.status !== 'PUBLISHED') return fail(res, 409, 'ALREADY_WITHDRAWN', 'This announcement is already down');
  const { data } = await loadAccessData(me);
  if (!canWithdraw(row, me, data, now)) return fail(res, 403, 'NOT_ALLOWED', 'You may not take this down');
  await prisma.announcement.update({
    where: { id: row.id },
    data: { status: 'WITHDRAWN', withdrawnAt: now, withdrawnById: me, withdrawnReason: parsed.data.reason || null },
  });
  await prisma.auditEvent.create({
    data: {
      at: now,
      actorId: me,
      systemId: row.systemId,
      action: 'ANNOUNCEMENT_WITHDRAWN',
      resource: 'ANNOUNCEMENT',
      detail: `Took down “${row.title}”`,
      metaJson: JSON.stringify({ announcementId: row.id, reason: parsed.data.reason || null }),
    },
  });
  res.json({ ok: true });
});

const editSchema = z.object({
  title: z.string().trim().min(3).max(TITLE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
  /** A calendar day, or null to show it until it is taken down. */
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Change what a post says or how long it shows. Who it was sent to stays as it was. Same people as may take it down. */
announcementsRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Give a title and a message');
  const me = req.auth!.personId;
  const now = new Date();
  const row = (await prisma.announcement.findUnique({ where: { id: String(req.params.id) } })) as AnnouncementRow | null;
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Announcement not found');
  if (row.status !== 'PUBLISHED') return fail(res, 409, 'ALREADY_WITHDRAWN', 'This announcement is already down');
  const { data } = await loadAccessData(me);
  if (!canWithdraw(row, me, data, now)) return fail(res, 403, 'NOT_ALLOWED', 'You may not change this');
  let expiresAt: Date | null | undefined;
  if (parsed.data.expiresAt === null) expiresAt = null;
  else if (parsed.data.expiresAt) {
    expiresAt = new Date(`${parsed.data.expiresAt}T00:00:00.000Z`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() + 24 * 3600 * 1000 <= now.getTime()) return fail(res, 400, 'BAD_DATES', 'The last day must not be in the past');
  }
  await prisma.announcement.update({
    where: { id: row.id },
    data: { title: parsed.data.title, body: parsed.data.body, editedAt: now, ...(expiresAt !== undefined ? { expiresAt } : {}) },
  });
  await prisma.auditEvent.create({
    data: { at: now, actorId: me, systemId: row.systemId, action: 'ANNOUNCEMENT_EDITED', resource: 'ANNOUNCEMENT', detail: `Changed “${row.title}”`, metaJson: JSON.stringify({ announcementId: row.id }) },
  });
  res.json({ ok: true });
});

const readSchema = z.object({
  ids: z.array(z.string().min(1).max(200)).max(500).optional(),
  all: z.boolean().optional(),
});

announcementsRouter.post('/read', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = readSchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.ids?.length && !parsed.data.all)) {
    return fail(res, 400, 'BAD_REQUEST', 'Say which announcements to mark read');
  }
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const items = await visibleTo(me, data);
  // Only what this person can actually see can be marked.
  const wanted = parsed.data.all ? items : items.filter((i) => parsed.data.ids!.includes(i.id));
  let marked = 0;
  for (const i of wanted) {
    if (i.read) continue;
    try {
      await prisma.notificationRead.create({ data: { personId: me, key: readKey(i.id) } });
      marked++;
    } catch {
      /* already read on another device at the same moment */
    }
  }
  res.json({ marked });
});

