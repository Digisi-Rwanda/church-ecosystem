/**
 * Notifications (slice 1.4): the two tabs (Waiting for me, For information), read state
 * and the counts the Portal and each system's Home show. Everything is per person; one
 * person can never read, or mark read, another's.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadNotices } from '../notifications/feed.js';
import { countNotices, type Notice } from '../notifications/rules.js';

export const notificationsRouter = Router();

const TABS = { waiting: 'WAITING_FOR_ME', info: 'FOR_INFORMATION' } as const;

const shape = (n: Notice) => ({
  key: n.key,
  kind: n.kind,
  title: n.title,
  body: n.body,
  href: n.href,
  systemId: n.systemId,
  createdAt: n.createdAt,
  read: n.read,
  important: n.important,
});

notificationsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const all = await loadNotices(req.auth!.personId);
  const tab = typeof req.query.tab === 'string' ? req.query.tab : undefined;
  const system = typeof req.query.system === 'string' ? req.query.system : undefined;
  const unreadOnly = req.query.unread === 'true';
  const items = all
    .filter((n) => !tab || (tab in TABS && n.kind === TABS[tab as keyof typeof TABS]))
    .filter((n) => !system || n.systemId === system)
    .filter((n) => !unreadOnly || !n.read)
    .slice(0, 200);
  res.json({ items: items.map(shape), counts: countNotices(all) });
});

/** The numbers and the few most urgent things, for the Portal badge and the Urgent tile on Home. */
notificationsRouter.get('/summary', requireAuth, async (req: AuthedRequest, res) => {
  const all = await loadNotices(req.auth!.personId);
  const system = typeof req.query.system === 'string' ? req.query.system : undefined;
  res.json({
    counts: countNotices(all),
    urgent: all
      .filter((n) => n.kind === 'WAITING_FOR_ME' && (!system || n.systemId === system))
      .slice(0, 5)
      .map(shape),
  });
});

const readSchema = z.object({
  keys: z.array(z.string().min(1).max(200)).max(500).optional(),
  all: z.boolean().optional(),
  tab: z.enum(['waiting', 'info']).optional(),
  system: z.string().optional(),
});

notificationsRouter.post('/read', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = readSchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.keys?.length && !parsed.data.all)) {
    return res.status(400).json({ error: 'Say which notifications to mark read', code: 'BAD_REQUEST' });
  }
  const me = req.auth!.personId;
  const d = parsed.data;
  const all = await loadNotices(me);
  // Only notices this person can actually see can be marked: no junk rows, nothing of anyone else's.
  const wanted = d.all
    ? all.filter((n) => (!d.tab || n.kind === TABS[d.tab]) && (!d.system || n.systemId === d.system))
    : all.filter((n) => d.keys!.includes(n.key));
  let marked = 0;
  for (const n of wanted) {
    if (n.read) continue;
    try {
      await prisma.notificationRead.create({ data: { personId: me, key: n.key } });
      marked++;
    } catch {
      /* already read on another device at the same moment */
    }
  }
  res.json({ marked });
});

const unreadSchema = z.object({ keys: z.array(z.string().min(1).max(200)).min(1).max(500) });

notificationsRouter.post('/unread', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = unreadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Say which notifications', code: 'BAD_REQUEST' });
  const r = await prisma.notificationRead.deleteMany({ where: { personId: req.auth!.personId, key: { in: parsed.data.keys } } });
  res.json({ marked: r.count });
});
