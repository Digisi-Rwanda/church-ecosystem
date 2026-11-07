import { describe, expect, it } from 'vitest';
import { pageNameFor } from './warm';

describe('which page an address opens', () => {
  it('knows the portal and each block of a system', () => {
    expect(pageNameFor('/portal')).toBe('PortalPage');
    expect(pageNameFor('/s/sys-youth')).toBe('SystemBlockPage');
    expect(pageNameFor('/s/sys-youth/people')).toBe('PeopleDirectoryPage');
    expect(pageNameFor('/s/sys-youth/money/')).toBe('MoneyPage');
    expect(pageNameFor('/s/sys-music/monthplan?month=2026-11')).toBe('MonthPlanPage');
    expect(pageNameFor('/s/sys-youth/programs')).toBe('PlansPage');
  });
  it('leaves anything else alone', () => {
    expect(pageNameFor('/signin')).toBeNull();
    expect(pageNameFor('/s/sys-youth/unknown-block')).toBeNull();
    expect(pageNameFor('/systems/choir')).toBeNull();
  });
});
