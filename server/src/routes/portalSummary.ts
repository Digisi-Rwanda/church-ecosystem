/**
 * What the Portal's People and Reports pages show: the latest published reports and the number of
 * active members, each only for the systems where the caller holds the letter that opens them
 * (the same rule as the system's own pages). Nothing here changes data.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { lettersInSystem } from '../capabilities/engine.js';
import { canReadReports } from '../reports/access.js';

export const portalSummaryRouter = Router();

interface ReportRow { id: string; systemId: string; orgUnitId: string; kind: string; periodKey: string; title: string; status: string; publishedAt?: Date | string | null; deletedAt?: Date | string | null }
interface UnitRow { id: string; name: string }
interface MemberRow { personId: string; systemId?: string | null; status: string }

const LATEST = 30;

portalSummaryRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const now = new Date();
  const { data } = await loadAccessData(me);
  const systems = ((await prisma.churchSystem.findMany()) as Array<{ id: string; kind?: string | null }>).filter((s) => (s.kind ?? 'MINISTRY') !== 'SHARED');

  const readable = new Set(systems.filter((s) => canReadReports(me, s.id, data, now)).map((s) => s.id));
  const units = new Map(((await prisma.orgUnit.findMany()) as UnitRow[]).map((u) => [u.id, u.name]));
  const reports = ((await prisma.report.findMany()) as ReportRow[])
    .filter((r) => readable.has(r.systemId) && r.status === 'PUBLISHED' && !r.deletedAt)
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || +new Date(b.publishedAt ?? 0) - +new Date(a.publishedAt ?? 0))
    .slice(0, LATEST)
    .map((r) => ({
      id: r.id, systemId: r.systemId, unitName: units.get(r.orgUnitId) ?? '', kind: r.kind, periodKey: r.periodKey,
      publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    }));

  const peopleSystems = systems.filter((s) => (lettersInSystem(me, s.id, data, now).PEOPLE as string[]).includes('R'));
  const members = (await prisma.membership.findMany()) as MemberRow[];
  const people = peopleSystems.map((s) => ({
    systemId: s.id,
    members: new Set(members.filter((m) => m.systemId === s.id && m.status === 'ACTIVE').map((m) => m.personId)).size,
  }));

  res.json({ reports, people });
});
