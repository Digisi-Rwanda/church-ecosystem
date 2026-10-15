import type { FundPot } from '../api/frontDoorApi';

const tr = (t: unknown) => t as (key: string, vars?: Record<string, string>) => string;

/** "Contribution pot" or "Donation pot". */
export const potTitle = (t: unknown, kind: string): string => tr(t)(`door.funds.pot.${kind}`);

/** What a bucket is for: Unrestricted, an activity's title, or a spending category. */
export function purposeName(t: unknown, p: { purposeKind: string; label: string }): string {
  if (p.purposeKind === 'ACTIVITY') return tr(t)('door.funds.for.activity', { name: p.label || '…' });
  if (p.purposeKind === 'CATEGORY') return tr(t)('door.funds.for.category', { name: tr(t)(`door.money.cat.${p.label}`) });
  return tr(t)('door.funds.for.none');
}

/** The full name of a bucket, as the set-aside lists show it. */
export const bucketName = (t: unknown, p: FundPot): string => `${potTitle(t, p.kind)} · ${purposeName(t, p)}`;
