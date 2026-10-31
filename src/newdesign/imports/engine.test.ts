import { describe, expect, it } from 'vitest';
import { checkAll, mapHeaders, matchName, parseAmount, parseDate, parseDateTime, resolvePerson, saveAll, toRecords, type FieldDef } from './engine';

const fields: FieldDef[] = [
  { key: 'title', header: 'Title', aliases: ['izina', 'titre'], required: true },
  { key: 'amount', header: 'Amount', aliases: ['amafaranga'] },
];

describe('import engine', () => {
  it('matches columns by title or alias, ignoring case and accents, and reports what is missing or unknown', () => {
    const m = mapHeaders(['TITRE', 'Amount', 'Colour', 'amount'], fields);
    expect(m.columns).toEqual(['title', 'amount', null, null]);
    expect(m.unknown).toEqual(['Colour', 'amount']);
    expect(mapHeaders(['amount'], fields).missing).toEqual(['Title']);
  });

  it('turns a table into records with the file line numbers and drops blank lines', () => {
    const m = mapHeaders(['Title', 'Amount'], fields);
    const r = toRecords([['Title', 'Amount'], ['A', '5'], ['', ''], ['B', '']], m);
    expect(r).toEqual([{ line: 2, values: { title: 'A', amount: '5' } }, { line: 4, values: { title: 'B', amount: '' } }]);
  });

  it('reads dates the way people write them, and refuses impossible ones', () => {
    expect(parseDate('2026-10-04')).toBe('2026-10-04');
    expect(parseDate('4/10/2026')).toBe('2026-10-04');
    expect(parseDate('31-02-2026')).toBeNull();
    expect(parseDate('soon')).toBeNull();
  });

  it('reads a time in Kigali (UTC+2) as an instant', () => {
    expect(parseDateTime('2026-10-04 09:30')).toBe('2026-10-04T07:30:00.000Z');
    expect(parseDateTime('04/10/2026 9h30')).toBe('2026-10-04T07:30:00.000Z');
    expect(parseDateTime('2026-10-04 25:00')).toBeNull();
  });

  it('reads whole francs only', () => {
    expect(parseAmount('12,500')).toBe(12500);
    expect(parseAmount('12 500 RWF')).toBe(12500);
    expect(parseAmount('12.5')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });

  it('finds a person by code, email, phone or name, and says when it is unclear', () => {
    const people = [
      { id: '1', fullName: 'Aline Mukamana', memberCode: 'M-00001', phone: '+250 788 111 222', email: 'a@x.org' },
      { id: '2', fullName: 'Sam Habimana', memberCode: 'M-00002', phone: '0788333444' },
      { id: '3', fullName: 'Sam Habimana', memberCode: 'M-00003' },
    ];
    expect(resolvePerson(people, 'm-00001')).toMatchObject({ kind: 'one' });
    expect(resolvePerson(people, '0788111222')).toMatchObject({ kind: 'one', item: { id: '1' } });
    expect(resolvePerson(people, 'A@X.ORG')).toMatchObject({ kind: 'one', item: { id: '1' } });
    expect(resolvePerson(people, 'Aline  Mukamana')).toMatchObject({ kind: 'one' });
    expect(resolvePerson(people, 'Sam Habimana').kind).toBe('many');
    expect(resolvePerson(people, 'Nobody').kind).toBe('none');
    expect(matchName([{ n: 'Youth Choir' }], (x) => x.n, ' youth  choir ').kind).toBe('one');
  });

  it('checks lines, marks repeats in the file as duplicates, and keeps going after a failed save', async () => {
    const recs = [
      { line: 2, values: { title: 'A' } }, { line: 3, values: { title: 'B' } }, { line: 4, values: { title: 'A' } },
      { line: 5, values: { title: '' } }, { line: 6, values: { title: 'OLD' } },
    ];
    const checked = checkAll(
      recs,
      (v) => (v.title ? { label: v.title, row: { t: v.title }, duplicate: v.title === 'OLD' } : { label: '', issue: { code: 'required', field: 'Title' } }),
      (r) => r.t,
    );
    expect(checked.map((c) => c.state)).toEqual(['OK', 'OK', 'DUPLICATE', 'ERROR', 'DUPLICATE']);
    const progress: number[] = [];
    const saved = await saveAll(checked, async (r) => { if (r.t === 'B') throw new Error('nope'); }, () => 'FAILED', (d) => progress.push(d));
    expect(saved).toEqual([{ line: 2, label: 'A', ok: true }, { line: 3, label: 'B', ok: false, code: 'FAILED' }]);
    expect(progress).toEqual([1, 2]);
  });
});
