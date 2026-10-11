/**
 * Funds (slice 3). A unit's money is kept in pots, one for each kind of source and code:
 *   CONTRIBUTION  the unit's own contribution types (money the unit raises from its members for its own work)
 *   DONATION      approved donations
 *   OTHER         other income, by code; POOL is the general pool, where unrestricted money such as fundraising profit sits
 * Each pot shows what is secured (received), pledged (only promised), earmarked (set aside for activities) and available
 * (secured minus earmarked). Only secured money can be set aside, and it is the one place the church refuses:
 * recording real spending never is. Collections (tithes, offerings, givings) never feed any pot. Pure.
 */
export const SOURCE_KINDS = ['CONTRIBUTION', 'DONATION', 'OTHER'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const POOL_CODE = 'POOL';
export const INCOME_STATUSES = ['PLEDGED', 'SECURED', 'FULFILLED', 'CANCELLED'] as const;
export type IncomeStatus = (typeof INCOME_STATUSES)[number];
export const CODE_MAX = 40;

export const potId = (kind: string, code: string): string => `${kind}:${code}`;
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** The code a pot of this kind may carry: a donation has none, a contribution or other-income pot has a short code. */
export function codeFor(kind: SourceKind, raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (kind === 'DONATION') return '';
  if (kind === 'OTHER' && !v) return POOL_CODE;
  return CODE_RE.test(v) ? (kind === 'OTHER' ? v.toUpperCase() : v) : null;
}

export interface IncomeLike { kind: string; code: string; amount: number; status: string }
export interface EarmarkLike { kind: string; code: string; amount: number }
export interface OwnType { code: string; name: string; secured: number }

export interface Pot {
  id: string;
  kind: SourceKind;
  code: string;
  name: string;
  secured: number;
  pledged: number;
  earmarked: number;
  available: number;
}

/**
 * Every pot of a unit. The general pool is always there, and so is the donations pot. A contribution pot exists for each
 * of the unit's own types; an OTHER pot exists for each code that has income recorded.
 */
export function computePots(input: { own: OwnType[]; donationsSecured: number; records: IncomeLike[]; earmarks: EarmarkLike[]; names?: Record<string, string> }): Pot[] {
  const pots = new Map<string, Pot>();
  const pot = (kind: SourceKind, code: string, name: string): Pot => {
    const id = potId(kind, code);
    let p = pots.get(id);
    if (!p) {
      p = { id, kind, code, name, secured: 0, pledged: 0, earmarked: 0, available: 0 };
      pots.set(id, p);
    }
    return p;
  };
  pot('OTHER', POOL_CODE, input.names?.[potId('OTHER', POOL_CODE)] ?? 'General pool');
  pot('DONATION', '', input.names?.[potId('DONATION', '')] ?? 'Donations');
  for (const t of input.own) pot('CONTRIBUTION', t.code, t.name).secured += t.secured;
  pot('DONATION', '', 'Donations').secured += input.donationsSecured;
  for (const r of input.records) {
    if (!(SOURCE_KINDS as readonly string[]).includes(r.kind)) continue;
    const kind = r.kind as SourceKind;
    const p = pot(kind, r.code, input.names?.[potId(kind, r.code)] ?? (kind === 'OTHER' ? r.code : r.code));
    if (r.status === 'PLEDGED') p.pledged += r.amount;
    // Contribution and donation money arrives through their own lists and records; only other income is secured here.
    else if (r.status === 'SECURED' && kind === 'OTHER') p.secured += r.amount;
  }
  for (const e of input.earmarks) {
    const kind = e.kind as SourceKind;
    pot(kind, e.code, e.code || e.kind).earmarked += e.amount;
  }
  for (const p of pots.values()) p.available = p.secured - p.earmarked;
  const order = (p: Pot) => (p.id === potId('OTHER', POOL_CODE) ? 0 : p.kind === 'CONTRIBUTION' ? 1 : p.kind === 'DONATION' ? 2 : 3);
  return [...pots.values()].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

export interface Request { kind: string; code: string; amount: number }
export type EarmarkProblem =
  | { code: 'BAD_SOURCE'; kind: string; potCode: string }
  | { code: 'DUPLICATE_SOURCE'; kind: string; potCode: string }
  | { code: 'INSUFFICIENT_FUNDS'; kind: string; potCode: string; available: number; pledged: number; wanted: number };

/**
 * Whether a plan may set aside what it asks for. `pots` must already leave out this plan's own earmark, so that saving the
 * same list again never double counts. The first problem found is returned.
 */
export function earmarkProblem(pots: Pot[], request: Request[]): EarmarkProblem | null {
  const seen = new Set<string>();
  for (const r of request) {
    const id = potId(r.kind, r.code);
    if (!(SOURCE_KINDS as readonly string[]).includes(r.kind) || !Number.isInteger(r.amount) || r.amount <= 0) return { code: 'BAD_SOURCE', kind: r.kind, potCode: r.code };
    if (seen.has(id)) return { code: 'DUPLICATE_SOURCE', kind: r.kind, potCode: r.code };
    seen.add(id);
    const p = pots.find((x) => x.id === id);
    const available = p?.available ?? 0;
    if (!p || r.amount > available) return { code: 'INSUFFICIENT_FUNDS', kind: r.kind, potCode: r.code, available: Math.max(0, available), pledged: p?.pledged ?? 0, wanted: r.amount };
  }
  return null;
}

/** What a plan still needs: spending minus what is set aside. Submit stays off until this is zero. */
export const fundingGap = (planned: number, earmarked: number): number => planned - earmarked;
