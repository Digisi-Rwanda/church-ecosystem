import { describe, expect, it } from 'vitest';
import { prodEnvProblems } from '../../scripts/prodEnvGuard';

describe('production build guard', () => {
  it('lets the real-use settings through', () => {
    expect(prodEnvProblems({ VITE_APP_ENV: 'production', VITE_API_URL: 'https://api.example.org', VITE_API_FALLBACK: 'false', VITE_DEMO_SEED: 'false' })).toEqual([]);
  });
  it('does not touch staging or local builds', () => {
    expect(prodEnvProblems({ VITE_APP_ENV: 'staging' })).toEqual([]);
    expect(prodEnvProblems({})).toEqual([]);
  });
  it('fails a production build that has demo sign-ins, demo data or no server', () => {
    expect(prodEnvProblems({ VITE_APP_ENV: 'production' })).toHaveLength(3);
    expect(prodEnvProblems({ VITE_APP_ENV: 'production', VITE_API_URL: 'https://x', VITE_API_FALLBACK: 'true', VITE_DEMO_SEED: 'false' })).toHaveLength(1);
  });
});
