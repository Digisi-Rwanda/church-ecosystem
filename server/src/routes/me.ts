import { COUPLES, ELDERLY, INTERCESSORS } from '../caring/rules.js';
import { MUSIC } from '../music/rules.js';
import { EVANGELISM } from '../evangelism/rules.js';
import { KIND_BY_SYSTEM } from '../groups/rules.js';
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
  const own: Array<{ key: 'central' | 'governance' | 'settings' | 'groups' | 'couples' | 'visits' | 'watches' | 'contacts' | 'pulpit' | 'collections' | 'monthplan' | 'choirs' | 'oversight' | 'rehearsals' | 'repertoire' | 'sponsorship' | 'roster' | 'teams' | 'mine' | 'deaconreports'; letters: AccessLetter[]; variant?: string }> = [];
  // Central Administration home (slice 2.4): the main church's leaders see the whole church at a glance.
  if (systemId === 'sys-main' && (modules.GOVERNANCE ?? []).length > 0) own.push({ key: 'central', letters: modules.GOVERNANCE });
  if ((modules.GOVERNANCE ?? []).length > 0) own.push({ key: 'governance', letters: modules.GOVERNANCE });
  if (systemId in KIND_BY_SYSTEM && (modules.PEOPLE ?? []).length > 0) own.push({ key: 'groups', letters: modules.PEOPLE, variant: KIND_BY_SYSTEM[systemId] });
  if (systemId === COUPLES && (modules.PEOPLE ?? []).length > 0) own.push({ key: 'couples', letters: modules.PEOPLE });
  if (systemId === ELDERLY && (modules.PEOPLE ?? []).includes('W')) own.push({ key: 'visits', letters: modules.PEOPLE });
  if (systemId === INTERCESSORS && (modules.SCHEDULING ?? []).length > 0) own.push({ key: 'watches', letters: modules.SCHEDULING });
  if (systemId === EVANGELISM && (modules.PEOPLE ?? []).length > 0) own.push({ key: 'contacts', letters: modules.PEOPLE });
  if (systemId === EVANGELISM && (modules.SCHEDULING ?? []).length > 0) own.push({ key: 'pulpit', letters: modules.SCHEDULING });
  // The Church Leader (and anyone holding a church-wide office) sees the pulpit plan from Central Administration too.
  if (systemId === 'sys-main' && holdings.some((h) => h.scope === 'CHURCH' && h.letters.PEOPLE?.includes('W'))) own.push({ key: 'pulpit', letters: ['R', 'W'] });
  if ((systemId === EVANGELISM || systemId === 'sys-main') && (modules.GOVERNANCE ?? []).length > 0) own.push({ key: 'collections', letters: modules.GOVERNANCE });
  if (systemId === MUSIC && (modules.SCHEDULING ?? []).length > 0) own.push({ key: 'monthplan', letters: modules.SCHEDULING });
  if ((systemId === MUSIC || systemId === 'sys-choir' || systemId === 'sys-worship') && (modules.PEOPLE ?? []).length > 0) own.push({ key: 'choirs', letters: modules.PEOPLE });
  if ((systemId === 'sys-choir' || systemId === 'sys-worship') && (modules.PEOPLE ?? []).length > 0) {
    own.push({ key: 'rehearsals', letters: modules.PEOPLE });
    own.push({ key: 'sponsorship', letters: modules.PEOPLE });
  }
  if ((systemId === 'sys-choir' || systemId === 'sys-worship') && (modules.SCHEDULING ?? []).length > 0) own.push({ key: 'repertoire', letters: modules.SCHEDULING });
  if (systemId === MUSIC && (modules.PEOPLE ?? []).length > 0) own.push({ key: 'oversight', letters: modules.PEOPLE });
  if (systemId === 'sys-protocol') {
    if ((modules.PEOPLE ?? []).length > 0) own.push({ key: 'roster', letters: modules.PEOPLE }, { key: 'teams', letters: modules.SCHEDULING ?? ['R'] });
    own.push({ key: 'mine', letters: ['R'] });
  }
  if (systemId === 'sys-deacon' && (modules.PEOPLE ?? []).length > 0) own.push({ key: 'deaconreports', letters: modules.PEOPLE });
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
