import { describe, expect, it } from 'vitest';
import { OFFICES_BY_KIND, OFFICE_LETTERS, OFFICE_SCOPE, SOLE_OFFICES, withRead } from '../src/shared/accessMatrix.js';
import { officeOf, legacyColumnsFor } from '../src/lib/offices.js';

describe('Pastor and Church Treasurer', () => {
  it('keep pastoral and money rights apart', () => {
    expect(OFFICE_LETTERS.PASTOR.PERSON_360).toContain('W');
    expect(OFFICE_LETTERS.PASTOR.MONEY).toBeUndefined();
    expect(OFFICE_LETTERS.CHURCH_TREASURER.MONEY).toContain('W');
    expect(OFFICE_LETTERS.CHURCH_TREASURER.PERSON_360).toBeUndefined();
  });
  it('leave the Church Leader with both', () => {
    expect(OFFICE_LETTERS.CHURCH_LEADER.PERSON_360).toContain('W');
    expect(OFFICE_LETTERS.CHURCH_LEADER.MONEY).toContain('A');
  });
  it('are church-wide sole offices held in Central Administration', () => {
    for (const o of ['PASTOR', 'CHURCH_TREASURER'] as const) {
      expect(OFFICE_SCOPE[o]).toBe('CHURCH');
      expect(SOLE_OFFICES).toContain(o);
      expect(OFFICES_BY_KIND.CENTRAL).toContain(o);
    }
  });
  it('read the new office code and leave the old columns alone', () => {
    expect(officeOf({ office: 'PASTOR' })).toBe('PASTOR');
    expect(officeOf({ systemRole: 'PASTOR' })).toBe('CHURCH_LEADER');
    expect(legacyColumnsFor('CHURCH_TREASURER')).toEqual({});
    expect(withRead(OFFICE_LETTERS.CHURCH_TREASURER.MONEY ?? [])).toContain('R');
  });
});
