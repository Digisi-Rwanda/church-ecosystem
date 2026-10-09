/**
 * The public registration link for an event. The team turns it on; the link holds a secret
 * token. It shows only what an invitation shows (title, aim, place, time, places left) and takes
 * only a name and a phone number. Nothing else of the plan is reachable from here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { rateLimit } from '../middleware/hardening.js';
import { registrationsOf, spotsLeft } from './workPlans.js';

export const publicEventsRouter = Router();

interface P {
  id: string; title: string; aim?: string | null; location?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null;
  status: string; planType?: string | null; registrationOpen?: boolean | null; capacity?: number | null; publicToken?: string | null; deletedAt?: Date | null; orgUnitId: string;
}
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

async function byToken(token: string): Promise<P | null> {
  if (!token || token.length < 16) return null;
  const rows = (await prisma.workPlan.findMany()) as P[];
  const p = rows.find((r) => r.publicToken === token && !r.deletedAt && (r.planType ?? 'PROJECT') === 'EVENT');
  return p ?? null;
}
const isOpen = (p: P) => !!p.registrationOpen && ['SETUP', 'RUNNING'].includes(p.status);

publicEventsRouter.use(rateLimit({ name: 'public-events', limit: 60, windowMs: 60 * 60 * 1000 }));

publicEventsRouter.get('/:token', async (req, res) => {
  const p = await byToken(String(req.params.token));
  if (!p) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  const left = spotsLeft(p.capacity, (await registrationsOf(p.id)).length);
  res.json({ event: { title: p.title, aim: p.aim ?? '', location: p.location ?? '', startsOn: iso(p.startsOn), endsOn: iso(p.endsOn), open: isOpen(p) && left !== 0, full: left === 0 } });
});

publicEventsRouter.post('/:token', async (req, res) => {
  const p = await byToken(String(req.params.token));
  if (!p) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(6).max(30), website: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid registration', code: 'BAD_INPUT' });
  // A hidden field only a script fills in: pretend it worked.
  if (parsed.data.website) return res.status(201).json({ ok: true });
  if (!isOpen(p)) return res.status(409).json({ error: 'Registration is closed', code: 'REGISTRATION_CLOSED' });
  const regs = await registrationsOf(p.id);
  if (spotsLeft(p.capacity, regs.length) === 0) return res.status(409).json({ error: 'Full', code: 'EVENT_FULL' });
  const phone = parsed.data.phone.replace(/\s+/g, '');
  if (regs.some((r) => (r.phone ?? '').replace(/\s+/g, '') === phone)) return res.status(409).json({ error: 'Already registered', code: 'ALREADY_REGISTERED' });
  await prisma.workPlanRegistration.create({ data: { planId: p.id, personId: null, name: parsed.data.name, phone: parsed.data.phone, source: 'PUBLIC' } });
  res.status(201).json({ ok: true });
});
