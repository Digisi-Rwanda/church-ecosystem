import { describe, expect, it } from 'vitest';
import { computeVacancies, findClash, officeFitsUnit } from '../src/lib/appointments';

const choir = { id: 'ou-choir-grace', name: 'Grace Choir', kind: 'TEAM', systemId: 'sys-choir-grace' };
describe('named choir office eligibility', () => {
  it('accepts President, Secretary and Treasurer on existing choir TEAM units', () => {
    for (const office of ['PRESIDENT', 'SECRETARY', 'TREASURER'] as const) expect(officeFitsUnit(office, choir)).toBe(true);
    expect(officeFitsUnit('ADMINISTRATOR', choir)).toBe(false);
  });
  it('keeps Protocol and ordinary teams on their existing office rules', () => {
    for (const systemId of ['sys-protocol', 'sys-youth', null]) {
      const unit = { ...choir, systemId };
      expect(officeFitsUnit('PRESIDENT', unit)).toBe(false);
      expect(officeFitsUnit('TREASURER', unit)).toBe(false);
      expect(officeFitsUnit('COORDINATOR', unit)).toBe(true);
    }
  });
  it('reports the three choir vacancies rather than requiring a Coordinator', () => {
    expect(computeVacancies([choir], [], new Date('2026-11-01T12:00:00Z')).vacancies.map(row => row.office))
      .toEqual(['PRESIDENT', 'SECRETARY', 'TREASURER']);
  });
  it('preserves separation of President and Treasurer in the same choir', () => {
    const position = {id:'president',personId:'person',office:'PRESIDENT' as const,status:'ACTIVE',systemId:choir.systemId,orgUnitId:choir.id,startDate:'2020-01-01'};
    expect(findClash([position], {personId:'person',office:'TREASURER',orgUnitId:choir.id,systemId:choir.systemId},new Date('2026-11-01T12:00:00Z'))?.code).toBe('SEPARATION_OF_DUTIES');
  });
});
