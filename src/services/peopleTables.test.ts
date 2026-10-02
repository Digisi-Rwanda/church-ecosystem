import { describe, expect, it } from 'vitest';
import { peopleService } from './authService';
import { buildPeopleTableRows, educationLabel, NONE } from './peopleTables';

const everyone = peopleService.list();

describe('people tables', () => {
  it('builds a row for every person in all three tables', () => {
    expect(everyone.length).toBeGreaterThan(0);
    for (const p of everyone) {
      const r = buildPeopleTableRows(p, true);
      expect(r.personal.personId).toBe(p.id);
      expect(r.church.fullName).toBe(p.fullName);
      expect(r.other.personId).toBe(p.id);
    }
  });

  it('never leaves a cell empty: missing data reads "None", roles default to Member', () => {
    for (const p of everyone) {
      const { personal, church, other } = buildPeopleTableRows(p, true);
      for (const v of [
        ...Object.values(personal),
        ...Object.values(church),
        ...Object.values(other),
      ]) {
        expect(v === null || String(v).trim().length > 0).toBe(true);
      }
      expect(church.roles.length).toBeGreaterThan(0);
    }
  });

  it('locks national ID, birth date, address, spouse and baptism date without the full record', () => {
    const p = everyone[0];
    const { personal, church } = buildPeopleTableRows(p, false);
    expect(personal.nationalId).toBeNull();
    expect(personal.dateOfBirth).toBeNull();
    expect(personal.address).toBeNull();
    expect(personal.spouse).toBeNull();
    expect(church.baptismDate).toBeNull();
    // contact details stay visible to anyone who can open the directory
    expect(personal.phone).toBe(p.phone ?? NONE);
    expect(personal.email).toBe(p.email ?? NONE);
  });

  it('shows the real values with the full record', () => {
    const p = everyone.find((x) => x.nationalId && x.dateOfBirth) ?? everyone[0];
    const { personal } = buildPeopleTableRows(p, true);
    expect(personal.nationalId).toBe(p.nationalId ?? NONE);
    expect(personal.dateOfBirth).toBe(p.dateOfBirth ?? NONE);
  });

  it('lists a person with no spouse record as None', () => {
    const lonely = everyone.find(
      (p) =>
        !peopleService.marriage(p.id) &&
        !peopleService.familyLinks(p.id).some((l) => l.relation === 'SPOUSE'),
    );
    if (lonely) {
      expect(buildPeopleTableRows(lonely, true).personal.spouse).toBe(NONE);
    }
  });
});

describe('educationLabel', () => {
  it('shows the level together with the institution', () => {
    expect(
      educationLabel({ level: 'Bachelor', institution: 'University of Rwanda' }),
    ).toBe('Bachelor · University of Rwanda');
  });
  it('falls back to whichever part exists, then None', () => {
    expect(educationLabel({ institution: 'University of Rwanda' })).toBe(
      'University of Rwanda',
    );
    expect(educationLabel({ level: 'Bachelor', institution: ' ' })).toBe('Bachelor');
    expect(educationLabel(undefined)).toBe(NONE);
  });
});
