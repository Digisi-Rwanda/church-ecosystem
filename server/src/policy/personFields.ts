/**
 * Field-level privacy for Person records (step 4, slice 1).
 *
 *  FULL  — Church Leader: every field.
 *  BASIC — Catechist: name, contact, status. No identity or pastoral data.
 *  DIRECTORY — ministry leaders and other role holders: names and status only,
 *              enough to pick people for a team, no contact details.
 *  SELF  — the person's own record: everything.
 *  NONE  — nothing.
 */
export type PersonTier = 'FULL' | 'BASIC' | 'DIRECTORY' | 'SELF' | 'NONE';

export const DIRECTORY_FIELDS = ['id', 'memberCode', 'fullName', 'preferredName', 'status'] as const;

export const BASIC_FIELDS = [
  'id',
  'memberCode',
  'fullName',
  'preferredName',
  'phone',
  'email',
  'status',
  'photoUrl',
  'archivedAt',
  'createdAt',
  'updatedAt',
] as const;

export const SELF_EDITABLE = ['preferredName', 'phone', 'email', 'address', 'photoUrl'] as const;

export function tierFor(opts: {
  viewerId: string;
  targetId: string;
  canViewFull: boolean;
  /** People-module access: Church Leader / Catechist level. */
  canViewBasic: boolean;
  /** Any role holder with the plain PERSON VIEW grant. */
  canViewDirectory?: boolean;
}): PersonTier {
  if (opts.canViewFull) return 'FULL';
  if (opts.viewerId === opts.targetId) return 'SELF';
  if (opts.canViewBasic) return 'BASIC';
  if (opts.canViewDirectory) return 'DIRECTORY';
  return 'NONE';
}

export function filterPerson<T extends Record<string, unknown>>(
  person: T,
  tier: PersonTier,
): Partial<T> | null {
  if (tier === 'NONE') return null;
  if (tier === 'FULL' || tier === 'SELF') return { ...person };
  const out: Record<string, unknown> = {};
  const fields = tier === 'DIRECTORY' ? DIRECTORY_FIELDS : BASIC_FIELDS;
  for (const k of fields) if (k in (person as object)) out[k] = (person as Record<string, unknown>)[k];
  return out as Partial<T>;
}
