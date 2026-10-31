/**
 * The daily digest (slice 4.4). A person previews theirs here; the job that sends them is started by a scheduler
 * (the DIGEST_SECRET header) or by an Administrator. Sending twice in a day is impossible: one log row per person per day.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData, loadNotices } from '../notifications/feed.js';
import { isAdministrator } from '../lib/peopleScope.js';
import { composeDigest, gatewayFromEnv, runDigests } from '../digest/digest.js';

export const digestRouter = Router();

const appUrl = () => process.env.PUBLIC_APP_URL ?? process.env.CORS_ORIGIN?.split(',')[0] ?? 'https://church-ecosystem-eight.vercel.app';

/** What today's digest would say for me, whether or not I have switched it on. */
digestRouter.get('/preview', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const [notices, pref] = await Promise.all([loadNotices(me), prisma.preference.findFirst({ where: { personId: me } })]);
  const digest = composeDigest(notices, appUrl());
  res.json({ channel: (pref as { digestChannel?: string } | null)?.digestChannel ?? 'OFF', digest });
});

digestRouter.post('/run', async (req, res, next) => {
  const secret = process.env.DIGEST_SECRET;
  const bySecret = !!secret && req.headers['x-cron-secret'] === secret;
  if (bySecret) return go();
  await requireAuth(req as AuthedRequest, res, async () => {
    const { data } = await loadAccessData((req as AuthedRequest).auth!.personId);
    if (!isAdministrator((req as AuthedRequest).auth!.personId, data)) return res.status(403).json({ error: 'Only an Administrator can send the digests', code: 'NOT_ALLOWED' });
    return go();
  });
  async function go() {
    try {
      const result = await runDigests(prisma as never, (id) => loadNotices(id), gatewayFromEnv(), { appUrl: appUrl() });
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
});
