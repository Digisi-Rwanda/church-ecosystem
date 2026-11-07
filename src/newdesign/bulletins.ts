/**
 * The two printed bulletins the church pins up: the choir schedule (week by week) and the protocol teams
 * (one column per week). This file only arranges data; Bulletins.tsx draws it. Dates are plain YYYY-MM-DD strings.
 */

export type BulletinService = { id: string; date: string; kind: string; names: string[] };
export type ProtocolBulletinMember = { name: string; role: 'MEMBER' | 'TEAM_LEADER' | 'VICE_LEADER' };
export type ProtocolBulletinService = { id: string; date: string; kind: string; team: ProtocolBulletinMember[] };

/** Wording on the English choir sheet. */
export const CHURCH_HEADING = 'ADEPR KACYIRU CHURCH';
/** Wording on the protocol sheet. */
export const PROTOCOL_CHURCH_HEADING = 'ADEPR KACYIRU';
export const PROTOCOL_TEAM_SIZE = 10;
export const PROTOCOL_NB =
  "NB: Abayobozi b'amatsinda (Team Leaders) bagomba gutanga raporo y'ubwitabire nyuma y'iteraniro.";

const WEEK_EN = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'];
const WEEK_RW = ['MBERE', 'KABIRI', 'GATATU', 'KANE', 'GATANU', 'GATANDATU'];
const KIND_ORDER = ['TUESDAY', 'FRIDAY', 'IGABURO', 'SS1', 'SS2'] as const;

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 2026-10-04 -> 04/10/2026 */
export function ddmmyyyy(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** The Monday of the week a date falls in. */
export function mondayOf(d: string): string {
  const dow = new Date(toMs(d)).getUTCDay(); // 0 = Sunday
  return fromMs(toMs(d) - ((dow + 6) % 7) * DAY);
}

export type MusicWeek = {
  number: number; from: string; to: string;
  tuesday: { date: string; names: string[] } | null;
  friday: { date: string; names: string[] } | null;
  sunday: { date: string; first: string[]; second: string[] } | null;
};
export type MusicSpecial = { id: string; date: string; names: string[] };

/** Weeks Monday to Sunday that have at least one service, numbered from the first week shown. */
export function musicWeeks(services: BulletinService[]): { weeks: MusicWeek[]; specials: MusicSpecial[] } {
  const weeks = new Map<string, MusicWeek>();
  const specials: MusicSpecial[] = [];
  const week = (date: string): MusicWeek => {
    const from = mondayOf(date);
    let w = weeks.get(from);
    if (!w) { w = { number: 0, from, to: fromMs(toMs(from) + 6 * DAY), tuesday: null, friday: null, sunday: null }; weeks.set(from, w); }
    return w;
  };
  const join = (a: string[], b: string[]) => [...a, ...b.filter((n) => !a.includes(n))];
  for (const s of [...services].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (s.kind === 'IGABURO') { specials.push({ id: s.id, date: s.date, names: s.names }); continue; }
    const w = week(s.date);
    if (s.kind === 'TUESDAY') w.tuesday = { date: s.date, names: join(w.tuesday?.names ?? [], s.names) };
    else if (s.kind === 'FRIDAY') w.friday = { date: s.date, names: join(w.friday?.names ?? [], s.names) };
    else if (s.kind === 'SS1' || s.kind === 'SS2') {
      w.sunday ??= { date: s.date, first: [], second: [] };
      if (s.kind === 'SS1') w.sunday.first = join(w.sunday.first, s.names); else w.sunday.second = join(w.sunday.second, s.names);
    }
  }
  const list = [...weeks.values()].sort((a, b) => a.from.localeCompare(b.from));
  list.forEach((w, i) => { w.number = i + 1; });
  return { weeks: list, specials };
}

/** "FIRST WEEK: 05/10/2026 - 11/10/2026" */
export function weekTitle(w: MusicWeek): string {
  const ord = WEEK_EN[w.number - 1] ?? String(w.number);
  return `${ord} WEEK: ${ddmmyyyy(w.from)} - ${ddmmyyyy(w.to)}`;
}

/** The choir sheet always shows three name rows, more if a cell is fuller. */
export function weekRows(w: MusicWeek): number {
  return Math.max(3, w.tuesday?.names.length ?? 0, w.friday?.names.length ?? 0, w.sunday?.first.length ?? 0, w.sunday?.second.length ?? 0);
}

export type ProtocolTeamBlock = {
  id: string;
  date: string;
  kind: string;
  heading: string;
  members: Array<{ n: number; name: string; tag?: string }>;
};

export type ProtocolWeek = {
  number: number;
  from: string;
  to: string;
  heading: string;
  services: ProtocolTeamBlock[];
};

const ROLE_ORDER = { TEAM_LEADER: 0, VICE_LEADER: 1, MEMBER: 2 } as const;
const TAG = { TEAM_LEADER: 'Team Lead', VICE_LEADER: 'V/s Team Lead' } as const;

/** Leader first, then the vice leader, then the rest in the order given; numbered 1, 2, 3 ... */
export function numberedTeam(team: ProtocolBulletinMember[]): ProtocolTeamBlock['members'] {
  return team
    .map((m, i) => ({ m, i }))
    .sort((a, b) => ROLE_ORDER[a.m.role] - ROLE_ORDER[b.m.role] || a.i - b.i)
    .map(({ m }, k) => ({ n: k + 1, name: m.name, tag: m.role === 'MEMBER' ? undefined : TAG[m.role] }));
}

/** Empty numbered seats so every team prints as ten lines. */
export function paddedTeam(team: ProtocolBulletinMember[]): ProtocolTeamBlock['members'] {
  const listed = numberedTeam(team);
  const out = listed.slice(0, PROTOCOL_TEAM_SIZE);
  while (out.length < PROTOCOL_TEAM_SIZE) out.push({ n: out.length + 1, name: '' });
  return out;
}

/** Service title as the protocol sheet writes it. */
export function protocolServiceHeading(kind: string, date: string): string {
  const d = ddmmyyyy(date);
  if (kind === 'TUESDAY') return `Iteraniro ryo kuwa kabiri ${d}`;
  if (kind === 'FRIDAY') return `Iteraniro ryo kuwa gatanu ${d}`;
  if (kind === 'IGABURO') return `Iteraniro ryo ku igaburo ryera ${d}`;
  if (kind === 'SS1') return `Iteraniro rya mbere(1) kucyumweru ${d}`;
  if (kind === 'SS2') return `Iteraniro rya kabiri(2) kucyumweru ${d}`;
  return `${kind} ${d}`;
}

export function protocolWeekHeading(number: number): string {
  const ord = WEEK_RW[number - 1];
  return ord ? `ICYUMWERU CYA ${ord} (${number})` : `ICYUMWERU (${number})`;
}

/**
 * The protocol sheet is four (or five) weekly columns. Each week stacks Tuesday, Friday,
 * Holy Communion, then the two Sunday services.
 */
export function protocolWeeks(services: ProtocolBulletinService[]): ProtocolWeek[] {
  const weeks = new Map<string, ProtocolWeek>();
  for (const s of [...services].sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind as typeof KIND_ORDER[number]) - KIND_ORDER.indexOf(b.kind as typeof KIND_ORDER[number]) || a.id.localeCompare(b.id))) {
    const from = mondayOf(s.date);
    let w = weeks.get(from);
    if (!w) {
      w = { number: 0, from, to: fromMs(toMs(from) + 6 * DAY), heading: '', services: [] };
      weeks.set(from, w);
    }
    w.services.push({
      id: s.id,
      date: s.date,
      kind: s.kind,
      heading: protocolServiceHeading(s.kind, s.date),
      members: paddedTeam(s.team),
    });
  }
  const list = [...weeks.values()].sort((a, b) => a.from.localeCompare(b.from));
  list.forEach((w, i) => {
    w.number = i + 1;
    w.heading = protocolWeekHeading(w.number);
  });
  return list;
}

/** "GAHUNDA YA PROTOCOLE Y'UKWEZI KWA 09" */
export const protocolTitle = (month: string): string => `GAHUNDA YA PROTOCOLE Y'UKWEZI KWA ${month.slice(5, 7)}`;
/** "HOW THE CHOIRS WILL SERVE IN THE SERVICES, OCTOBER 2026" */
export const musicTitle = (month: string): string =>
  `HOW THE CHOIRS WILL SERVE IN THE SERVICES, ${monthWord(month)} ${month.slice(0, 4)}`;

const EN_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const EN_MONTHS_TITLE = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The month's name in English, as the choir sheet writes it. */
export function monthWord(month: string): string {
  return EN_MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** Title-case English month, for Protocol_Schedule_September_2026.pdf. */
export function monthNameEn(month: string): string {
  return EN_MONTHS_TITLE[Number(month.slice(5, 7)) - 1] ?? month;
}

export const protocolPdfFilename = (month: string): string =>
  `Protocol_Schedule_${monthNameEn(month)}_${month.slice(0, 4)}.pdf`;

export const musicPdfFilename = (month: string): string =>
  `Choir_Schedule_${monthNameEn(month)}_${month.slice(0, 4)}.pdf`;

