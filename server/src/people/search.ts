/**
 * People search on the shared filter framework. The route has already decided whose people the viewer may list
 * (`scope`) and what they may read (`viewer`); this loads only those people and only the record sections the
 * request needs, evaluates the request, and returns one page.
 */
import { prisma } from '../lib/prisma.js';
import { filterPerson } from '../policy/personFields.js';
import { isLive } from '../capabilities/engine.js';
import { kigaliDay, planRequest, runSearch, type MatchRequest, type PageRequest, type SortRequest } from '../filters/index.js';
import { PEOPLE_FIELDS, NEED_OF, childCount, maritalOf, rowFromJson, type PeopleCtx, type PeopleViewer, type PersonRow } from './fields.js';
import type { Section } from '../person360/rules.js';

export interface PeopleSearch {
  q?: string; archived: boolean; match?: MatchRequest; sort?: SortRequest; page: PageRequest;
}
interface UnitRow { id: string; parentId?: string | null }
interface MembershipRow { personId: string; orgUnitId?: string | null; status?: string; startDate?: Date | string | null; endDate?: Date | string | null }
type Slim = { id: string; fullName: string; memberCode: string | null; status: string; gender: string | null; dateOfBirth: string | null };

/** A unit and everything below it, remembered per unit. */
export function unitTree(units: UnitRow[]): (id: string) => Set<string> {
  const children = new Map<string, string[]>();
  for (const u of units) if (u.parentId) children.set(u.parentId, [...(children.get(u.parentId) ?? []), u.id]);
  const memo = new Map<string, Set<string>>();
  return (id) => {
    const hit = memo.get(id);
    if (hit) return hit;
    const out = new Set<string>([id]);
    const stack = [id];
    while (stack.length) for (const c of children.get(stack.pop()!) ?? []) if (!out.has(c)) { out.add(c); stack.push(c); }
    memo.set(id, out);
    return out;
  };
}

const FILTER_SECTIONS: Section[] = ['EMPLOYMENT', 'EDUCATION', 'FAMILY', 'BAPTISM', 'MARRIAGE', 'CALLING'];
const sectionOf = (need: string | undefined): Section | null => (FILTER_SECTIONS as string[]).includes(need ?? '') ? (need as Section) : null;

export async function searchPeople(i: {
  scope: { ids: Set<string> | null; units: Set<string> | null };
  viewer: PeopleViewer; units: UnitRow[]; memberships: MembershipRow[]; now: Date;
  query: PeopleSearch; viewTier: 'BASIC' | 'DIRECTORY';
}) {
  const { scope, viewer, query } = i;
  const below = unitTree(i.units);
  const known = new Map<string, Slim>();
  const ctx: PeopleCtx = { today: kigaliDay(i.now), below, person: (id) => known.get(id) };

  // Validate before touching the database: a bad or forbidden request costs nothing.
  const plan = planRequest(PEOPLE_FIELDS, viewer, ctx, scope.units, query.match, query.sort);

  const used = [...plan.all, ...plan.groups.flat()].map((p) => p.def.key).concat(plan.sort ? [plan.sort.def.key] : []);
  const sections = [...new Set(used.map((k) => sectionOf(NEED_OF[k])).filter((s): s is Section => s !== null))];

  // Scope first: only the people the viewer may list are ever loaded. Names sort in the database (name, then id).
  const nameDir = query.sort?.field === 'name' ? query.sort.dir : 'asc';
  const slim = (await prisma.person.findMany({
    where: { ...(scope.ids === null ? {} : { id: { in: [...scope.ids] } }), ...(query.archived ? { archivedAt: { not: null } } : { archivedAt: null }) },
    orderBy: [{ fullName: nameDir }, { id: 'asc' }],
    select: { id: true, fullName: true, memberCode: true, status: true, gender: true, dateOfBirth: true },
  })) as unknown as Slim[];
  for (const p of slim) known.set(p.id, p);

  const json = new Map<string, Partial<Record<Section, string[]>>>();
  if (sections.length) {
    const recs = (await prisma.personRecord.findMany({
      where: { status: 'CURRENT', section: { in: sections } },
      select: { personId: true, section: true, dataJson: true },
    })) as unknown as Array<{ personId: string; section: Section; dataJson: string }>;
    for (const r of recs) {
      if (!known.has(r.personId)) continue;
      const mine = json.get(r.personId) ?? {};
      (mine[r.section] ??= []).push(r.dataJson);
      json.set(r.personId, mine);
    }
  }
  const unitsOf = new Map<string, string[]>();
  for (const m of i.memberships) {
    if (!m.orgUnitId || !isLive({ status: m.status ?? 'ACTIVE', startDate: m.startDate, endDate: m.endDate }, i.now)) continue;
    const list = unitsOf.get(m.personId);
    if (list) list.push(m.orgUnitId); else unitsOf.set(m.personId, [m.orgUnitId]);
  }
  // Identity details reach the filters only for a viewer who may read them.
  const rows: PersonRow[] = slim.map((p) => rowFromJson({
    id: p.id, fullName: p.fullName, memberCode: p.memberCode ?? null, status: p.status,
    gender: viewer.identity ? p.gender ?? null : null, dateOfBirth: viewer.identity ? p.dateOfBirth ?? null : null,
    unitIds: unitsOf.get(p.id) ?? [],
  }, json.get(p.id) ?? {}));

  const q = query.q?.toLowerCase();
  const result = runSearch({
    registry: PEOPLE_FIELDS, viewer, ctx, rows, unitScope: scope.units, page: query.page, plan,
    quick: q ? (r) => r.fullName.toLowerCase().includes(q) || (r.memberCode ?? '').toLowerCase().includes(q) : undefined,
  });

  // Only the people on this page are read in full, and only now.
  const ids = result.items.map((r) => r.id);
  const full = ids.length ? ((await prisma.person.findMany({ where: { id: { in: ids } } })) as Array<Record<string, unknown> & { id: string }>) : [];
  const byId = new Map(full.map((p) => [p.id, p]));
  const extra = (['MARRIAGE', 'FAMILY'] as Section[]).filter((s) => viewer.read.includes(s));
  const extraJson = new Map<string, Partial<Record<Section, string[]>>>();
  if (ids.length && extra.length) {
    const recs = (await prisma.personRecord.findMany({
      where: { status: 'CURRENT', section: { in: extra }, personId: { in: ids } },
      select: { personId: true, section: true, dataJson: true },
    })) as unknown as Array<{ personId: string; section: Section; dataJson: string }>;
    for (const r of recs) {
      const mine = extraJson.get(r.personId) ?? {};
      (mine[r.section] ??= []).push(r.dataJson);
      extraJson.set(r.personId, mine);
    }
  }
  const people = result.items.flatMap((r) => {
    const p = byId.get(r.id);
    if (!p) return [];
    const shown = rowFromJson(r, extraJson.get(r.id) ?? {});
    return [{
      ...filterPerson(p, i.viewTier),
      ...(viewer.read.includes('MARRIAGE') ? { marital: maritalOf(shown) } : {}),
      ...(viewer.read.includes('FAMILY') ? { children: childCount(shown, ctx) } : {}),
    }];
  });
  return { total: result.total, page: result.page, people };
}
