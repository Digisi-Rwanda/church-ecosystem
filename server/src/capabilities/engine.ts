/**
 * The letters engine (slice 1.3): who holds which letter in which module of which system.
 *
 * Pure: it takes records and a clock and returns an answer, so every rule is testable
 * without a database. The rules, in plain words:
 *  - an office carries letters only while it is live: started, not ended, inside its term;
 *  - a church-wide office reaches every system; a unit office reaches its own system;
 *  - a delegation lends some of the delegator's letters for a short time, and stops the
 *    moment the delegator's own office stops;
 *  - a plain member of a system can only read the basics there;
 *  - W, V, A, S, P and C each include R; nobody approves their own entry.
 */
import {
  MEMBER_LETTERS,
  MODULE_KEYS,
  OFFICE_LETTERS,
  OFFICE_SCOPE,
  mergeLetters,
  type ModuleLetters,
} from '../shared/accessMatrix.js';
import type { AccessLetter, ModuleKey, OfficeCode } from '../shared/vocabulary.js';
import { officeOf } from '../lib/offices.js';

export interface PositionRec {
  id: string;
  personId: string;
  systemId?: string | null;
  orgUnitId?: string | null;
  office?: string | null;
  systemRole?: string | null;
  ministryOffice?: string | null;
  choirOffice?: string | null;
  worshipOffice?: string | null;
  protocolOffice?: string | null;
  deaconOffice?: string | null;
  systemAdmin?: boolean | null;
  title?: string;
  status: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface MembershipRec {
  personId: string;
  systemId?: string | null;
  status: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface DelegationRec {
  id: string;
  positionId: string;
  fromPersonId: string;
  toPersonId: string;
  lettersJson: string;
  status: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface AccessData {
  positions: PositionRec[];
  memberships: MembershipRec[];
  delegations: DelegationRec[];
  /** Unit id to the system that owns it, for positions held on a unit alone. */
  unitSystem?: Record<string, string | null | undefined>;
}

export interface Holding {
  positionId: string;
  office: OfficeCode;
  systemId: string | null;
  orgUnitId: string | null;
  scope: 'CHURCH' | 'UNIT';
  via: 'OFFICE' | 'DELEGATION';
  delegationId?: string;
  fromPersonId?: string;
  /** What this holding lends, by module. */
  letters: ModuleLetters;
}

export interface LetterSource {
  letter: AccessLetter;
  from: string;
  via: 'OFFICE' | 'DELEGATION' | 'MEMBER';
  /** The office the letter comes from (absent for plain membership), so screens can name it in any language. */
  office?: OfficeCode;
  positionId?: string;
  delegationId?: string;
}

const t = (v: string | Date | null | undefined): number | null => {
  if (!v) return null;
  const n = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(n) ? null : n;
};

/** Live means started, not ended and inside its term. An end date is the last day, inclusive. */
export function isLive(
  r: { status: string; startDate?: string | Date | null; endDate?: string | Date | null },
  now: Date,
): boolean {
  if (r.status !== 'ACTIVE') return false;
  const s = t(r.startDate);
  if (s !== null && s > now.getTime()) return false;
  const e = t(r.endDate);
  if (e === null) return true;
  // A bare date means the end of that day; a full timestamp means that moment.
  const asDate = typeof r.endDate === 'string' && r.endDate.length <= 10;
  return (asDate ? e + 24 * 3600 * 1000 : e) >= now.getTime();
}

function parseLetters(json: string): ModuleLetters {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, AccessLetter[]> = {};
    for (const k of MODULE_KEYS) {
      const v = raw[k];
      if (Array.isArray(v)) out[k] = v.filter((x): x is AccessLetter => typeof x === 'string') as AccessLetter[];
    }
    return out;
  } catch {
    return {};
  }
}

const positionSystem = (p: PositionRec, data: AccessData): string | null =>
  p.systemId ?? (p.orgUnitId ? (data.unitSystem?.[p.orgUnitId] ?? null) : null);

/** Everything this person holds right now, from their own offices and from delegations. */
export function liveHoldings(personId: string, data: AccessData, now = new Date()): Holding[] {
  const out: Holding[] = [];
  const liveById = new Map<string, PositionRec>();
  for (const p of data.positions) if (isLive(p, now)) liveById.set(p.id, p);

  for (const p of liveById.values()) {
    if (p.personId !== personId) continue;
    const office = officeOf(p);
    if (!office) continue;
    out.push({
      positionId: p.id,
      office,
      systemId: positionSystem(p, data),
      orgUnitId: p.orgUnitId ?? null,
      scope: OFFICE_SCOPE[office],
      via: 'OFFICE',
      letters: OFFICE_LETTERS[office],
    });
  }

  for (const d of data.delegations) {
    if (d.toPersonId !== personId || !isLive(d, now)) continue;
    // A delegation lives only while the delegator still holds the office it was lent from.
    const src = liveById.get(d.positionId);
    if (!src || src.personId !== d.fromPersonId) continue;
    const office = officeOf(src);
    if (!office) continue;
    const lent = parseLetters(d.lettersJson);
    const allowed = OFFICE_LETTERS[office];
    const letters: Record<string, AccessLetter[]> = {};
    for (const k of MODULE_KEYS) {
      const have = allowed[k] ?? [];
      const keep = (lent[k] ?? []).filter((l) => have.includes(l));
      if (keep.length) letters[k] = keep;
    }
    out.push({
      positionId: src.id,
      office,
      systemId: positionSystem(src, data),
      orgUnitId: src.orgUnitId ?? null,
      scope: OFFICE_SCOPE[office],
      via: 'DELEGATION',
      delegationId: d.id,
      fromPersonId: d.fromPersonId,
      letters,
    });
  }
  return out;
}

/** The Central system, where church-wide offices work. */
export const CENTRAL = 'sys-main';

/** Only the Church Leader reaches into every system; every other office stays inside its own walls. */
export const reachesEverySystem = (h: Pick<Holding, 'office' | 'scope'>): boolean => h.scope === 'CHURCH' && h.office === 'CHURCH_LEADER';

const covers = (h: Holding, systemId: string): boolean =>
  reachesEverySystem(h) || h.systemId === systemId || (h.scope === 'CHURCH' && systemId === CENTRAL);

/**
 * The systems a person may see anything of: Central, the systems they belong to, and the systems
 * where they hold an office. `null` means all of them, which only the Church Leader reaches.
 */
export function reachableSystems(personId: string, data: AccessData, now = new Date()): Set<string> | null {
  const holdings = liveHoldings(personId, data, now);
  if (holdings.some(reachesEverySystem)) return null;
  const out = new Set<string>([CENTRAL]);
  for (const h of holdings) if (h.systemId) out.add(h.systemId);
  for (const m of data.memberships) if (m.personId === personId && m.systemId && isLive(m, now)) out.add(m.systemId);
  return out;
}

export function isMemberOf(personId: string, systemId: string, data: AccessData, now = new Date()): boolean {
  return data.memberships.some(
    (m) => m.personId === personId && m.systemId === systemId && isLive(m, now),
  );
}

/** The letters a person holds in each module of one system. */
export function lettersInSystem(
  personId: string,
  systemId: string,
  data: AccessData,
  now = new Date(),
  holdings: Holding[] = liveHoldings(personId, data, now),
): Record<ModuleKey, AccessLetter[]> {
  const member = isMemberOf(personId, systemId, data, now) ? MEMBER_LETTERS : {};
  const result = {} as Record<ModuleKey, AccessLetter[]>;
  for (const k of MODULE_KEYS) {
    result[k] = mergeLetters(
      member[k],
      ...holdings.filter((h) => covers(h, systemId)).map((h) => h.letters[k]),
    );
  }
  return result;
}

/** The same answer with the reason behind every letter, for the access explainer. */
export function explainSystem(
  personId: string,
  systemId: string,
  data: AccessData,
  titleOf: (office: OfficeCode) => string,
  now = new Date(),
): Record<ModuleKey, LetterSource[]> {
  const holdings = liveHoldings(personId, data, now).filter((h) => covers(h, systemId));
  const member = isMemberOf(personId, systemId, data, now);
  const out = {} as Record<ModuleKey, LetterSource[]>;
  for (const k of MODULE_KEYS) {
    const seen = new Map<string, LetterSource>();
    const add = (letters: readonly AccessLetter[] | undefined, src: Omit<LetterSource, 'letter'>) => {
      for (const l of letters && letters.length ? [...letters, 'R' as const] : []) {
        const key = `${l}|${src.via}|${src.positionId ?? ''}|${src.delegationId ?? ''}`;
        if (!seen.has(key)) seen.set(key, { letter: l, ...src });
      }
    };
    if (member) add(MEMBER_LETTERS[k], { from: 'Member of this system', via: 'MEMBER' });
    for (const h of holdings) {
      add(h.letters[k], {
        from: h.via === 'DELEGATION' ? `${titleOf(h.office)} (delegated)` : titleOf(h.office),
        via: h.via,
        office: h.office,
        positionId: h.positionId,
        delegationId: h.delegationId,
      });
    }
    out[k] = [...seen.values()];
  }
  return out;
}

export interface Decision {
  allowed: boolean;
  reason: string;
}

/**
 * May this person use `letter` in `module` of `systemId`?
 * `ownerPersonId` is whose entry or request it is: nobody approves their own.
 */
export function decide(
  personId: string,
  systemId: string,
  module: ModuleKey,
  letter: AccessLetter,
  data: AccessData,
  opts: { now?: Date; ownerPersonId?: string } = {},
): Decision {
  const now = opts.now ?? new Date();
  const held = lettersInSystem(personId, systemId, data, now)[module];
  if (!held.includes(letter)) return { allowed: false, reason: `No ${letter} letter in ${module}` };
  if (letter === 'A' && opts.ownerPersonId && opts.ownerPersonId === personId) {
    return { allowed: false, reason: 'Nobody approves their own request' };
  }
  return { allowed: true, reason: 'Allowed' };
}
