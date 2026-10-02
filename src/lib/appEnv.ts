/** Which deployment this build is: production, staging, or local development. */
export type AppEnv = 'production' | 'staging' | 'local';

export function appEnv(): AppEnv {
  const v = import.meta.env.VITE_APP_ENV;
  return v === 'production' || v === 'staging' ? v : 'local';
}
