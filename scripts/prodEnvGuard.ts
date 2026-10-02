/**
 * Build-time safety net for the live website. Set VITE_APP_ENV=production only
 * on the production Vercel project. The build then FAILS (instead of shipping a
 * site that quietly accepts demo passwords) unless the settings are the real-use ones.
 * Staging uses VITE_APP_ENV=staging, which shows a "test data" ribbon.
 */
export function prodEnvProblems(env: Record<string, string | undefined>): string[] {
  if (env.VITE_APP_ENV !== 'production') return [];
  const p: string[] = [];
  if (!env.VITE_API_URL?.trim()) p.push('VITE_API_URL is empty: the live site must talk to the server');
  if (env.VITE_API_FALLBACK !== 'false') p.push('VITE_API_FALLBACK must be "false" (no demo sign-ins bundled in the site)');
  if (env.VITE_DEMO_SEED !== 'false') p.push('VITE_DEMO_SEED must be "false" (no demo roster or choirs)');
  return p;
}
