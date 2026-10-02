/**
 * Safety net for the real deployment. Set APP_ENV=production only on the live
 * service; staging uses APP_ENV=staging (or leaves it unset). When it is
 * `production`, the API refuses to start with settings that are fine for a
 * rehearsal but unsafe for real members, instead of starting quietly.
 */
export type Env = Record<string, string | undefined>;

export function productionProfileProblems(env: Env): string[] {
  if (env.APP_ENV !== 'production') return [];
  const p: string[] = [];
  if (env.SEED_DEMO_ACCOUNTS === 'true') {
    p.push('SEED_DEMO_ACCOUNTS=true would create sign-ins with publicly known passwords');
  }
  if (env.SEED_DEFAULT_CHOIRS === 'true') {
    p.push('SEED_DEFAULT_CHOIRS=true would create the demo choirs');
  }
  if ((env.SCHEDULE_GUARD ?? 'warn') === 'off') {
    p.push('SCHEDULE_GUARD=off disables role checks on the shared schedules (use warn or enforce)');
  }
  if (env.SCHEDULE_READ_FILTER !== 'on') {
    p.push('SCHEDULE_READ_FILTER must be "on" so people only receive what they may see');
  }
  if (env.NODE_ENV !== 'production') {
    p.push('NODE_ENV must be "production"');
  }
  const pastor = env.BOOTSTRAP_PASTOR_PASSWORD ?? '';
  if (pastor.length > 0 && pastor.length < 10) {
    p.push('BOOTSTRAP_PASTOR_PASSWORD must be at least 10 characters');
  }
  return p;
}

export function assertProductionProfile(env: Env = process.env): void {
  const problems = productionProfileProblems(env);
  if (problems.length) {
    throw new Error(
      'APP_ENV=production but the settings are not safe for real members:\n  - ' + problems.join('\n  - '),
    );
  }
}
