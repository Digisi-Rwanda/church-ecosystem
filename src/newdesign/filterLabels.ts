import { en, type MessageKey } from '../i18n/messages/en';
import { useI18n } from '../i18n/I18nContext';
import { fieldOf, type Condition, type FieldSchema, type FilterSchema } from './filterModel';

/** The words a filter screen shows. Anything the schema names that has no wording yet falls back to its plain key. */
export type FilterLabels = {
  field: (key: string) => string;
  op: (field: FieldSchema, op: string) => string;
  part: (fieldKey: string, partKey: string) => string;
  choice: (value: string) => string;
  unit: (id: string) => string;
  day: (iso: string) => string;
  sentence: (c: Condition) => string;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const has = (key: string): key is MessageKey => key in en;
const VALUE_PREFIXES = ['door.p360.v.', 'door.status.', 'door.people.marital.'];
const humanize = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Wording for the conditions of any list, from the schema that list's server published. */
export function useFilterLabels(schema: FilterSchema): FilterLabels {
  const { t, tn, locale } = useI18n();
  const word = (key: string, fallback: string, params?: Record<string, string | number>) => (has(key) ? t(key, params) : fallback);
  const labels: FilterLabels = {
    t,
    field: (key) => word(`door.pf.field.${key}`, humanize(key)),
    op: (field, op) => word(`door.pf.op.${field.type}.${op}`, humanize(op)),
    part: (fieldKey, partKey) => word(`door.pf.part.${fieldKey}.${partKey}`, humanize(partKey)),
    choice: (value) => {
      const key = VALUE_PREFIXES.map((p) => p + value).find(has);
      return key ? t(key) : humanize(value);
    },
    unit: (id) => schema.units.find((u) => u.id === id)?.name ?? id,
    day: (iso) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)),
    sentence: (c) => {
      const field = fieldOf(schema, c.field);
      if (!field) return c.field;
      return sentenceOf(field, c, labels, tn);
    },
  };
  return labels;
}

const list = (v: unknown, one: (x: string) => string) => (Array.isArray(v) ? v.map((x) => one(String(x))).join(', ') : one(String(v ?? '')));

/** One condition in a line a person can read: "Age is at least 30", "Education has one where Level at least: Bachelor". */
export function sentenceOf(field: FieldSchema, c: Condition, l: FilterLabels, tn: (key: string, count: number, params?: Record<string, string | number>) => string): string {
  const name = l.field(field.key);
  const op = l.op(field, c.op);
  if (field.type === 'boolean') return l.t('door.pf.chip.bool', { field: name, op });
  let value: string;
  switch (field.type) {
    case 'text': value = `“${String(c.value)}”`; break;
    case 'number': value = c.op === 'between' ? l.t('door.pf.range', { a: String((c.value as number[])[0]), b: String((c.value as number[])[1]) }) : String(c.value); break;
    case 'date':
      if (c.op === 'between') value = l.t('door.pf.range', { a: l.day((c.value as string[])[0]!), b: l.day((c.value as string[])[1]!) });
      else if (c.op === 'withinLast' || c.op === 'withinNext') {
        const v = c.value as { amount: number; unit: string };
        value = tn(`door.pf.unit.${v.unit}`, v.amount);
      } else value = l.day(String(c.value));
      break;
    case 'multi': value = list(c.value, field.unitValued ? l.unit : l.choice); break;
    case 'records': {
      const v = (c.value ?? {}) as Record<string, unknown>;
      value = (field.parts ?? []).filter((p) => v[p.key] !== undefined).map((p) => {
        const raw = v[p.key];
        const shown = p.kind === 'unit' ? l.unit(String(raw)) : p.kind === 'choice' || p.kind === 'choices' ? list(raw, l.choice) : String(raw);
        return `${l.part(field.key, p.key)}: ${shown}`;
      }).join('; ');
      break;
    }
    default: value = list(c.value, l.choice);
  }
  return l.t('door.pf.chip', { field: name, op, value });
}
