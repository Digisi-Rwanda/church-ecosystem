import { describe, expect, it } from 'vitest';
import type { P360Record } from '../api/frontDoorApi';
import { fieldsFor, formData, groupBySection, p360ErrorKey } from './person360';

describe('person 360 helpers', () => {
  it('needs the required fields and drops empty ones', () => {
    expect(formData('BAPTISM', { date: '', place: 'Kacyiru' })).toBeNull();
    expect(formData('BAPTISM', { date: '2026-05-03', place: ' Kacyiru ', baptisedBy: '' })).toEqual({ date: '2026-05-03', place: 'Kacyiru' });
  });
  it('numbers must be whole', () => {
    expect(formData('EDUCATION', { level: 'BACHELOR', endYear: '2015' })).toEqual({ level: 'BACHELOR', endYear: 2015 });
    expect(formData('EDUCATION', { level: 'BACHELOR', endYear: '20.5' })).toBeNull();
    expect(formData('EDUCATION', { level: 'BACHELOR', startYear: '2015', endYear: '2012' })).toBeNull();
  });
  it('family needs a person or a name', () => {
    expect(formData('FAMILY', { relation: 'CHILD' })).toBeNull();
    expect(formData('FAMILY', { relation: 'CHILD', name: 'Eric' })).toEqual({ relation: 'CHILD', name: 'Eric' });
    expect(formData('FAMILY', { relation: 'SPOUSE', relatedPersonId: 'p1' })).toEqual({ relation: 'SPOUSE', relatedPersonId: 'p1' });
  });
  it('groups in the fixed section order and skips empty sections', () => {
    const r = (id: string, section: P360Record['section']) => ({ id, section }) as P360Record;
    expect(groupBySection([r('a', 'MARRIAGE'), r('b', 'CONTACT'), r('c', 'CONTACT')]).map((g) => [g.section, g.items.length])).toEqual([['CONTACT', 2], ['MARRIAGE', 1]]);
  });
  it('errors fall back', () => {
    expect(p360ErrorKey('ALREADY_EXISTS')).toBe('door.p360.err.exists');
    expect(p360ErrorKey(undefined)).toBe('door.people.actionFailed');
  });
  it('education and work ask only what fits the answer given first', () => {
    const keys = (sec: 'EDUCATION' | 'EMPLOYMENT', v: Record<string, string>) => fieldsFor(sec, v).map((f) => f.key);
    expect(keys('EDUCATION', { level: 'NONE' })).toEqual(['level']);
    expect(keys('EDUCATION', { level: 'PRIMARY' })).toEqual(['level', 'school']);
    expect(keys('EDUCATION', { level: 'SECONDARY_O' })).toEqual(['level', 'school']);
    expect(keys('EDUCATION', { level: 'BACHELOR' })).toEqual(['level', 'field', 'school', 'startYear', 'endYear']);
    expect(keys('EMPLOYMENT', { status: 'UNEMPLOYED' })).toEqual(['status', 'since']);
    expect(keys('EMPLOYMENT', { status: 'STUDENT' })).toEqual(['status', 'school', 'field', 'since']);
    expect(keys('EMPLOYMENT', { status: 'EMPLOYED' })).toEqual(['status', 'employer', 'role', 'since']);
    expect(formData('EMPLOYMENT', { status: 'UNEMPLOYED', employer: 'MTN', since: '2025-02-01' })).toEqual({ status: 'UNEMPLOYED', since: '2025-02-01' });
  });
});
