/**
 * Music service calendar builder + choir/worship schedule generator.
 */
import type {
  MusicAssignment,
  MusicHorizon,
  MusicServiceKind,
  MusicServiceSlot,
} from './musicSchedule';
import { MUSIC_SERVICE_LABELS } from './musicSchedule';
import type { MusicScheduleUnit } from './musicSchedule';
import { activeMusicUnits, getMusicUnits } from './musicUnits';

export type MusicEngineHistory = {
  /** Ordered oldest→newest Tuesday primary unit ids (recent last). */
  tuesdayHistory: string[];
  fridayHistory: string[];
  /** Last Igaburo primary pairs (most recent last), each length 2 sorted. */
  igaburoPairs: string[][];
  /** Last Igaburo appearances per primary (most recent dates). */
  igaburoByUnit: Record<string, string[]>;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function periodKeysForHorizon(
  startMonthKey: string,
  horizon: MusicHorizon,
): string[] {
  const [ys, ms] = startMonthKey.split('-').map(Number);
  let count = 1;
  if (horizon === 'QUARTER') count = 3;
  else if (horizon === 'HALF') count = 6;
  else if (horizon === 'YEAR') count = 12;
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(ys, ms - 1 + i, 1));
    keys.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`);
  }
  return keys;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function weekdayUtc(year: number, month1: number, day: number): number {
  return new Date(Date.UTC(year, month1 - 1, day)).getUTCDay(); // 0=Sun
}

function isoDate(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

/** Deterministic id for a calendar slot (one per date + kind). */
export function stableServiceId(date: string, kind: MusicServiceKind): string {
  return `msvc-${date}-${kind}`;
}

function nid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build empty service slots for one or more months. */
export function buildMusicCalendar(
  startMonthKey: string,
  horizon: MusicHorizon = 'MONTH',
): MusicServiceSlot[] {
  const services: MusicServiceSlot[] = [];
  for (const periodKey of periodKeysForHorizon(startMonthKey, horizon)) {
    const [y, m] = periodKey.split('-').map(Number);
    const dim = daysInMonth(y, m);
    const sundays: number[] = [];
    const tuesdays: number[] = [];
    const fridays: number[] = [];
    let lastSaturday = 0;
    for (let d = 1; d <= dim; d++) {
      const wd = weekdayUtc(y, m, d);
      if (wd === 0) sundays.push(d);
      if (wd === 2) tuesdays.push(d);
      if (wd === 5) fridays.push(d);
      if (wd === 6) lastSaturday = d;
    }
    for (const d of sundays) {
      const date = isoDate(y, m, d);
      services.push({
        id: nid('msvc'),
        periodKey,
        date,
        kind: 'SS1',
        label: `${MUSIC_SERVICE_LABELS.SS1} · ${date}`,
      });
      services.push({
        id: nid('msvc'),
        periodKey,
        date,
        kind: 'SS2',
        label: `${MUSIC_SERVICE_LABELS.SS2} · ${date}`,
      });
    }
    for (const d of tuesdays) {
      const date = isoDate(y, m, d);
      services.push({
        id: nid('msvc'),
        periodKey,
        date,
        kind: 'TUESDAY',
        label: `${MUSIC_SERVICE_LABELS.TUESDAY} · ${date}`,
      });
    }
    for (const d of fridays) {
      const date = isoDate(y, m, d);
      services.push({
        id: nid('msvc'),
        periodKey,
        date,
        kind: 'FRIDAY',
        label: `${MUSIC_SERVICE_LABELS.FRIDAY} · ${date}`,
      });
    }
    if (lastSaturday > 0) {
      const date = isoDate(y, m, lastSaturday);
      services.push({
        id: nid('msvc'),
        periodKey,
        date,
        kind: 'IGABURO',
        label: `${MUSIC_SERVICE_LABELS.IGABURO} · ${date}`,
      });
    }
  }
  // Stable ids: a calendar slot is identified by what it is, not by when it was
  // generated. Republishing a month, or changing the choir lineup, therefore
  // never re-keys services — Protocol teams stay attached.
  for (const s of services) s.id = stableServiceId(s.date, s.kind);
  return services.sort((a, b) =>
    a.date === b.date
      ? kindOrder(a.kind) - kindOrder(b.kind)
      : a.date.localeCompare(b.date),
  );
}

function kindOrder(k: MusicServiceKind): number {
  const o: Record<MusicServiceKind, number> = {
    SS1: 0,
    SS2: 1,
    TUESDAY: 2,
    FRIDAY: 3,
    IGABURO: 4,
  };
  return o[k];
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function recordPairs(units: string[], pairCounts: Map<string, number>) {
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const k = pairKey(units[i], units[j]);
      pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
    }
  }
}

function assign(
  serviceId: string,
  unitId: string,
  source: 'ENGINE' | 'MANUAL' = 'ENGINE',
): MusicAssignment {
  return { id: nid('masg'), serviceId, unitId, source };
}

export type GenerateMusicScheduleResult = {
  ok: boolean;
  assignments: MusicAssignment[];
  warnings: string[];
  reason?: string;
};

/**
 * Fill calendar with Hope, Worship, secondaries, primaries per locked rules.
 * Retries with different seeds until valid or attempts exhausted.
 */export function generateMusicChoirSchedule(input: {
  services: MusicServiceSlot[];
  history?: MusicEngineHistory;
  attempts?: number;
  seed?: number;
  /** Lineup to schedule. Defaults to the live registry's active units. */
  units?: readonly MusicScheduleUnit[];
}): GenerateMusicScheduleResult {
  const attempts = input.attempts ?? 48;
  const baseSeed = input.seed ?? Date.now();
  const lineup = lineupFrom(input.units ?? getMusicUnits());
  let best: GenerateMusicScheduleResult | null = null;

  for (let i = 0; i < attempts; i++) {
    const rnd = mulberry32((baseSeed + i * 9973) >>> 0);
    const result = tryGenerateOnce(input.services, input.history, rnd, lineup);
    if (result.ok) return result;
    // A lineup that can never work (e.g. one primary choir) fails identically
    // every time — report it instead of burning all attempts.
    if (result.fatal) return result;
    if (!best || result.warnings.length < best.warnings.length) best = result;
  }
  return (
    best ?? {
      ok: false,
      assignments: [],
      warnings: [],
      reason: 'Could not build a valid schedule',
    }
  );
}

/** Max choirs on one main (Sunday) service. */
export const MAX_CHOIRS_PER_MAIN_SERVICE = 3;

/** Active choirs grouped by role — the only thing the rules depend on. */
export type MusicLineup = {
  primaries: string[];
  secondaries: string[];
  children: string[];
  worship: string[];
  /** The catalog this lineup was built from (validation must use the same). */
  units: readonly MusicScheduleUnit[];
};

export function lineupFrom(units: readonly MusicScheduleUnit[]): MusicLineup {
  return {
    primaries: activeMusicUnits('PRIMARY', units).map((u) => u.id),
    secondaries: activeMusicUnits('SECONDARY', units).map((u) => u.id),
    children: activeMusicUnits('CHILDREN', units).map((u) => u.id),
    worship: activeMusicUnits('WORSHIP', units).map((u) => u.id),
    units,
  };
}

type InternalResult = GenerateMusicScheduleResult & { fatal?: boolean };

function tryGenerateOnce(
  services: MusicServiceSlot[],
  history: MusicEngineHistory | undefined,
  rnd: Rng,
  lineup: MusicLineup,
): InternalResult {
  const warnings: string[] = [];
  const assignments: MusicAssignment[] = [];
  const byPeriod = groupBy(services, (s) => s.periodKey);
  const hist: MusicEngineHistory = history
    ? {
        tuesdayHistory: [...history.tuesdayHistory],
        fridayHistory: [...history.fridayHistory],
        igaburoPairs: history.igaburoPairs.map((p) => [...p]),
        igaburoByUnit: Object.fromEntries(
          Object.entries(history.igaburoByUnit).map(([k, v]) => [k, [...v]]),
        ),
      }
    : {
        tuesdayHistory: [],
        fridayHistory: [],
        igaburoPairs: [],
        igaburoByUnit: {},
      };

  if (lineup.primaries.length < 2) {
    return {
      ok: false,
      fatal: true,
      assignments: [],
      warnings,
      reason: 'At least 2 active primary choirs are needed (Igaburo uses 2)',
    };
  }
  if (lineup.children.length > MAX_CHOIRS_PER_MAIN_SERVICE) {
    return {
      ok: false,
      fatal: true,
      assignments: [],
      warnings,
      reason: `Too many children choirs for one SS1 (max ${MAX_CHOIRS_PER_MAIN_SERVICE})`,
    };
  }

  const tueQueue = [...lineup.primaries];
  rotateQueueFromHistory(tueQueue, hist.tuesdayHistory);
  const friQueue = [...lineup.primaries];
  rotateQueueFromHistory(friQueue, hist.fridayHistory);

  for (const periodKey of Object.keys(byPeriod).sort()) {
    const monthServices = byPeriod[periodKey];
    const monthResult = fillOneMonth(
      monthServices,
      assignments,
      warnings,
      rnd,
      tueQueue,
      friQueue,
      hist,
      lineup,
    );
    if (!monthResult.ok) {
      return {
        ok: false,
        fatal: monthResult.fatal,
        assignments: [],
        warnings,
        reason: monthResult.reason,
      };
    }
  }

  const validation = validateSchedule(services, assignments, 'strict', lineup.units);
  if (!validation.ok) {
    return {
      ok: false,
      assignments,
      warnings: [...warnings, ...validation.warnings],
      reason: validation.reason,
    };
  }
  return {
    ok: true,
    assignments,
    warnings: [...warnings, ...validation.warnings],
  };
}

function rotateQueueFromHistory(queue: string[], history: string[]) {
  // Move units that served more recently to the end. History may mention
  // choirs that are no longer in the lineup — they are simply ignored.
  const lastIndex = new Map<string, number>();
  history.forEach((id, i) => lastIndex.set(id, i));
  queue.sort((a, b) => (lastIndex.get(a) ?? -1) - (lastIndex.get(b) ?? -1));
}

type StepResult = { ok: boolean; reason?: string; fatal?: boolean };

function fillOneMonth(
  services: MusicServiceSlot[],
  assignments: MusicAssignment[],
  warnings: string[],
  rnd: Rng,
  tueQueue: string[],
  friQueue: string[],
  hist: MusicEngineHistory,
  lineup: MusicLineup,
): StepResult {
  const sundays = unique(
    services.filter((s) => s.kind === 'SS1').map((s) => s.date),
  ).sort();
  const ss1 = new Map(
    services.filter((s) => s.kind === 'SS1').map((s) => [s.date, s]),
  );
  const ss2 = new Map(
    services.filter((s) => s.kind === 'SS2').map((s) => [s.date, s]),
  );

  // Fixed: every children choir on every SS1
  for (const s of services.filter((x) => x.kind === 'SS1')) {
    for (const c of lineup.children) assignments.push(assign(s.id, c));
  }
  // Fixed: every worship team on every Tuesday
  for (const s of services.filter((x) => x.kind === 'TUESDAY')) {
    for (const w of lineup.worship) assignments.push(assign(s.id, w));
  }

  // Secondary choirs: each appears once this month, each on its own Sunday
  if (sundays.length < lineup.secondaries.length || sundays.length < 1) {
    return {
      ok: false,
      fatal: true,
      reason: `Need at least ${Math.max(1, lineup.secondaries.length)} Sundays for the secondary choirs`,
    };
  }
  const secondarySundays = shuffle(sundays, rnd).slice(
    0,
    lineup.secondaries.length,
  );
  const unusual = new Map<string, { unitId: string; side: 'SS1' | 'SS2' }>();
  lineup.secondaries.forEach((unitId, i) => {
    const side: 'SS1' | 'SS2' = rnd() < 0.5 ? 'SS1' : 'SS2';
    unusual.set(secondarySundays[i], { unitId, side });
  });

  for (const [date, u] of unusual) {
    const svc = u.side === 'SS1' ? ss1.get(date) : ss2.get(date);
    if (!svc) return { ok: false, reason: 'Missing service for secondary' };
    assignments.push(assign(svc.id, u.unitId));
  }

  // Primary Sunday fills
  const sundayFill = fillPrimarySundays(
    sundays,
    ss1,
    ss2,
    unusual,
    assignments,
    rnd,
    lineup,
  );
  if (!sundayFill.ok) return sundayFill;

  // Tuesday / Friday round-robin
  const tuesdays = services
    .filter((s) => s.kind === 'TUESDAY')
    .sort((a, b) => a.date.localeCompare(b.date));
  const fridays = services
    .filter((s) => s.kind === 'FRIDAY')
    .sort((a, b) => a.date.localeCompare(b.date));

  const tueAssigned = new Map<string, string>(); // tuesday date -> primary
  for (const t of tuesdays) {
    const unit = tueQueue.shift()!;
    tueQueue.push(unit);
    assignments.push(assign(t.id, unit));
    tueAssigned.set(t.date, unit);
    hist.tuesdayHistory.push(unit);
  }
  for (const f of fridays) {
    const tueUnit = [...tueAssigned.entries()].find(([td]) =>
      sameIsoWeek(td, f.date),
    )?.[1];
    const unit = friQueue.find((id) => id !== tueUnit) ?? friQueue[0];
    const idx = friQueue.indexOf(unit);
    friQueue.splice(idx, 1);
    friQueue.push(unit);
    if (tueUnit && unit === tueUnit) {
      warnings.push(
        `Could not avoid double midweek for a primary around ${f.date}`,
      );
    }
    assignments.push(assign(f.id, unit));
    hist.fridayHistory.push(unit);
  }

  // Igaburo: exactly 2 primaries
  const igaburo = services.find((s) => s.kind === 'IGABURO');
  if (igaburo) {
    const ig = pickIgaburoPair(rnd, hist, warnings, lineup.primaries);
    if (!ig) return { ok: false, reason: 'Could not pick Igaburo pair' };
    assignments.push(assign(igaburo.id, ig[0]));
    assignments.push(assign(igaburo.id, ig[1]));
    const pair = [...ig].sort();
    hist.igaburoPairs.push(pair);
    for (const u of ig) {
      hist.igaburoByUnit[u] = [...(hist.igaburoByUnit[u] ?? []), igaburo.date];
    }
  }

  return { ok: true };
}

/** Monday (UTC) of the ISO week containing `iso` (YYYY-MM-DD). */
function isoWeekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function sameIsoWeek(a: string, b: string): boolean {
  return isoWeekStart(a) === isoWeekStart(b);
}

/**
 * How many primary choirs go on SS1 / SS2 on one Sunday.
 * Every primary serves each Sunday when capacity allows (the long-standing
 * 4-choir pattern); with a bigger roster the choirs rotate.
 */
export function sundayPrimarySplit(input: {
  primaries: number;
  children: number;
  secondarySide?: 'SS1' | 'SS2';
}): { ss1: number; ss2: number } {
  const cap1 = Math.max(
    0,
    MAX_CHOIRS_PER_MAIN_SERVICE -
      input.children -
      (input.secondarySide === 'SS1' ? 1 : 0),
  );
  const cap2 = Math.max(
    0,
    MAX_CHOIRS_PER_MAIN_SERVICE - (input.secondarySide === 'SS2' ? 1 : 0),
  );
  const total = Math.min(input.primaries, cap1 + cap2);
  let s1 = Math.min(cap1, Math.floor(total / 2));
  let s2 = total - s1;
  if (s2 > cap2) {
    s2 = cap2;
    s1 = total - s2;
  }
  return { ss1: s1, ss2: s2 };
}

function fillPrimarySundays(
  sundays: string[],
  ss1: Map<string, MusicServiceSlot>,
  ss2: Map<string, MusicServiceSlot>,
  unusual: Map<string, { unitId: string; side: 'SS1' | 'SS2' }>,
  assignments: MusicAssignment[],
  rnd: Rng,
  lineup: MusicLineup,
): StepResult {
  const primaries = [...lineup.primaries];
  const n = sundays.length;
  const N = primaries.length;

  const splits = sundays.map((d) =>
    sundayPrimarySplit({
      primaries: N,
      children: lineup.children.length,
      secondarySide: unusual.get(d)?.side,
    }),
  );
  const ss1SlotsPerDay = splits.map((s) => s.ss1);
  const ss2SlotsPerDay = splits.map((s) => s.ss2);
  const T1 = ss1SlotsPerDay.reduce((a, b) => a + b, 0);
  const T2 = ss2SlotsPerDay.reduce((a, b) => a + b, 0);
  const T = T1 + T2;

  // Fair monthly quotas: spread total duties evenly, then split each choir's
  // duties between SS1 and SS2 as evenly as the slot counts allow.
  const needSs1 = new Map<string, number>();
  const needSs2 = new Map<string, number>();
  const quotaFor = (order: string[]): boolean => {
    const base = Math.floor(T / N);
    const rem = T % N;
    const totals = order.map((_, i) => base + (i < rem ? 1 : 0));
    const base1 = Math.floor(T1 / N);
    const extra1 = T1 % N;
    const byTotalDesc = order
      .map((_, i) => i)
      .sort((a, b) => totals[b] - totals[a] || a - b);
    const plusOne = new Set(byTotalDesc.slice(0, extra1));
    for (let i = 0; i < order.length; i++) {
      const n1 = base1 + (plusOne.has(i) ? 1 : 0);
      const n2 = totals[i] - n1;
      if (n2 < 0 || totals[i] > n) return false;
      needSs1.set(order[i], n1);
      needSs2.set(order[i], n2);
    }
    return true;
  };
  if (!quotaFor(shuffle(primaries, rnd))) {
    return { ok: false, reason: 'Could not balance primary choir quotas' };
  }

  // Attempt assignment matrices
  for (let attempt = 0; attempt < 80; attempt++) {
    const ss1Pick: string[][] = sundays.map(() => []);
    const ss2Pick: string[][] = sundays.map(() => []);
    const rem1 = new Map(needSs1);
    const rem2 = new Map(needSs2);
    const pairCounts = new Map<string, number>();
    let failed = false;

    for (let di = 0; di < sundays.length; di++) {
      const need1 = ss1SlotsPerDay[di];
      const need2 = ss2SlotsPerDay[di];
      const pool = shuffle(primaries, rnd);
      const daysLeft = sundays.length - di;
      const remTotal = (p: string) => (rem1.get(p) ?? 0) + (rem2.get(p) ?? 0);

      // Who serves today: choirs that must (their remaining duties fill every
      // remaining Sunday) first, then those with the most duties left.
      const dayTotal = need1 + need2;
      const candidates = pool
        .filter((p) => remTotal(p) > 0)
        .sort((a, b) => {
          const mustA = remTotal(a) >= daysLeft ? 1 : 0;
          const mustB = remTotal(b) >= daysLeft ? 1 : 0;
          if (mustA !== mustB) return mustB - mustA;
          const d = remTotal(b) - remTotal(a);
          return d !== 0 ? d : rnd() - 0.5;
        });
      if (candidates.length < dayTotal) {
        failed = true;
        break;
      }
      const serving = candidates.slice(0, dayTotal);

      // Split today's choirs between SS1 and SS2 within their remaining quotas.
      const chosen1: string[] = serving.filter((p) => (rem2.get(p) ?? 0) === 0);
      const chosen2: string[] = serving.filter((p) => (rem1.get(p) ?? 0) === 0);
      if (chosen1.length > need1 || chosen2.length > need2) {
        failed = true;
        break;
      }
      const flexible = serving
        .filter((p) => !chosen1.includes(p) && !chosen2.includes(p))
        .sort((a, b) => {
          const d = (rem1.get(b) ?? 0) - (rem1.get(a) ?? 0);
          return d !== 0 ? d : rnd() - 0.5;
        });
      for (const p of flexible) {
        if (chosen1.length < need1) chosen1.push(p);
        else chosen2.push(p);
      }
      if (chosen1.length !== need1 || chosen2.length !== need2) {
        failed = true;
        break;
      }

      // Soft pair uniqueness: choirs that already shared a service this month
      // should not share again (relaxed after 60 attempts).
      let pairBad = false;
      for (const group of [chosen1, chosen2]) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            if ((pairCounts.get(pairKey(group[i], group[j])) ?? 0) >= 1) {
              pairBad = true;
            }
          }
        }
      }
      if (pairBad && attempt < 60) {
        failed = true;
        break;
      }

      for (const p of chosen1) rem1.set(p, rem1.get(p)! - 1);
      for (const p of chosen2) rem2.set(p, rem2.get(p)! - 1);
      recordPairs(chosen1, pairCounts);
      recordPairs(chosen2, pairCounts);

      ss1Pick[di] = chosen1;
      ss2Pick[di] = chosen2;
    }

    if (failed) continue;
    if ([...rem1.values()].some((v) => v !== 0)) continue;
    if ([...rem2.values()].some((v) => v !== 0)) continue;

    // Commit
    for (let di = 0; di < sundays.length; di++) {
      const d = sundays[di];
      const s1 = ss1.get(d)!;
      const s2 = ss2.get(d)!;
      for (const p of ss1Pick[di]) assignments.push(assign(s1.id, p));
      for (const p of ss2Pick[di]) assignments.push(assign(s2.id, p));
    }
    return { ok: true };
  }

  return { ok: false, reason: 'Could not place primary choirs on Sundays' };
}

function pickIgaburoPair(
  rnd: Rng,
  hist: MusicEngineHistory,
  warnings: string[],
  primaryIds: string[],
): [string, string] | null {
  const primaries = shuffle([...primaryIds], rnd);
  const recentPairs = hist.igaburoPairs.slice(-2);
  const streakCount = (u: string) => {
    const dates = hist.igaburoByUnit[u] ?? [];
    return dates.length; // simplified; consecutive months handled by preferring low count
  };

  let best: [string, string] | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < primaries.length; i++) {
    for (let j = i + 1; j < primaries.length; j++) {
      const a = primaries[i];
      const b = primaries[j];
      const pair = [a, b].sort();
      let score = streakCount(a) + streakCount(b);
      // Penalize same pair as last two Igaburos
      const sameStreak = recentPairs.filter(
        (p) => p[0] === pair[0] && p[1] === pair[1],
      ).length;
      if (sameStreak >= 2) score += 100;
      else score += sameStreak * 10;
      // Prefer not repeating last pair
      if (
        recentPairs[recentPairs.length - 1] &&
        recentPairs[recentPairs.length - 1][0] === pair[0] &&
        recentPairs[recentPairs.length - 1][1] === pair[1]
      ) {
        score += 5;
      }
      if (score < bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  if (bestScore >= 100) {
    warnings.push('Igaburo pair mixing soft-constraint strained');
  }
  return best;
}

export function validateSchedule(
  services: MusicServiceSlot[],
  assignments: MusicAssignment[],
  mode: 'strict' | 'manual' = 'strict',
  units: readonly MusicScheduleUnit[] = getMusicUnits(),
): { ok: boolean; warnings: string[]; reason?: string } {
  const warnings: string[] = [];
  const byService = groupBy(assignments, (a) => a.serviceId);
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const soft = mode === 'manual';
  const unitById = new Map(units.map((u) => [u.id, u]));
  const nameOf = (id: string) => unitById.get(id)?.name ?? id;
  const isPrimary = (id: string) => unitById.get(id)?.kind === 'PRIMARY';
  const activeWorship = activeMusicUnits('WORSHIP', units);

  // Every assigned choir must exist in the catalog (active or retired).
  for (const a of assignments) {
    if (!unitById.has(a.unitId)) {
      return { ok: false, warnings, reason: `Unknown choir ${a.unitId}` };
    }
  }

  // Max 3 choirs on main
  for (const s of services) {
    const units = byService[s.id] ?? [];
    if (s.kind === 'SS1' || s.kind === 'SS2') {
      if (units.length > MAX_CHOIRS_PER_MAIN_SERVICE) {
        return {
          ok: false,
          warnings,
          reason: `${s.label} has more than ${MAX_CHOIRS_PER_MAIN_SERVICE} choirs`,
        };
      }
    }
    if (s.kind === 'TUESDAY') {
      const choirs = units.filter(
        (u) => unitById.get(u.unitId)?.kind !== 'WORSHIP',
      );
      const worshipOnSvc = new Set(
        units
          .filter((u) => unitById.get(u.unitId)?.kind === 'WORSHIP')
          .map((u) => u.unitId),
      );
      const missingWorship = activeWorship.some((w) => !worshipOnSvc.has(w.id));
      if (
        missingWorship ||
        choirs.length !== 1 ||
        !isPrimary(choirs[0]!.unitId)
      ) {
        const msg =
          activeWorship.length > 0
            ? 'Tuesday should have Worship + exactly 1 primary'
            : 'Tuesday should have exactly 1 primary';
        if (soft) warnings.push(`${s.date}: ${msg}`);
        else
          return {
            ok: false,
            warnings,
            reason: missingWorship && choirs.length === 1 ? 'Tuesday missing Worship team' : msg,
          };
      }
    }
    if (s.kind === 'FRIDAY') {
      if (units.length !== 1 || !isPrimary(units[0]!.unitId)) {
        const msg = 'Friday should have exactly 1 primary';
        if (soft) warnings.push(`${s.date}: ${msg}`);
        else return { ok: false, warnings, reason: msg };
      }
    }
    if (s.kind === 'IGABURO') {
      if (units.length !== 2 || units.some((u) => !isPrimary(u.unitId))) {
        const msg = 'Igaburo should have exactly 2 primaries';
        if (soft) warnings.push(`${s.date}: ${msg}`);
        else return { ok: false, warnings, reason: msg };
      }
    }
  }

  // Children choirs only SS1
  for (const a of assignments.filter(
    (x) => unitById.get(x.unitId)?.kind === 'CHILDREN',
  )) {
    const s = serviceById.get(a.serviceId);
    if (!s || s.kind !== 'SS1') {
      return {
        ok: false,
        warnings,
        reason: `${nameOf(a.unitId)} must only serve SS1`,
      };
    }
  }
  // Worship only Tuesday
  for (const a of assignments.filter(
    (x) => unitById.get(x.unitId)?.kind === 'WORSHIP',
  )) {
    const s = serviceById.get(a.serviceId);
    if (!s || s.kind !== 'TUESDAY') {
      return { ok: false, warnings, reason: 'Worship must only serve Tuesday' };
    }
  }

  // No unit on SS1 and SS2 same date
  const byDateUnit = new Map<string, Set<MusicServiceKind>>();
  for (const a of assignments) {
    const s = serviceById.get(a.serviceId);
    if (!s) continue;
    if (s.kind !== 'SS1' && s.kind !== 'SS2') continue;
    const key = `${s.date}|${a.unitId}`;
    const set = byDateUnit.get(key) ?? new Set();
    set.add(s.kind);
    byDateUnit.set(key, set);
    if (set.has('SS1') && set.has('SS2')) {
      return {
        ok: false,
        warnings,
        reason: `Unit on both SS1 and SS2 on ${s.date}`,
      };
    }
  }

  // Secondary choirs: each active one once per month (soft in manual mode);
  // two secondaries never on the same Sunday (hard).
  const activeSecondaries = activeMusicUnits('SECONDARY', units).map(
    (u) => u.id,
  );
  const periods = unique(services.map((s) => s.periodKey));
  for (const periodKey of periods) {
    const monthServices = new Set(
      services.filter((s) => s.periodKey === periodKey).map((s) => s.id),
    );
    const secondaryDates = new Map<string, string[]>(); // date -> unit ids
    for (const a of assignments) {
      if (unitById.get(a.unitId)?.kind !== 'SECONDARY') continue;
      if (!monthServices.has(a.serviceId)) continue;
      const d = serviceById.get(a.serviceId)?.date;
      if (!d) continue;
      secondaryDates.set(d, [...(secondaryDates.get(d) ?? []), a.unitId]);
    }
    for (const sec of activeSecondaries) {
      const count = [...secondaryDates.values()].filter((ids) =>
        ids.includes(sec),
      ).length;
      if (count !== 1) {
        const msg = `${nameOf(sec)} should appear once in ${periodKey} (got ${count})`;
        if (soft) warnings.push(msg);
        else return { ok: false, warnings, reason: msg };
      }
    }
    for (const ids of secondaryDates.values()) {
      const distinct = unique(ids);
      if (distinct.length > 1) {
        return {
          ok: false,
          warnings,
          reason: `${distinct.map(nameOf).join(' and ')} on the same Sunday in ${periodKey}`,
        };
      }
    }
  }

  return { ok: true, warnings };
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export type PeriodOption = { value: string; label: string };

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Spans a user can pick for a horizon, from the live month onward.
 * Month: any month. Quarter / half year / year follow the calendar
 * (Q1 = Jan–Mar, H2 = Jul–Dec, a year = Jan–Dec). The value is the first
 * month of the span, which is what the calendar builder takes.
 */
export function periodOptionsForHorizon(
  horizon: MusicHorizon,
  liveMonthKey: string,
  monthsAhead = 24,
): PeriodOption[] {
  const [ly, lm] = liveMonthKey.split('-').map(Number);
  const step = horizon === 'MONTH' ? 1 : horizon === 'QUARTER' ? 3 : horizon === 'HALF' ? 6 : 12;
  const out: PeriodOption[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(Date.UTC(ly, lm - 1 + i, 1));
    const y = d.getUTCFullYear();
    const m0 = d.getUTCMonth(); // 0-based
    if (m0 % step !== 0) continue; // only calendar-aligned starts
    const last = m0 + step - 1;
    const value = `${y}-${pad2(m0 + 1)}`;
    const range = `${MONTH_NAMES[m0]}${step > 1 ? `–${MONTH_NAMES[last]}` : ` ${y}`}`;
    let label: string;
    if (horizon === 'MONTH') label = `${MONTH_NAMES[m0]} ${y}`;
    else if (horizon === 'QUARTER') label = `Q${m0 / 3 + 1} ${y} · ${range}`;
    else if (horizon === 'HALF') label = `H${m0 / 6 + 1} ${y} · ${range}`;
    else label = `${y} · ${range}`;
    out.push({ value, label });
  }
  return out;
}
