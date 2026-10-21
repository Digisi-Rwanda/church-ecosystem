import { describe, expect, it } from 'vitest';
import { ddmmyyyy, mondayOf, monthWord, musicTitle, musicWeeks, numberedTeam, protocolColumns, protocolTitle, weekRows, weekTitle } from './bulletins';

const svc = (id: string, date: string, kind: string, names: string[] = []) => ({ id, date, kind, names });

describe('music bulletin', () => {
  const services = [
    svc('a', '2026-10-06', 'TUESDAY', ['Worship Team', 'El Bethel']), svc('b', '2026-10-09', 'FRIDAY', ["Ijwi ry'Umwami Yesu"]),
    svc('c', '2026-10-11', 'SS1', ['Hope', 'Elimu', 'Integuza']), svc('d', '2026-10-11', 'SS2', ['El Bethel', "Ijwi ry'Umwami Yesu", 'Beulah']),
    svc('e', '2026-10-20', 'TUESDAY', ['Worship Team']), svc('f', '2026-10-24', 'IGABURO', ['El Bethel', "Ijwi ry'Umwami Yesu"]),
  ];
  it('finds Monday and writes dates day/month/year', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); // a Sunday belongs to the week before it
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(ddmmyyyy('2026-10-04')).toBe('04/10/2026');
  });
  it('groups a week Monday to Sunday and keeps Igaburo apart', () => {
    const { weeks, specials } = musicWeeks(services);
    expect(weeks.map((w) => w.from)).toEqual(['2026-10-05', '2026-10-19']);
    expect(weeks[0]!.tuesday?.date).toBe('2026-10-06');
    expect(weeks[0]!.friday?.names).toEqual(["Ijwi ry'Umwami Yesu"]);
    expect(weeks[0]!.sunday).toEqual({ date: '2026-10-11', first: ['Hope', 'Elimu', 'Integuza'], second: ['El Bethel', "Ijwi ry'Umwami Yesu", 'Beulah'] });
    expect(weeks[1]!.sunday).toBeNull();
    expect(specials).toEqual([{ id: 'f', date: '2026-10-24', names: ['El Bethel', "Ijwi ry'Umwami Yesu"] }]);
  });
  it('titles and sizes the weeks like the sheet', () => {
    const { weeks } = musicWeeks(services);
    expect(weekTitle(weeks[0]!)).toBe('ICYUMWERU CYA MBERE CYO KUVA 05/10/2026 - 11/10/2026');
    expect(weekTitle(weeks[1]!)).toBe('ICYUMWERU CYA KABIRI CYO KUVA 19/10/2026 - 25/10/2026');
    expect(weekRows(weeks[0]!)).toBe(3);
    expect(weekRows(weeks[1]!)).toBe(1);
    expect(musicTitle('2026-10')).toBe('UKO AMAKORALI AZITABIRA AMATERANIRO MU UKWAKIRA 2026');
    expect(monthWord('2026-04')).toBe('MATA');
  });
});

describe('protocol bulletin', () => {
  it('puts the leader first, then the vice leader, and numbers everyone', () => {
    const t = numberedTeam([{ name: 'B', role: 'MEMBER' }, { name: 'V', role: 'VICE_LEADER' }, { name: 'C', role: 'MEMBER' }, { name: 'L', role: 'TEAM_LEADER' }]);
    expect(t).toEqual([{ n: 1, name: 'L', tag: 'Team Lead' }, { n: 2, name: 'V', tag: 'V/s Team Lead' }, { n: 3, name: 'B', tag: undefined }, { n: 4, name: 'C', tag: undefined }]);
  });
  it('sorts services into the weekday, first-service and second-service columns', () => {
    const team = [{ name: 'X', role: 'MEMBER' as const }];
    const c = protocolColumns([
      { id: '3', date: '2026-09-13', kind: 'SS1', team }, { id: '1', date: '2026-09-05', kind: 'IGABURO', team }, { id: '2', date: '2026-09-06', kind: 'SS1', team },
      { id: '4', date: '2026-09-06', kind: 'SS2', team }, { id: '5', date: '2026-09-08', kind: 'TUESDAY', team },
    ]);
    expect(c.weekday.map((b) => b.heading)).toEqual(['IGABURO 05/09/2026', 'Iternaniro rya kuwa kabiri 08/09/2026']);
    expect(c.first.map((b) => b.heading)).toEqual(['Iternaniro rya mbere 06/09/2026', 'Iternaniro rya mbere 13/09/2026']);
    expect(c.second.map((b) => b.heading)).toEqual(['Iternaniro rya kabiri 06/09/2026']);
    expect(protocolTitle('2026-09')).toBe("GAHUNDA YA PROTOCOLE Y'UKWEZI KWA 09");
  });
});
