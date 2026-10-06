import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { buildEffectiveAccess } from '../policy/evaluate.js';
import { loadPolicyContext } from '../policy/loadContext.js';
import type { Position } from '../policy/types.js';
import { blocksFromModules } from '../capabilities/letters.js';
import { liveHoldings, lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { officeOf } from '../lib/offices.js';
import { loadNotices, mutedSystemsOf } from '../notifications/feed.js';
import { countNotices } from '../notifications/rules.js';
import { SHARED_BLOCKS, type AccessLetter } from '../shared/vocabulary.js';
import { SETTINGS_EDITORS } from '../settings/catalog.js';

export const meRouter = Router();
export const portalRouter = Router();

const isLive = (p: { status: string; startDate: string; endDate?: string }, now: Date) =>
  p.status === 'ACTIVE' &&
  new Date(p.startDate) <= now &&
  (!p.endDate || new Date(p.endDate) >= now);

/** Everything the server knows about this person's standing, computed once per request. */
async function standing(personId: string) {
  const now = new Date();
  const ctx = await loadPolicyContext();
  const grants = buildEffectiveAccess(personId, ctx, now);
  const positions = ctx.positions.filter((p) => p.personId === personId && isLive(p, now));
  const memberships = ctx.memberships.filter((m) => m.personId === personId && isLive(m, now));
  const systems = await prisma.churchSystem.findMany({ orderBy: { code: 'asc' } });
  // The shared Finance system is being retired; it is never a place a person enters.
  const enterable = systems.filter(
    (s) =>
      (s.kind ?? 'MINISTRY') !== 'SHARED' &&
      grants.some((g) => g.systemId === s.id && g.resource === 'SYSTEM' && g.action === 'ENTER'),
  );
  const access: AccessData = {
    positions: ctx.positions,
    memberships: ctx.memberships,
    delegations: await prisma.delegation.findMany({ where: { toPersonId: personId } }),
  };
  return { grants, positions, memberships, enterable, access };
}

function roleLabel(
  systemId: string,
  positions: Position[],
  memberships: { systemId?: string; label: string }[],
): string {
  const own = positions.find((p) => p.systemId === systemId);
  if (own) return own.title;
  const governing = positions.find((p) => p.grantsAllSystems);
  if (governing) return governing.title;
  const member = memberships.find((m) => m.systemId === systemId);
  return member?.label ?? 'Member';
}

/** The portal: one card per system this person may enter. */
portalRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const s = await standing(req.auth!.personId);
  const counts = countNotices(await loadNotices(req.auth!.personId));
  res.json({
    systems: s.enterable.map((sys) => ({
      id: sys.id,
      code: sys.code,
      name: sys.name ?? sys.id,
      shortName: sys.shortName ?? sys.name ?? sys.id,
      basePath: sys.basePath,
      role: roleLabel(sys.id, s.positions, s.memberships),
      unreadCount: counts.bySystem[sys.id] ?? 0,
    })),
  });
});


/**
 * A system's own blocks after the six shared ones (slices 2.1 and 2.2): Governance in every
 * system where the person holds a Governance letter, and Settings in Central Administration
 * for the offices that run it (they change settings; Administrators only read them).
 */
function ownBlocks(systemId: string, modules: Record<string, AccessLetter[]>, holdings: ReturnType<typeof liveHoldings>) {
  const own: Array<{ key: 'governance' | 'settings'; letters: AccessLetter[] }> = [];
  if ((modules.GOVERNANCE ?? []).length > 0) own.push({ key: 'governance', letters: modules.GOVERNANCE });
  if (systemId === 'sys-main') {
    const offices = holdings.filter((h) => h.via === 'OFFICE').map((h) => h.office as string);
    if (offices.some((o) => (SETTINGS_EDITORS as readonly string[]).includes(o))) own.push({ key: 'settings', letters: ['R', 'W'] });
    else if (offices.includes('ADMINISTRATOR')) own.push({ key: 'settings', letters: ['R'] });
  }
  return own;
}

/** What this person may do, so the app can show or hide screens. The server checks again on every call. */
meRouter.get('/capabilities', requireAuth, async (req: AuthedRequest, res) => {
  const s = await standing(req.auth!.personId);
  const holdings = liveHoldings(req.auth!.personId, s.access, new Date());
  res.json({
    personId: req.auth!.personId,
    offices: s.positions
      .map((p) => ({
        id: p.id,
        systemId: p.systemId ?? null,
        title: p.title,
        code: officeOf(p),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    systems: s.enterable.map((sys) => {
      const modules = lettersInSystem(req.auth!.personId, sys.id, s.access, new Date(), holdings);
      return {
        id: sys.id,
        blocks: blocksFromModules(modules),
        own: ownBlocks(sys.id, modules, holdings),
      };
    }),
    blockOrder: SHARED_BLOCKS,
  });
});

/* ───────────── preferences (slice 1.4) ───────────── */

const LANGUAGES = ['en', 'rw', 'fr'] as const;

/** Kept on the server so a person's choices follow them to every device. */
meRouter.get('/preferences', requireAuth, async (req: AuthedRequest, res) => {
  const pref = (await prisma.preference.findFirst({ where: { personId: req.auth!.personId } })) as { language?: string | null } | null;
  res.json({
    language: pref?.language ?? null,
    mutedSystems: await mutedSystemsOf(req.auth!.personId),
    languages: LANGUAGES,
  });
});

const prefSchema = z.object({
  language: z.enum(LANGUAGES).nullable().optional(),
  /** Systems whose "For information" notices are muted. Things waiting for you can never be muted. */
  mutedSystems: z.array(z.string().min(1).max(60)).max(40).optional(),
});

meRouter.put('/preferences', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = prefSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid preferences', code: 'BAD_REQUEST' });
  const me = req.auth!.personId;
  const data: Record<string, unknown> = {};
  if (parsed.data.language !== undefined) data.language = parsed.data.language;
  if (parsed.data.mutedSystems !== undefined) {
    const known = new Set((await prisma.churchSystem.findMany({ select: { id: true } })).map((x: { id: string }) => x.id));
    const unknown = parsed.data.mutedSystems.filter((id) => !known.has(id));
    if (unknown.length) return res.status(400).json({ error: 'Unknown system', code: 'UNKNOWN_SYSTEM', unknown });
    data.mutedSystemsJson = JSON.stringify([...new Set(parsed.data.mutedSystems)].sort());
  }
  await prisma.preference.upsert({ where: { personId: me }, create: { personId: me, ...data }, update: data });
  res.json({
    language: (data.language as string | null | undefined) ?? ((await prisma.preference.findFirst({ where: { personId: me } })) as { language?: string | null } | null)?.language ?? null,
    mutedSystems: await mutedSystemsOf(me),
  });
});
