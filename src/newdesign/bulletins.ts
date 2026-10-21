/**
 * The two printed bulletins the church pins up: the choir schedule (week by week) and the protocol teams
 * (columns by service). This file only arranges data; Bulletins.tsx draws it. Dates are plain YYYY-MM-DD strings.
 */

export type BulletinService = { id: string; date: string; kind: string; names: string[] };
export type ProtocolBulletinMember = { name: string; role: 'MEMBER' | 'TEAM_LEADER' | 'VICE_LEADER' };
export type ProtocolBulletinService = { id: string; date: string; kind: string; team: ProtocolBulletinMember[] };

/** The church's own wording on its printed sheets (Kinyarwanda, as the sheets have always been). */
export const CHURCH_HEADING = 'ADEPR ITORERO RYA KACYIRU';
export const PROTOCOL_CHURCH_HEADING = 'ADEPR KACYIRU';

const ORDINALS = ['MBERE', 'KABIRI', 'GATATU', 'KANE', 'GATANU', 'GATANDATU'];

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

/** "ICYUMWERU CYA MBERE": the ordinal of the week, in the church's words. */
export function weekTitle(w: MusicWeek): string {
  const ord = ORDINALS[w.number - 1];
  const cya = ord === 'MBERE' ? 'CYA MBERE' : ord ? `CYA ${ord}` : `CYA ${w.number}`;
  return `ICYUMWERU ${cya} CYO KUVA ${ddmmyyyy(w.from)} - ${ddmmyyyy(w.to)}`;
}

/** How many name rows a week's table needs (at least one). */
export function weekRows(w: MusicWeek): number {
  return Math.max(1, w.tuesday?.names.length ?? 0, w.friday?.names.length ?? 0, w.sunday?.first.length ?? 0, w.sunday?.second.length ?? 0);
}

export type ProtocolTeamBlock = { id: string; date: string; heading: string; members: Array<{ n: number; name: string; tag?: string }> };

const ROLE_ORDER = { TEAM_LEADER: 0, VICE_LEADER: 1, MEMBER: 2 } as const;
const TAG = { TEAM_LEADER: 'Team Lead', VICE_LEADER: 'V/s Team Lead' } as const;

/** Leader first, then the vice leader, then the rest in the order given; numbered 1, 2, 3 ... */
export function numberedTeam(team: ProtocolBulletinMember[]): ProtocolTeamBlock['members'] {
  return team
    .map((m, i) => ({ m, i }))
    .sort((a, b) => ROLE_ORDER[a.m.role] - ROLE_ORDER[b.m.role] || a.i - b.i)
    .map(({ m }, k) => ({ n: k + 1, name: m.name, tag: m.role === 'MEMBER' ? undefined : TAG[m.role] }));
}

/**
 * The protocol sheet has four columns: Igaburo with the weekday teams, the first Sunday service, the second
 * Sunday service, and a column of announcements (which the page supplies).
 */
export function protocolColumns(services: ProtocolBulletinService[]): { weekday: ProtocolTeamBlock[]; first: ProtocolTeamBlock[]; second: ProtocolTeamBlock[] } {
  const sorted = [...services].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const block = (s: ProtocolBulletinService, heading: string): ProtocolTeamBlock => ({ id: s.id, date: s.date, heading: `${heading} ${ddmmyyyy(s.date)}`, members: numberedTeam(s.team) });
  const pick = (kind: string, heading: string) => sorted.filter((s) => s.kind === kind).map((s) => block(s, heading));
  return {
    weekday: [...pick('IGABURO', 'IGABURO'), ...pick('TUESDAY', 'Iternaniro rya kuwa kabiri'), ...pick('FRIDAY', 'Iternaniro rya kuwa gatanu')],
    first: pick('SS1', 'Iternaniro rya mbere'),
    second: pick('SS2', 'Iternaniro rya kabiri'),
  };
}

/** "GAHUNDA YA PROTOCOLE Y'UKWEZI KWA 09" */
export const protocolTitle = (month: string): string => `GAHUNDA YA PROTOCOLE Y'UKWEZI KWA ${month.slice(5, 7)}`;
/** "UKO AMAKORALI AZITABIRA AMATERANIRO MU UKWAKIRA 2026" */
export const musicTitle = (month: string): string => `UKO AMAKORALI AZITABIRA AMATERANIRO MU ${monthWord(month)} ${month.slice(0, 4)}`;

const RW_MONTHS = ['MUTARAMA', 'GASHYANTARE', 'WERURWE', 'MATA', 'GICURASI', 'KAMENA', 'NYAKANGA', 'KANAMA', 'NZERI', 'UKWAKIRA', 'UGUSHYINGO', 'UKUBOZA'];
/** The month's name in Kinyarwanda, as the church writes it. */
export function monthWord(month: string): string {
  return RW_MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}
