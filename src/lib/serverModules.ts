/**
 * Per-module switch for data that has moved to the server (step 4).
 * Default OFF so nothing changes until a module is proven on staging:
 *   VITE_SERVER_MODULES=people,memberships   (comma separated, or "all")
 */
export type ServerModule = 'people' | 'participation';

const raw = (): string => String(import.meta.env.VITE_SERVER_MODULES ?? '');

export function serverModuleEnabled(name: ServerModule): boolean {
  const list = raw()
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes('all') || list.includes(name);
}
