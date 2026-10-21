/** What a viewer is offered: the fields, operators and choices of a registry that they may use, and nothing else. */
import { LIMITS, OPERATORS, type FieldDef, type Registry } from './types.js';

export interface FieldSchema {
  key: string; type: string; operators: readonly string[];
  choices?: readonly string[]; comparable?: string[]; min?: number; max?: number;
  sortable: boolean; unitValued?: boolean; parts?: ReadonlyArray<{ key: string; kind: 'text' | 'unit' }>;
}

export function schemaFor<R, C, V>(registry: Registry<R, C, V>, viewer: V): { fields: FieldSchema[]; sortable: string[]; limits: Record<string, number> } {
  const fields = registry.filter((f) => f.allowed(viewer)).map((f: FieldDef<R, C, V>): FieldSchema => ({
    key: f.key, type: f.type, operators: OPERATORS[f.type],
    ...(f.choices ? { choices: f.choices } : {}),
    ...(f.rank ? { comparable: (f.choices ?? []).filter((c) => f.rank![c] !== undefined) } : {}),
    ...(f.type === 'number' ? { min: f.min ?? 0, max: f.max ?? 1000 } : {}),
    sortable: !!f.sortKey,
    ...(f.unitRefs ? { unitValued: true } : {}),
    ...(f.valueParts ? { parts: f.valueParts } : {}),
  }));
  return {
    fields,
    sortable: fields.filter((f) => f.sortable).map((f) => f.key),
    limits: { conditions: LIMITS.conditions, groups: LIMITS.groups, listValues: LIMITS.listValues, stringLength: LIMITS.stringLength, pageSize: LIMITS.pageSize, defaultPageSize: LIMITS.defaultPageSize },
  };
}
