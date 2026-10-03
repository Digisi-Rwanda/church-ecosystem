/**
 * Field-level privacy for Person records (step 4, slice 1).
 *
 *  FULL  — Church Leader: every field.
 *  BASIC — Catechist: name, contact, status. No identity or pastoral data.
 *  SELF  — the person's own record: everything.
 *  NONE  — nothing.
 */
export type PersonTier = 'FULL' | 'BASIC' | 'SELF' | 'NONE';

export const BASIC_FIELDS = [
  'id',
  'fullName',
  'preferredName',
  'phone',
  'email',
  'status',
  'photoUrl',
  'createdAt',
  'updatedAt',
] as const;

export const SELF_EDITABLE = ['preferredName', 'phone', 'email', 'address', 'photoUrl'] as const;

export function tierFor(opts: {
  viewerId: string;
  targetId: string;
  canViewFull: boolean;
  canViewBasic: boolean;
}): PersonTier {
  if (opts.canViewFull) return 'FULL';
  if (opts.viewerId === opts.targetId) return 'SELF';
  if (opts.canViewBasic) return 'BASIC';
  return 'NONE';
}

export function filterPerson<T extends Record<string, unknown>>(
  person: T,
  tier: PersonTier,
): Partial<T> | null {
  if (tier === 'NONE') return null;
  if (tier === 'FULL' || tier === 'SELF') return { ...person };
  const out: Record<string, unknown> = {};
  for (const k of BASIC_FIELDS) if (k in person) out[k] = person[k];
  return out as Partial<T>;
}
