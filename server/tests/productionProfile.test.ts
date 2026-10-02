import { describe, expect, it } from 'vitest';
import { assertProductionProfile, productionProfileProblems } from '../src/lib/productionProfile';

const good = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  SCHEDULE_READ_FILTER: 'on',
  SCHEDULE_GUARD: 'warn',
  BOOTSTRAP_PASTOR_PASSWORD: 'a-long-enough-one',
};

describe('production profile', () => {
  it('accepts the intended live settings', () => {
    expect(productionProfileProblems(good)).toEqual([]);
    expect(() => assertProductionProfile(good)).not.toThrow();
  });

  it('does nothing on staging or locally, where demo settings are wanted', () => {
    const staging = { APP_ENV: 'staging', NODE_ENV: 'production', SEED_DEMO_ACCOUNTS: 'true', SCHEDULE_READ_FILTER: 'off' };
    expect(productionProfileProblems(staging)).toEqual([]);
    expect(productionProfileProblems({ SEED_DEMO_ACCOUNTS: 'true' })).toEqual([]);
  });

  it('refuses demo accounts, demo choirs, a disabled guard and an open read filter on the live service', () => {
    const bad = { ...good, SEED_DEMO_ACCOUNTS: 'true', SEED_DEFAULT_CHOIRS: 'true', SCHEDULE_GUARD: 'off', SCHEDULE_READ_FILTER: 'off' };
    const problems = productionProfileProblems(bad);
    expect(problems).toHaveLength(4);
    expect(() => assertProductionProfile(bad)).toThrow(/not safe for real members/);
  });

  it('refuses a weak bootstrap password and the wrong NODE_ENV', () => {
    expect(productionProfileProblems({ ...good, BOOTSTRAP_PASTOR_PASSWORD: 'short' })[0]).toMatch(/10 characters/);
    expect(productionProfileProblems({ ...good, NODE_ENV: 'development' })[0]).toMatch(/NODE_ENV/);
  });
});
