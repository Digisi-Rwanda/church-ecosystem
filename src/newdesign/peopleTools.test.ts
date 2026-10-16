import { describe, expect, it } from 'vitest';
import type { DirectoryPerson } from '../api/frontDoorApi';
import { mapImport, parseCsv, peopleToCsv } from './peopleTools';

describe('CSV reading', () => {
  it('reads quotes, commas inside cells, semicolons and blank lines', () => {
    expect(parseCsv('name,phone\r\n"Mukamana, Aline",0788\r\n\r\nSam,"say ""hi"""\n')).toEqual([['name', 'phone'], ['Mukamana, Aline', '0788'], ['Sam', 'say "hi"']]);
    expect(parseCsv('name;phone\nA;1')).toEqual([['name', 'phone'], ['A', '1']]);
    expect(parseCsv('﻿name\nA')).toEqual([['name'], ['A']]);
  });
});

describe('import mapping', () => {
  it('knows common headings in English, Kinyarwanda and French and reports the rest', () => {
    const m = mapImport(parseCsv('Izina,Tel,Sex,Colour\nAline,0788,F\nSam,,gabo'));
    expect(m.hasName).toBe(true);
    expect(m.unknown).toEqual(['Colour']);
    expect(m.rows).toEqual([{ fullName: 'Aline', phone: '0788', gender: 'FEMALE' }, { fullName: 'Sam', gender: 'MALE' }]);
  });
  it('says when there is no name column', () => {
    expect(mapImport(parseCsv('phone\n1')).hasName).toBe(false);
  });
});

describe('CSV writing', () => {
  it('writes a safe file with quoted cells and no formula tricks', () => {
    const p = { id: 'p1', fullName: '=SUM(A1), x', memberCode: 'M-1', status: 'ACTIVE', phone: '07', email: null } as unknown as DirectoryPerson;
    const csv = peopleToCsv([p], ['code', 'name', 'status', 'phone', 'email']).split('\r\n');
    expect(csv[1]).toBe('M-1,"\'=SUM(A1), x",ACTIVE,07,');
  });
});

describe('person timeline', () => {
  it('puts everything in order, newest first, and skips what has no date', async () => {
    const { timelineOf } = await import('./peopleTools');
    const e = timelineOf({
      joinedChurchOn: '2010-01-05',
      memberships: [{ label: 'Choir member', unit: { name: 'Choir' }, since: '2015-03-01' }, { label: 'x', since: '' }],
      offices: [{ title: 'Treasurer', officeName: 'Treasurer', unit: { name: 'Choir' }, since: '2022-01-01' }],
      records: [{ section: 'BAPTISM', day: '2011-04-10' }, { section: 'CONTACT', day: '2020-01-01' }, { section: 'MARRIAGE', day: null }],
    });
    expect(e.map((x) => [x.kind, x.day])).toEqual([['OFFICE', '2022-01-01'], ['MEMBER', '2015-03-01'], ['BAPTISM', '2011-04-10'], ['JOINED', '2010-01-05']]);
    expect(e[0].name).toBe('Treasurer · Choir');
  });
});
