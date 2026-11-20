import type { MembershipRecord, OfficeRecord, UnitRecord } from '../api/frontDoorApi';

export type TreeRow = { unit: UnitRecord; depth: number };

const byName = (a: UnitRecord, b: UnitRecord) => a.name.localeCompare(b.name);

/** The organisation as an indented, ordered list: roots first, each followed by its children. */
export function flattenTree(units: UnitRecord[]): TreeRow[] {
  const ids = new Set(units.map((u) => u.id));
  const kids = new Map<string | null, UnitRecord[]>();
  for (const u of units) {
    const key = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    kids.set(key, [...(kids.get(key) ?? []), u]);
  }
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const u of (kids.get(parent) ?? []).slice().sort(byName)) {
      if (seen.has(u.id)) continue; // a loop in the data never hangs the screen
      seen.add(u.id);
      rows.push({ unit: u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Names from the top of the tree down to this unit. */
export function unitPath(units: UnitRecord[], id: string): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const path: string[] = [];
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    path.unshift(cur.name);
  }
  return path;
}

type Dated = { status: string; startDate: string; endDate?: string | null };

/** Active, started, and not yet ended on the given day (YYYY-MM-DD). */
export function isLive(e: Dated, today: string): boolean {
  return e.status === 'ACTIVE' && e.startDate <= today && (!e.endDate || e.endDate >= today);
}

export function membersOf(unitId: string, memberships: MembershipRecord[], today: string): string[] {
  return [...new Set(memberships.filter((m) => m.orgUnitId === unitId && isLive(m, today)).map((m) => m.personId))];
}

export function officeHoldersOf(unitId: string, offices: OfficeRecord[], today: string): OfficeRecord[] {
  return offices.filter((o) => o.orgUnitId === unitId && isLive(o, today));
}

/** Where a person belongs and which offices they hold, by unit name. */
export function belongingOf(
  personId: string,
  structure: { units: UnitRecord[]; memberships: MembershipRecord[]; offices: OfficeRecord[] },
  today: string,
) {
  const unit = (id: string | null) => structure.units.find((u) => u.id === id) ?? null;
  return {
    memberships: structure.memberships
      .filter((m) => m.personId === personId && isLive(m, today))
      .map((m) => ({ id: m.id, label: m.label, unit: unit(m.orgUnitId), systemId: m.systemId, since: m.startDate })),
    offices: structure.offices
      .filter((o) => o.personId === personId && isLive(o, today))
      .map((o) => ({ id: o.id, title: o.title, office: o.office, unit: unit(o.orgUnitId), systemId: o.systemId, since: o.startDate })),
  };
}
