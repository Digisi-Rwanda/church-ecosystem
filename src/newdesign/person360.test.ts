import { describe, expect, it } from 'vitest';
import type { P360Record } from '../api/frontDoorApi';
import { fieldsFor, formData, groupBySection, p360ErrorKey, SECTION_ORDER } from './person360';

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
    expect(keys('EMPLOYMENT', { status: 'EMPLOYED' })).toEqual(['status', 'sector', 'employer', 'role', 'since']);
    expect(formData('EMPLOYMENT', { status: 'UNEMPLOYED', employer: 'MTN', since: '2025-02-01' })).toEqual({ status: 'UNEMPLOYED', since: '2025-02-01' });
  });
  it('a child carries a birth date and gender; other relations do not', () => {
    const keys = (v: Record<string, string>) => fieldsFor('FAMILY', v).map((f) => f.key);
    expect(keys({ relation: 'CHILD' })).toEqual(['relation', 'relatedPersonId', 'name', 'dateOfBirth', 'gender', 'note']);
    expect(keys({ relation: 'SPOUSE' })).toEqual(['relation', 'relatedPersonId', 'name']);
    expect(formData('FAMILY', { relation: 'CHILD', name: 'Eric', dateOfBirth: '2019-05-02', gender: 'MALE', junk: 'x' })).toEqual({ relation: 'CHILD', name: 'Eric', dateOfBirth: '2019-05-02', gender: 'MALE' });
    expect(formData('FAMILY', { relation: 'CHILD' })).toBeNull();
  });
  it('a calling names what the person does and where; gifts and skills are gone', () => {
    expect(fieldsFor('CALLING', {}).map((f) => f.key)).toEqual(['name', 'orgUnitId', 'since', 'note']);
    expect(formData('CALLING', { name: 'Bassist', orgUnitId: 'ou-choir' })).toEqual({ name: 'Bassist', orgUnitId: 'ou-choir' });
    expect(SECTION_ORDER).not.toContain('GIFT');
    expect(SECTION_ORDER).not.toContain('SKILL');
  });
  it('the spouse passing away is recorded on the marriage and needs its date', () => {
    expect(fieldsFor('MARRIAGE', { endedBy: 'DEATH' }).map((f) => f.key)).toContain('endedOn');
    expect(fieldsFor('MARRIAGE', {}).map((f) => f.key)).not.toContain('endedOn');
    expect(formData('MARRIAGE', { date: '2018-08-18', endedBy: 'DEATH' })).toBeNull();
    expect(formData('MARRIAGE', { date: '2018-08-18', endedBy: 'DEATH', endedOn: '2017-01-01' })).toBeNull();
    expect(formData('MARRIAGE', { date: '2018-08-18', endedBy: 'DEATH', endedOn: '2024-03-01' })).toEqual({ date: '2018-08-18', endedBy: 'DEATH', endedOn: '2024-03-01' });
    expect(formData('MARRIAGE', { date: '2018-08-18', endedOn: '2024-03-01' })).toEqual({ date: '2018-08-18' });
  });
});
