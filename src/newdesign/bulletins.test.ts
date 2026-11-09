import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MusicBulletin, ProtocolBulletin } from './Bulletins.tsx';
import {
  ddmmyyyy, mondayOf, monthWord, musicPdfFilename, musicTitle, musicWeeks, numberedTeam, protocolColumns,
  protocolPdfFilename, protocolTitle, type ProtocolBulletinService, weekRows, weekTitle,
} from './bulletins';

const svc = (id: string, date: string, kind: string, names: string[] = [], label = kind) => ({ id, date, kind, label, names });

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
    expect(weeks[0]!.services).toEqual(services.slice(0, 4));
    expect(weeks[1]!.services).toEqual([services[4]]);
    expect(specials).toEqual([services[5]]);
  });
  it('prints each configured service in its own column and drops absent services', () => {
    const sunday = svc('ss1', '2026-11-08', 'SS1', ['Grace Choir'], 'Sunday Service 1');
    const third = svc('ss3', '2026-11-08', 'OTHER', ['Elim'], 'Sunday Service 3');
    const extra = svc('extra', '2026-11-08', 'SS1', [], 'Evening Service');
    const render = (entries: typeof services) => renderToStaticMarkup(createElement(MusicBulletin, { month: '2026-11', services: entries }));
    const html = render([sunday, third, extra]);
    expect(html).toContain('colSpan="3"');
    expect(html).toContain('Sunday Service 3');
    expect(html).toContain('<td>Grace Choir</td><td>Elim</td><td></td>');
    expect(html).toContain('Evening Service');
    expect(html).not.toContain('SECOND SERVICE');
    const afterRemoval = render([sunday, extra]);
    expect(afterRemoval).toContain('colSpan="2"');
    expect(afterRemoval).not.toContain('Sunday Service 3');
  });
  it('titles and sizes the weeks like the sheet', () => {
    const { weeks } = musicWeeks(services);
    expect(weekTitle(weeks[0]!)).toBe('FIRST WEEK: 05/10/2026 - 11/10/2026');
    expect(weekTitle(weeks[1]!)).toBe('SECOND WEEK: 19/10/2026 - 25/10/2026');
    expect(weekRows(weeks[0]!)).toBe(3);
    expect(weekRows(weeks[1]!)).toBe(3);
    expect(musicTitle('2026-10')).toBe('HOW THE CHOIRS WILL SERVE IN THE SERVICES, OCTOBER 2026');
    expect(monthWord('2026-04')).toBe('APRIL');
    expect(musicPdfFilename('2026-10')).toBe('Choir_Schedule_October_2026.pdf');
  });
});

describe('protocol bulletin', () => {
  it('puts the leader first, then the vice leader, and numbers everyone', () => {
    const t = numberedTeam([{ name: 'B', role: 'MEMBER' }, { name: 'V', role: 'VICE_LEADER' }, { name: 'C', role: 'MEMBER' }, { name: 'L', role: 'TEAM_LEADER' }]);
    expect(t).toEqual([{ n: 1, name: 'L', tag: 'L' }, { n: 2, name: 'V', tag: 'VL' }, { n: 3, name: 'B', tag: undefined }, { n: 4, name: 'C', tag: undefined }]);
  });
  it('adds and removes service columns and renders configured names and the full lineup', () => {
    const team = Array.from({ length: 11 }, (_, index) => ({ name: `Member ${index + 1}`, role: 'MEMBER' as const }));
    const tuesday = { id: '1', date: '2026-11-03', kind: 'TUESDAY', label: 'Tuesday Service', team, choirs: [] };
    const third = { id: '2', date: '2026-11-08', kind: 'ss3', label: 'Sunday Service 3', team, choirs: ['Elim'] };
    const nextThird = { ...third, id: '3', date: '2026-11-15', kind: 'SS3' };
    const friday = { ...tuesday, id: '4', date: '2026-11-06', kind: 'FRIDAY', label: 'Friday Service' };
    const services = [nextThird, friday, tuesday, third];
    expect(protocolColumns(services).map(([code, occurrences]) => [code, occurrences.map((service) => service.id)])).toEqual([
      ['TUESDAY', ['1']], ['FRIDAY', ['4']], ['SS3', ['2', '3']],
    ]);
    const render = (entries: ProtocolBulletinService[]) =>
      renderToStaticMarkup(createElement(ProtocolBulletin, { month: '2026-11', services: entries }));
    const html = render(services);
    expect(html).toContain('Sunday Service 3 (08/11/2026)');
    expect(html).toContain('Sunday Service 3 (15/11/2026)');
    expect(html).toContain('Friday Service');
    expect(html).toContain('Member 11');
    expect(html).toContain('Choir:</strong> Elim');
    const updated = services.filter((service) => service !== friday);
    expect(protocolColumns(updated).map(([code]) => code)).toEqual(['TUESDAY', 'SS3']);
    expect(render(updated)).not.toContain('Friday Service');
    expect(protocolTitle('2026-11')).toBe('PROTOCOL DUTIES SCHEDULE 11, 2026');
    expect(protocolPdfFilename('2026-11')).toBe('Protocol_Schedule_November_2026.pdf');
  });
});
