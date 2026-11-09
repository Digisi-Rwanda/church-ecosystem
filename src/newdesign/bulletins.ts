/**
 * The two printed bulletins the church pins up: the choir schedule (week by week) and the protocol teams
 * (one column per service). This file only arranges data; Bulletins.tsx draws it. Dates are plain YYYY-MM-DD strings.
 */

export type BulletinService = { id: string; date: string; kind: string; label: string; names: string[]; editable?: boolean };
export type ProtocolBulletinMember = { name: string; role: 'MEMBER' | 'TEAM_LEADER' | 'VICE_LEADER' };
export type ProtocolBulletinService = { id: string; date: string; kind: string; label: string; choirs: string[]; team: ProtocolBulletinMember[] };

/** Wording on the English choir sheet. */
export const CHURCH_HEADING = 'ADEPR KACYIRU CHURCH';
/** Wording on the protocol sheet. */
export const PROTOCOL_CHURCH_HEADING = 'ADEPR KACYIRU';
export const PROTOCOL_NB =
  "NB: Abayobozi b'amatsinda (Team Leaders) bagomba gutanga raporo y'ubwitabire nyuma y'iteraniro.";

const WEEK_EN = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'];

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
  services: BulletinService[];
};

/** Weeks Monday to Sunday that have at least one service, numbered from the first week shown. */
export function musicWeeks(services: BulletinService[]): { weeks: MusicWeek[]; specials: BulletinService[] } {
  const weeks = new Map<string, MusicWeek>();
  const specials: BulletinService[] = [];
  for (const service of [...services].sort((a, b) => a.date.localeCompare(b.date))) {
    if (service.kind === 'IGABURO') {
      specials.push(service);
      continue;
    }
    const from = mondayOf(service.date);
    let w = weeks.get(from);
    if (!w) {
      w = { number: weeks.size + 1, from, to: fromMs(toMs(from) + 6 * DAY), services: [] };
      weeks.set(from, w);
    }
    w.services.push(service);
  }
  return { weeks: [...weeks.values()], specials };
}

/** "FIRST WEEK: 05/10/2026 - 11/10/2026" */
export function weekTitle(w: MusicWeek): string {
  const ord = WEEK_EN[w.number - 1] ?? String(w.number);
  return `${ord} WEEK: ${ddmmyyyy(w.from)} - ${ddmmyyyy(w.to)}`;
}

/** The choir sheet always shows three name rows, more if a cell is fuller. */
export function weekRows(w: MusicWeek): number {
  return Math.max(3, ...w.services.map((service) => service.names.length));
}

const ROLE_ORDER = { TEAM_LEADER: 0, VICE_LEADER: 1, MEMBER: 2 } as const;
const TAG = { TEAM_LEADER: 'L', VICE_LEADER: 'VL' } as const;

export function numberedTeam(team: ProtocolBulletinMember[]) {
  return [...team]
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .map(({ name, role }, i) => ({ n: i + 1, name, tag: role === 'MEMBER' ? undefined : TAG[role] }));
}

const weekday = (date: string) => (new Date(toMs(date)).getUTCDay() + 6) % 7;

/** Group the selected schedule's occurrences by service code, with Monday first. */
export function protocolColumns(services: ProtocolBulletinService[]) {
  const byService = new Map<string, ProtocolBulletinService[]>();
  for (const service of [...services].sort((a, b) => a.date.localeCompare(b.date))) {
    const code = service.kind.toUpperCase();
    const column = byService.get(code);
    if (column) column.push(service);
    else byService.set(code, [service]);
  }
  return [...byService.entries()].sort(([codeA, a], [codeB, b]) =>
    weekday(a[0]!.date) - weekday(b[0]!.date) || codeA.localeCompare(codeB, 'en', { numeric: true }));
}

export const protocolTitle = (month: string): string =>
  `PROTOCOL DUTIES SCHEDULE ${month.slice(5, 7)}, ${month.slice(0, 4)}`;

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

