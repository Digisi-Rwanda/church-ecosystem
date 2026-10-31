import { ApiError } from '../api/client';
import type { ChoirCategoryLinkApi } from '../api/frontDoorApi';
export function schedulingError(reason: unknown): string | null {
  if (!(reason instanceof ApiError) || reason.status < 400 || reason.status >= 500) return null;
  const body = reason.body as { error?: string; issues?: Array<string | { message?: string }> } | undefined;
  return [body?.error, ...(body?.issues ?? []).map(row => typeof row === 'string' ? row : row.message)].filter(Boolean).join(' · ') || null;
}
export function musicExceptions(data: FormData, previous?: ChoirCategoryLinkApi | null) {
  const eligibleOverride = { ...previous?.eligibleOverride };
  const frequencyOverride = { ...previous?.frequencyOverride };
  for (const value of data.getAll('exceptionCode')) {
    const code = String(value);
    const key = (map: Record<string, unknown>) => Object.keys(map).find(k => k.toLowerCase() === code.toLowerCase()) ?? code;
    const eligibleKey = key(eligibleOverride), frequencyKey = key(frequencyOverride);
    const eligible = data.get('eligible:' + code);
    if (eligible === 'inherit') delete eligibleOverride[eligibleKey];
    else if (eligible === 'yes' || eligible === 'no') eligibleOverride[eligibleKey] = eligible === 'yes';
    const stored = frequencyOverride[frequencyKey];
    const next: Record<string, unknown> = { ...(stored && typeof stored === 'object' ? stored : {}) };
    for (const [field, property] of [['target','frequencyTarget'],['kind','frequencyKind'],['period','frequencyPeriod']] as const) {
      const value = data.get(field + ':' + code);
      if (value === '') delete next[property];
      else if (value !== null) next[property] = field === 'target' ? Number(value) : String(value);
    }
    if (Object.keys(next).length) frequencyOverride[frequencyKey] = next;
    else delete frequencyOverride[frequencyKey];
  }
  return { eligibleOverride, frequencyOverride };
}
export const preserveRelaxableKinds = (prior: string[], selected: string[]) => [...prior.filter(k => !['SS1', 'SS2', 'TUESDAY', 'IGABURO'].includes(k.toUpperCase())), ...selected];
