import { describe, expect, it } from 'vitest';
import type { AppointmentRow, UnitRecord, Vacancy } from '../api/frontDoorApi';
import { accessErrorKey, groupByUnit, lettersText, officesFor, sortVacancies } from './access';

const row = (id: string, office: AppointmentRow['office'], unit: string): AppointmentRow => ({
  id, personId: id, personName: id, memberCode: null, office, title: '', orgUnitId: unit, unitName: unit,
  unitCode: null, systemId: null, startDate: null, endDate: null, status: 'ACTIVE', live: true, endsSoon: false,
});

describe('officesFor', () => {
  it('lets the Church Leader fill unit offices but not their own seat', () => {
    expect(officesFor('MINISTRY', 'sys-choir', true, false)).toEqual(['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'COORDINATOR']);
    expect(officesFor('CENTRAL', 'sys-main', true, false)).toEqual(['CATECHIST', 'CHURCH_SECRETARY']);
  });
  it('lets an Administrator fill only the Church Leader seat', () => {
    expect(officesFor('CENTRAL', 'sys-main', false, true)).toEqual(['CHURCH_LEADER']);
    expect(officesFor('MINISTRY', 'sys-choir', false, true)).toEqual([]);
  });
  it('offers Administrator only in Media, and only to the Church Leader', () => {
    expect(officesFor('MINISTRY', 'sys-media', true, false)).toContain('ADMINISTRATOR');
    expect(officesFor('MINISTRY', 'sys-choir', true, false)).not.toContain('ADMINISTRATOR');
    expect(officesFor('MINISTRY', 'sys-media', false, false)).toEqual([]);
  });
});

describe('accessErrorKey', () => {
  it('names a message for every refusal the server gives, and falls back for anything else', () => {
    expect(accessErrorKey('OFFICE_TAKEN')).toBe('door.access.err.officeTaken');
    expect(accessErrorKey('NEEDS_TWO_ADMINISTRATORS')).toBe('door.access.err.twoAdmins');
    expect(accessErrorKey('SOMETHING_NEW')).toBe('door.people.actionFailed');
    expect(accessErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});

describe('groupByUnit', () => {
  it('groups by unit in tree order and puts the President before the Treasurer', () => {
    const units = [{ id: 'b' }, { id: 'a' }] as UnitRecord[];
    const g = groupByUnit([row('1', 'TREASURER', 'a'), row('2', 'PRESIDENT', 'a'), row('3', 'PRESIDENT', 'b')], units);
    expect(g.map((x) => x.key)).toEqual(['b', 'a']);
    expect(g[1].rows.map((r) => r.office)).toEqual(['PRESIDENT', 'TREASURER']);
  });
});

describe('small helpers', () => {
  it('writes letters as one short string', () => {
    expect(lettersText(['R', 'W'])).toBe('R W');
    expect(lettersText([])).toBe('—');
  });
  it('lists empty seats before terms that end soon', () => {
    const v = [
      { unitName: 'B', reason: 'ENDS_SOON' },
      { unitName: 'C', reason: 'EMPTY' },
      { unitName: 'A', reason: 'EMPTY' },
    ] as Vacancy[];
    expect(sortVacancies(v).map((x) => x.unitName)).toEqual(['A', 'C', 'B']);
  });
});
