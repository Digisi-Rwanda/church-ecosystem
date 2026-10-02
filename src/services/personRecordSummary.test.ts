import { describe, expect, it } from 'vitest';
import { allowedProfileSections } from '../domain/access';
import { PEOPLE } from '../data/seed';
import {
  PERSON_RECORD_SECTIONS,
  summarizePersonRecord,
} from './personRecordSummary';

const FULL = {
  seeFullFields: true,
  canViewFullRecord: true,
  allowedSections: allowedProfileSections('FULL'),
};
const MEMBER_VIEW = {
  seeFullFields: false,
  canViewFullRecord: false,
  allowedSections: allowedProfileSections('MEMBER'),
};

const ORDER = [
  'Overview',
  'Personal',
  'Contact',
  'Family',
  'Membership',
  'Baptism',
  'Marriage',
  'Certificates',
  'Documents & Letters',
  'Teams / service',
  'History',
  'Employment info',
  'Education info',
  'Talents and skills',
  'Spiritual gifts',
  'Account',
];

describe('summarizePersonRecord', () => {
  it('lists the 16 sections in the requested order', () => {
    expect(PERSON_RECORD_SECTIONS.map((s) => s.label)).toEqual(ORDER);
    const rows = summarizePersonRecord('p-pastor', FULL);
    expect(rows.map((r) => r.label)).toEqual(ORDER);
  });

  it('a pastoral FULL viewer sees every section unrestricted', () => {
    for (const p of PEOPLE) {
      const rows = summarizePersonRecord(p.id, FULL);
      expect(rows.every((r) => !r.restricted), p.id).toBe(true);
    }
  });

  it('a Member-scope viewer is locked out of the sensitive sections', () => {
    const rows = Object.fromEntries(
      summarizePersonRecord('p-pastor', MEMBER_VIEW).map((r) => [r.key, r]),
    );
    for (const key of [
      'family',
      'baptism',
      'marriage',
      'certificates',
      'documents',
      'history',
      'employment',
      'education',
      'talents',
      'gifts',
      'personal',
    ]) {
      expect(rows[key].restricted, key).toBe(true);
      expect(rows[key].lines, key).toEqual([]);
    }
    expect(rows.contact.restricted).toBe(false);
    expect(rows.overview.restricted).toBe(false);
  });

  it('only a pastoral FULL viewer sees the home address', () => {
    const withAddress = PEOPLE.find((p) => p.address);
    expect(withAddress).toBeTruthy();
    const text = (r: ReturnType<typeof summarizePersonRecord>) =>
      r.find((x) => x.key === 'contact')!.lines.join('\n');
    expect(text(summarizePersonRecord(withAddress!.id, FULL))).toContain(
      withAddress!.address!,
    );
    const limited = {
      ...FULL,
      canViewFullRecord: false,
      seeFullFields: false,
    };
    expect(text(summarizePersonRecord(withAddress!.id, limited))).not.toContain(
      withAddress!.address!,
    );
  });

  it('never prints a national ID number in the table', () => {
    for (const p of PEOPLE.filter((x) => x.nationalId)) {
      const all = summarizePersonRecord(p.id, FULL)
        .flatMap((r) => r.lines)
        .join('\n');
      expect(all, p.id).not.toContain(p.nationalId!);
    }
  });

  it('a plain person without a main-church role shows as Member', () => {
    const rows = summarizePersonRecord('p-member', FULL);
    expect(rows[0].lines.join(' ')).toContain('Role: Member');
  });

  it('returns nothing for an unknown person', () => {
    expect(summarizePersonRecord('p-nobody', FULL)).toEqual([]);
  });
});
