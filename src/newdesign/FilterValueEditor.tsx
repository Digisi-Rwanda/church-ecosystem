import { useId } from 'react';
import { useT } from '../i18n/I18nContext';
import { shapeOf, type DraftValue } from './filterDraft';
import type { FilterLabels } from './filterLabels';
import type { FieldSchema, FilterSchema, ValuePart } from './filterModel';

type Rec = Record<string, string | string[]>;
const asRec = (v: DraftValue): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const asList = (v: DraftValue | undefined): string[] => (Array.isArray(v) ? v : []);
const asText = (v: DraftValue | undefined): string => (typeof v === 'string' ? v : '');

/** Several ticks in a wrapped row; long lists (units) scroll inside their own box. */
function Checks({ legend, options, value, onChange, id }: { legend: string; options: Array<[string, string]>; value: string[]; onChange: (next: string[]) => void; id: string }) {
  return (
    <fieldset className={`pf-checks${options.length > 12 ? ' pf-scroll' : ''}`}>
      <legend className="sr-only">{legend}</legend>
      {options.map(([v, label]) => (
        <label key={v} className="control-check" htmlFor={`${id}-${v}`}>
          <input id={`${id}-${v}`} type="checkbox" checked={value.includes(v)} onChange={(e) => onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Single({ id, label, options, value, onChange, invalid }: { id: string; label: string; options: Array<[string, string]>; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const t = useT();
  return (
    <select id={id} aria-label={label} aria-invalid={invalid || undefined} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('door.pf.choose')}</option>
      {options.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
    </select>
  );
}

function NumberBox({ id, label, value, onChange, min, max, invalid }: { id: string; label: string; value: string; onChange: (v: string) => void; min: number; max: number; invalid: boolean }) {
  return <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} aria-label={label} aria-invalid={invalid || undefined} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** The input(s) for one condition's value, chosen by the field's type and the operator picked. */
export function FilterValueEditor({ schema, field, op, value, onChange, labels, invalid }: {
  schema: FilterSchema; field: FieldSchema; op: string; value: DraftValue; onChange: (next: DraftValue) => void; labels: FilterLabels; invalid: boolean;
}) {
  const t = useT();
  const id = useId();
  const shape = shapeOf(field, op);
  const name = labels.field(field.key);
  const lo = field.min ?? 0, hi = field.max ?? 1000;
  const choices = (op === 'atLeast' || op === 'atMost' ? (field.comparable ?? field.choices) : field.choices) ?? [];
  const choiceOptions: Array<[string, string]> = choices.map((c) => [c, labels.choice(c)]);
  const unitOptions: Array<[string, string]> = schema.units.map((u) => [u.id, u.name]);

  if (shape === 'none') return null;
  if (shape === 'list') return <Checks id={id} legend={name} options={field.unitValued ? unitOptions : choiceOptions} value={asList(value)} onChange={onChange} />;
  if (shape === 'pair') {
    const r = asRec(value);
    const date = field.type === 'date';
    const box = (k: 'from' | 'to') => date
      ? <input id={`${id}-${k}`} type="date" aria-label={t(k === 'from' ? 'door.pf.from' : 'door.pf.to')} aria-invalid={invalid || undefined} value={asText(r[k])} onChange={(e) => onChange({ ...r, [k]: e.target.value })} />
      : <NumberBox id={`${id}-${k}`} label={t(k === 'from' ? 'door.pf.from' : 'door.pf.to')} value={asText(r[k])} min={lo} max={hi} invalid={invalid} onChange={(v) => onChange({ ...r, [k]: v })} />;
    return <div className="pf-pair">{box('from')}<span className="pf-and">{t('door.pf.and')}</span>{box('to')}</div>;
  }
  if (shape === 'duration') {
    const r = asRec(value);
    return (
      <div className="pf-pair">
        <NumberBox id={`${id}-amount`} label={t('door.pf.amount')} value={asText(r.amount)} min={1} max={3660} invalid={invalid} onChange={(v) => onChange({ ...r, amount: v })} />
        <select aria-label={t('door.pf.unit')} value={asText(r.unit) || 'days'} onChange={(e) => onChange({ ...r, unit: e.target.value })}>
          {(['days', 'months', 'years'] as const).map((u) => (<option key={u} value={u}>{t(`door.pf.unitName.${u}` as 'door.pf.unitName.days')}</option>))}
        </select>
      </div>
    );
  }
  if (shape === 'parts') {
    const r = asRec(value);
    const set = (k: string, v: string | string[]) => onChange({ ...r, [k]: v });
    return (
      <div className="pf-parts">
        {(field.parts ?? []).map((p: ValuePart) => {
          const pid = `${id}-${p.key}`;
          const label = labels.part(field.key, p.key);
          return (
            <div key={p.key} className={`pf-part${p.kind === 'choices' ? ' pf-part-wide' : ''}`}>
              <label className="pf-part-label" htmlFor={pid}>{label}</label>
              {p.kind === 'text' && <input id={pid} type="text" maxLength={schema.limits.stringLength} aria-invalid={invalid || undefined} value={asText(r[p.key])} onChange={(e) => set(p.key, e.target.value)} />}
              {p.kind === 'number' && <NumberBox id={pid} label={label} value={asText(r[p.key])} min={p.min ?? 0} max={p.max ?? 1000} invalid={invalid} onChange={(v) => set(p.key, v)} />}
              {p.kind === 'choice' && <Single id={pid} label={label} options={(p.choices ?? []).map((c) => [c, labels.choice(c)])} value={asText(r[p.key])} invalid={invalid} onChange={(v) => set(p.key, v)} />}
              {p.kind === 'unit' && <Single id={pid} label={label} options={unitOptions} value={asText(r[p.key])} invalid={invalid} onChange={(v) => set(p.key, v)} />}
              {p.kind === 'choices' && <Checks id={pid} legend={label} options={(p.choices ?? []).map((c) => [c, labels.choice(c)])} value={asList(r[p.key])} onChange={(v) => set(p.key, v)} />}
            </div>
          );
        })}
      </div>
    );
  }
  // one box
  if (field.type === 'text') return <input id={id} type="text" maxLength={schema.limits.stringLength} aria-label={name} aria-invalid={invalid || undefined} value={asText(value)} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === 'number') return <NumberBox id={id} label={name} value={asText(value)} min={lo} max={hi} invalid={invalid} onChange={onChange} />;
  if (field.type === 'date') return <input id={id} type="date" aria-label={name} aria-invalid={invalid || undefined} value={asText(value)} onChange={(e) => onChange(e.target.value)} />;
  return <Single id={id} label={name} options={choiceOptions} value={asText(value)} invalid={invalid} onChange={onChange} />;
}
