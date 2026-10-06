/**
 * Program impact M&E — objectives → indicators → measured values (W5).
 */

export type ImpactIndicatorKind = 'COUNT' | 'PERCENT' | 'CURRENCY' | 'TEXT';

export type ImpactIndicator = {
  id: string;
  label: string;
  kind: ImpactIndicatorKind;
  /** Target when kind is numeric. */
  target?: number;
  unit?: string;
};

export type ImpactValue = {
  indicatorId: string;
  /** ISO date of measurement. */
  asOf: string;
  value: number | string;
  note?: string;
  recordedByPersonId?: string;
};

export type ProgramObjective = {
  id: string;
  title: string;
  description?: string;
  indicators: ImpactIndicator[];
  values?: ImpactValue[];
};

export function latestValue(
  objective: ProgramObjective,
  indicatorId: string,
): ImpactValue | undefined {
  const rows = (objective.values ?? [])
    .filter((v) => v.indicatorId === indicatorId)
    .sort((a, b) => b.asOf.localeCompare(a.asOf));
  return rows[0];
}

export function indicatorProgress(
  indicator: ImpactIndicator,
  value: ImpactValue | undefined,
): number | null {
  if (indicator.target == null || indicator.target <= 0) return null;
  if (value == null || typeof value.value !== 'number') return null;
  return Math.min(100, Math.round((value.value / indicator.target) * 100));
}
