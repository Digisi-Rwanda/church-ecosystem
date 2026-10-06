/**
 * Member codes, unit codes and the checks around identity (slice 1.2a).
 *
 * - A member code (M-00123) is issued once from a counter that only goes up, so a code is
 *   never handed out twice, even after a person is archived or removed.
 * - A unit code (KAC-MUS-IJWI) is set once and never changes when the unit moves.
 * - A national ID is compared without spaces, dots or dashes, so "1 1990 8 0012345 1 23"
 *   and "1199080012345123" are the same person.
 */
import { formatMemberCode, UNIT_CODE_PATTERN } from '../shared/vocabulary.js';

/** The part of Prisma these helpers need (a transaction client fits too). */
export interface CodeDb {
  // Arguments are typed loosely on purpose so the real PrismaClient (generic, strict) fits.
  counter: { upsert(args: any): Promise<{ value: number }> };
  person: { findMany(args?: any): Promise<any[]>; update(args: any): Promise<unknown> };
  orgUnit: { findMany(args?: any): Promise<any[]>; update(args: any): Promise<unknown> };
}

export const MEMBER_COUNTER = 'member';

/** Issue the next member code. Atomic: two people created at once never share a number. */
export async function nextMemberCode(db: Pick<CodeDb, 'counter'>): Promise<string> {
  const row = await db.counter.upsert({
    where: { key: MEMBER_COUNTER },
    update: { value: { increment: 1 } },
    create: { key: MEMBER_COUNTER, value: 1 },
  });
  return formatMemberCode(row.value);
}

/** Digits and letters only, upper-case. Empty input gives ''. */
export function normaliseNationalId(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** Another person who already has this national ID, or null. Blank IDs never collide. */
export async function personWithNationalId(
  db: Pick<CodeDb, 'person'>,
  raw: string | null | undefined,
  exceptPersonId?: string,
): Promise<{ id: string } | null> {
  const wanted = normaliseNationalId(raw);
  if (!wanted) return null;
  const rows = await db.person.findMany({ where: { nationalId: { not: null } } });
  const hit = rows.find((p) => p.id !== exceptPersonId && normaliseNationalId(p.nationalId) === wanted);
  return hit ? { id: hit.id as string } : null;
}

export function isValidUnitCode(code: string): boolean {
  return UNIT_CODE_PATTERN.test(code);
}

/** Letters of a name that make a short, readable segment: "Ijwi ry'Ihumure" → "IJWIRYI". */
function segment(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const joined = words.length > 1 ? words.join('') : (words[0] ?? '');
  return (joined.length >= 2 ? joined : `${joined}XX`).slice(0, 8);
}

/** Suggest a unit code from its name and its parent's code. Adds a number until it is free. */
export function suggestUnitCode(name: string, parentCode: string | null | undefined, taken: Set<string>): string {
  // Codes hold at most four parts, so a very deep unit shares its great-grandparent's prefix.
  const prefix = parentCode ? parentCode.split('-').slice(0, 3).join('-') : '';
  const seg = segment(name);
  const make = (n: number) => {
    const part = n === 1 ? seg : `${seg.slice(0, 6)}${n}`;
    return prefix ? `${prefix}-${part}` : part.slice(0, n === 1 ? 5 : 3) + (n === 1 ? '' : String(n));
  };
  for (let n = 1; n <= 99; n++) {
    const candidate = make(n);
    if (!taken.has(candidate) && isValidUnitCode(candidate)) return candidate;
  }
  throw new Error(`Cannot find a free unit code for "${name}"`);
}

/**
 * Give a code to everybody and every unit that has none yet. Safe to run on every start:
 * it touches only records without a code, oldest first, and never changes an existing code.
 */
export async function backfillCodes(db: CodeDb): Promise<{ people: number; units: number }> {
  const people = (await db.person.findMany({ where: { memberCode: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })) as Array<{ id: string }>;
  for (const p of people) await db.person.update({ where: { id: p.id }, data: { memberCode: await nextMemberCode(db) } });

  const units = await db.orgUnit.findMany({ orderBy: { id: 'asc' } });
  const taken = new Set<string>(units.map((u) => u.code).filter(Boolean) as string[]);
  const byId = new Map(units.map((u) => [u.id as string, u]));
  let done = 0;
  // Parents first, so a child's code can start with its parent's.
  const pending = units.filter((u) => !u.code);
  const depth = (u: Record<string, any>): number => (u.parentId && byId.get(u.parentId) ? 1 + depth(byId.get(u.parentId)!) : 0);
  pending.sort((a, b) => depth(a) - depth(b) || String(a.id).localeCompare(String(b.id)));
  const CHURCH_CODE = 'KAC';
  for (const u of pending) {
    const parent = u.parentId ? byId.get(u.parentId) : undefined;
    const code =
      !u.parentId && u.id === 'ou-church' && !taken.has(CHURCH_CODE)
        ? CHURCH_CODE
        : suggestUnitCode(u.name as string, parent ? (parent.code as string | null) : CHURCH_CODE, taken);
    taken.add(code);
    u.code = code;
    await db.orgUnit.update({ where: { id: u.id as string }, data: { code } });
    done++;
  }
  return { people: people.length, units: done };
}
