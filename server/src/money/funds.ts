/**
 * Funds. A unit keeps two pots:
 *   CONTRIBUTION  money its members give through contribution lists
 *   DONATION      money from outside: approved donations, grants, sponsors, other income, fundraising profit
 * Each pot is split by purpose. Money is Unrestricted, restricted to one Activity ("A:<planId>") or restricted to a spending
 * Category ("C:<category>"). A bucket is a pot and a purpose, and shows what is secured (received and approved), awaiting approval,
 * pledged (only promised), earmarked (set aside for activities) and available (secured minus earmarked). Only secured money can be set
 * aside, and a restricted bucket only serves an activity it applies to. Recording real spending is never refused. Collections never feed a pot.
 * Old records kept as kind OTHER (the former general pool) count as Unrestricted money of the Donation pot. Pure.
 */
export const POTS = ['CONTRIBUTION', 'DONATION'] as const;
export type PotKind = (typeof POTS)[number];
export const SOURCE_KINDS = POTS;
export type SourceKind = PotKind;
export const SOURCE_TAGS = ['DONATION', 'CONTRIBUTION', 'GRANT', 'SPONSOR', 'OTHER'] as const;
export type SourceTag = (typeof SOURCE_TAGS)[number];
export const INCOME_STATUSES = ['PLEDGED', 'AWAITING', 'SECURED', 'FULFILLED', 'CANCELLED'] as const;
export type IncomeStatus = (typeof INCOME_STATUSES)[number];
export const UNRESTRICTED = '';
export const potId = (kind: string, code: string): string => `${kind}:${code}`;

const PURPOSE_RE = /^(A|C):.{1,80}$/;
export const actPurpose = (planId: string) => `A:${planId}`;
export const catPurpose = (category: string) => `C:${category}`;
/** Only "", "A:<id>" and "C:<category>" are purposes; anything else is Unrestricted. */
export const cleanPurpose = (v: string | null | undefined): string => (v && PURPOSE_RE.test(v) ? v : UNRESTRICTED);
export function parsePurpose(key: string): { kind: 'UNRESTRICTED' | 'ACTIVITY' | 'CATEGORY'; ref: string } {
  if (key.startsWith('A:')) return { kind: 'ACTIVITY', ref: key.slice(2) };
  if (key.startsWith('C:')) return { kind: 'CATEGORY', ref: key.slice(2) };
  return { kind: 'UNRESTRICTED', ref: '' };
}
/** Whether money with this purpose may be set aside for this activity: unrestricted always, an activity purpose only for that activity, a category purpose only when a cost line is in that category. */
export function purposeApplies(key: string, plan: { id: string; categories: readonly (string | null)[] }): boolean {
  const p = parsePurpose(key);
  if (p.kind === 'UNRESTRICTED') return true;
  if (p.kind === 'ACTIVITY') return p.ref === plan.id;
  return plan.categories.includes(p.ref);
}

/** The pot and purpose a stored record belongs to. Former OTHER records are Unrestricted Donation money. */
export function placeOf(kind: string, code: string | null | undefined): { kind: PotKind; purpose: string } {
  if (kind === 'CONTRIBUTION') return { kind: 'CONTRIBUTION', purpose: cleanPurpose(code) };
  if (kind === 'DONATION') return { kind: 'DONATION', purpose: cleanPurpose(code) };
  return { kind: 'DONATION', purpose: UNRESTRICTED };
}

/** A set-aside source as stored: the pot and the purpose. The former general pool (OTHER) becomes Unrestricted Donation money. Null when it is not a real source. */
export function normSource(kind: string, code: string | null | undefined): { kind: PotKind; code: string } | null {
  if (kind !== 'OTHER' && !(POTS as readonly string[]).includes(kind)) return null;
  if (kind !== 'OTHER' && code && cleanPurpose(code) !== code) return null;
  const place = placeOf(kind, code);
  return { kind: place.kind, code: place.purpose };
}
/** What may be sent as a source's pot: the two pots, and the former OTHER which is still understood. */
export const SOURCE_INPUT_KINDS = ['CONTRIBUTION', 'DONATION', 'OTHER'] as const;

export interface IncomeLike { kind: string; code: string; amount: number; status: string }
export interface EarmarkLike { kind: string; code: string; amount: number }
export interface PurposeAmount { purpose: string; amount: number; status: string }

export interface Pot {
  id: string;
  kind: PotKind;
  /** The purpose key: "", "A:<planId>" or "C:<category>" */
  code: string;
  purposeKind: 'UNRESTRICTED' | 'ACTIVITY' | 'CATEGORY';
  /** Filled in by the route: the activity's title or the category */
  label: string;
  name: string;
  secured: number;
  awaiting: number;
  pledged: number;
  earmarked: number;
  /** Of the earmark, what has already been spent */
  spent: number;
  /** Of the earmark, what is still held for activities */
  reserved: number;
  available: number;
}

/** Every bucket of a unit. Unrestricted buckets of both pots are always there. */
export function computePots(input: {
  contributions?: PurposeAmount[]; donations?: PurposeAmount[]; records?: IncomeLike[]; adjustments?: Array<{ kind: string; code: string; amount: number }>; earmarks?: EarmarkLike[]; spent?: EarmarkLike[];
  labels?: Record<string, string>;
}): Pot[] {
  const pots = new Map<string, Pot>();
  const bucket = (kindIn: string, codeIn: string | null | undefined): Pot => {
    const { kind, purpose } = placeOf(kindIn, codeIn);
    const id = potId(kind, purpose);
    let p = pots.get(id);
    if (!p) {
      const pk = parsePurpose(purpose);
      p = { id, kind, code: purpose, purposeKind: pk.kind, label: input.labels?.[purpose] ?? pk.ref, name: kind, secured: 0, awaiting: 0, pledged: 0, earmarked: 0, spent: 0, reserved: 0, available: 0 };
      pots.set(id, p);
    }
    return p;
  };
  bucket('CONTRIBUTION', UNRESTRICTED);
  bucket('DONATION', UNRESTRICTED);
  for (const l of input.contributions ?? []) {
    const p = bucket('CONTRIBUTION', l.purpose);
    if (l.status === 'APPROVED') p.secured += l.amount;
    else if (l.status === 'SUBMITTED') p.awaiting += l.amount;
  }
  for (const d of input.donations ?? []) {
    const p = bucket('DONATION', d.purpose);
    if (d.status === 'APPROVED') p.secured += d.amount;
    else if (d.status === 'PENDING') p.awaiting += d.amount;
  }
  for (const r of input.records ?? []) {
    const p = bucket(r.kind, r.code);
    if (r.status === 'PLEDGED') p.pledged += r.amount;
    else if (r.status === 'AWAITING') p.awaiting += r.amount;
    else if (r.status === 'SECURED') p.secured += r.amount;
  }
  for (const a of input.adjustments ?? []) bucket(a.kind, a.code).secured += a.amount;
  for (const e of input.earmarks ?? []) bucket(e.kind, e.code).earmarked += e.amount;
  for (const e of input.spent ?? []) bucket(e.kind, e.code).spent += e.amount;
  for (const p of pots.values()) { p.available = p.secured - p.earmarked; p.reserved = Math.max(0, p.earmarked - p.spent); }
  const order = (p: Pot) => (p.kind === 'CONTRIBUTION' ? 0 : 1);
  const rank = (p: Pot) => (p.purposeKind === 'UNRESTRICTED' ? 0 : p.purposeKind === 'ACTIVITY' ? 1 : 2);
  return [...pots.values()].sort((a, b) => order(a) - order(b) || rank(a) - rank(b) || a.label.localeCompare(b.label));
}

export interface Request { kind: string; code: string; amount: number }
export type EarmarkProblem =
  | { code: 'BAD_SOURCE'; kind: string; potCode: string }
  | { code: 'DUPLICATE_SOURCE'; kind: string; potCode: string }
  | { code: 'NOT_FOR_THIS'; kind: string; potCode: string }
  | { code: 'INSUFFICIENT_FUNDS'; kind: string; potCode: string; available: number; pledged: number; wanted: number };

/**
 * Whether a plan may set aside what it asks for. `pots` must already leave out this plan's own earmark, so that saving the
 * same list again never double counts. When `plan` is given, a restricted purpose must apply to it. The first problem found is returned.
 */
export function earmarkProblem(pots: Pot[], request: Request[], plan?: { id: string; categories: readonly (string | null)[] }): EarmarkProblem | null {
  const seen = new Set<string>();
  for (const r of request) {
    const place = placeOf(r.kind, r.code);
    const id = potId(place.kind, place.purpose);
    if (!(POTS as readonly string[]).includes(r.kind) || !Number.isInteger(r.amount) || r.amount <= 0) return { code: 'BAD_SOURCE', kind: r.kind, potCode: r.code };
    if (seen.has(id)) return { code: 'DUPLICATE_SOURCE', kind: r.kind, potCode: r.code };
    seen.add(id);
    if (plan && !purposeApplies(place.purpose, plan)) return { code: 'NOT_FOR_THIS', kind: r.kind, potCode: r.code };
    const p = pots.find((x) => x.id === id);
    const available = p?.available ?? 0;
    if (!p || r.amount > available) return { code: 'INSUFFICIENT_FUNDS', kind: r.kind, potCode: r.code, available: Math.max(0, available), pledged: p?.pledged ?? 0, wanted: r.amount };
  }
  return null;
}

/** What a plan still needs: spending minus what is set aside. Submit stays off until this is zero. */
export const fundingGap = (planned: number, earmarked: number): number => planned - earmarked;

/** Share an amount between items in proportion to what each holds, in whole francs; the remainder goes to the largest. */
export function shareProportional<T extends { amount: number }>(items: T[], amount: number): Array<{ item: T; amount: number }> {
  const all = [...items].filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  const sum = all.reduce((n, i) => n + i.amount, 0);
  if (amount <= 0 || sum <= 0) return [];
  const out = all.map((item) => ({ item, amount: Math.floor((amount * item.amount) / sum) }));
  out[0]!.amount += amount - out.reduce((n, x) => n + x.amount, 0);
  return out.filter((x) => x.amount > 0);
}

/** Share an amount between pots in proportion to what each holds for the plan. */
export function shareByPot(sources: EarmarkLike[], amount: number): Array<{ kind: PotKind; amount: number }> {
  const totals = new Map<PotKind, number>();
  for (const s of sources) { const k = placeOf(s.kind, s.code).kind; totals.set(k, (totals.get(k) ?? 0) + s.amount); }
  return shareProportional([...totals.entries()].map(([kind, amount]) => ({ kind, amount })), amount).map((x) => ({ kind: x.item.kind, amount: x.amount }));
}

/**
 * Cover a shortfall from Unrestricted money that is still available: the pot that overspent first, then the other. No pot goes
 * below zero. What nothing can cover is returned as `uncovered`.
 */
export function coverShortfall(pots: Pot[], need: Array<{ kind: PotKind; amount: number }>): { cover: Array<{ kind: PotKind; amount: number }>; uncovered: number } {
  const room = new Map<PotKind, number>();
  for (const k of POTS) room.set(k, Math.max(0, pots.find((p) => p.kind === k && p.purposeKind === 'UNRESTRICTED')?.available ?? 0));
  const taken = new Map<PotKind, number>();
  let uncovered = 0;
  for (const n of need) {
    let left = n.amount;
    for (const k of [n.kind, ...POTS.filter((x) => x !== n.kind)]) {
      const use = Math.min(left, room.get(k) ?? 0);
      if (use > 0) { room.set(k, (room.get(k) ?? 0) - use); taken.set(k, (taken.get(k) ?? 0) + use); left -= use; }
    }
    uncovered += left;
  }
  return { cover: [...taken.entries()].map(([kind, amount]) => ({ kind, amount })), uncovered };
}
