/**
 * Units from the first seed that Moriah no longer shows on the Organisation page: Central Administration
 * stands for the whole church, and Finance is now done by each unit's own treasurer, so these cards were
 * duplicates. They stay in the database (people and appointments may still point at them), only hidden.
 */
export const RETIRED_UNIT_IDS: ReadonlySet<string> = new Set(['ou-church', 'ou-leadership', 'ou-admin', 'ou-worship', 'ou-finance']);

export const isRetiredUnit = (id: string): boolean => RETIRED_UNIT_IDS.has(id);
