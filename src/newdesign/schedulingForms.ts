import { ApiError } from '../api/client';
export function schedulingError(reason: unknown): string | null {
  if (!(reason instanceof ApiError) || reason.status < 400 || reason.status >= 500) return null;
  const body = reason.body as { error?: string; message?: string; errors?: string[]; holder?: { name?: string | null }; issues?: Array<string | { message?: string }> } | undefined;
  // 422 from saveConfigChange carries `errors: string[]`; 409 LOCKED / SCHEDULE_FROZEN carry `message`.
  const parts = [body?.message ?? body?.error, ...(body?.errors ?? []), ...(body?.issues ?? []).map(row => typeof row === 'string' ? row : row.message)];
  return [...new Set(parts.filter(Boolean))].join(' · ') || null;
}
export const preserveRelaxableKinds = (prior: string[], selected: string[], editable: ReadonlySet<string>) =>
  [...prior.filter((kind) => !editable.has(kind.toUpperCase())), ...selected];
