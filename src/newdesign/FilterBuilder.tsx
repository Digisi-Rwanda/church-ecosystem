import { useId, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { checkDraft, draftFrom, newDraftCondition, withField, withOp, type Draft, type DraftCondition, type DraftProblem } from './filterDraft';
import { FilterValueEditor } from './FilterValueEditor';
import type { FilterLabels } from './filterLabels';
import { fieldOf, type Condition, type FilterSchema } from './filterModel';

type Props = {
  schema: FilterSchema; labels: FilterLabels;
  all: Condition[]; groups: Condition[][];
  onApply: (all: Condition[], groups: Condition[][]) => void;
  onClose: () => void;
};

function problemText(t: ReturnType<typeof useT>, p: DraftProblem): string {
  switch (p.code) {
    case 'range': return t('door.pf.err.range', { min: p.min, max: p.max });
    case 'long': return t('door.pf.err.long', { max: p.max });
    case 'many': return t('door.pf.err.many', { max: p.max });
    default: return t(`door.pf.err.${p.code}` as 'door.pf.err.required');
  }
}

/**
 * Add, change and remove conditions, then apply them together. The form edits a copy: nothing changes in the
 * list until "Apply", and a row that is not filled in correctly says so instead of being left out.
 * Fields, operators and choices all come from the schema the server published for this viewer.
 */
export function FilterBuilder({ schema, labels, all, groups, onApply, onClose }: Props) {
  const t = useT();
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(schema, all, groups));
  const [attempted, setAttempted] = useState(false);
  const check = checkDraft(schema, draft);
  const total = draft.all.length + draft.groups.reduce((n, g) => n + g.length, 0);
  const full = total >= schema.limits.conditions;
  const firstField = schema.fields[0];

  const setRow = (where: 'all' | number, key: string, f: (c: DraftCondition) => DraftCondition) =>
    setDraft((d) => where === 'all' ? { ...d, all: d.all.map((c) => (c.key === key ? f(c) : c)) } : { ...d, groups: d.groups.map((g, i) => (i === where ? g.map((c) => (c.key === key ? f(c) : c)) : g)) });
  const dropRow = (where: 'all' | number, key: string) =>
    setDraft((d) => where === 'all' ? { ...d, all: d.all.filter((c) => c.key !== key) } : { ...d, groups: d.groups.map((g, i) => (i === where ? g.filter((c) => c.key !== key) : g)).filter((g) => g.length > 0) });
  const addRow = (where: 'all' | number) => {
    if (!firstField || full) return;
    const row = newDraftCondition(firstField);
    setDraft((d) => where === 'all' ? { ...d, all: [...d.all, row] } : { ...d, groups: d.groups.map((g, i) => (i === where ? [...g, row] : g)) });
  };
  const addGroup = () => {
    if (!firstField || full || draft.groups.length >= schema.limits.groups) return;
    setDraft((d) => ({ ...d, groups: [...d.groups, [newDraftCondition(firstField)]] }));
  };

  const apply = () => {
    setAttempted(true);
    if (!check.ok) return;
    onApply(check.all, check.groups);
  };

  const renderRow = (where: 'all' | number, dc: DraftCondition, index: number, join: string) => {
    const field = fieldOf(schema, dc.field) ?? firstField!;
    const problem = attempted ? check.problems[dc.key] : undefined;
    const id = `${uid}-${dc.key}`;
    return (
      <li key={dc.key} className="pf-row" data-join={index > 0 ? join : undefined}>
        <div className="pf-row-head">
          <div className="pf-pick">
            <label className="sr-only" htmlFor={`${id}-f`}>{t('door.pf.field')}</label>
            <select id={`${id}-f`} value={dc.field} onChange={(e) => setRow(where, dc.key, (c) => withField(c, fieldOf(schema, e.target.value) ?? field))}>
              {schema.fields.map((f) => (<option key={f.key} value={f.key}>{labels.field(f.key)}</option>))}
            </select>
          </div>
          <div className="pf-pick">
            <label className="sr-only" htmlFor={`${id}-o`}>{t('door.pf.operator')}</label>
            <select id={`${id}-o`} value={dc.op} onChange={(e) => setRow(where, dc.key, (c) => withOp(c, field, e.target.value))}>
              {field.operators.map((o) => (<option key={o} value={o}>{labels.op(field, o)}</option>))}
            </select>
          </div>
          <button type="button" className="btn ghost sm pf-remove" aria-label={t('door.pf.removeRow', { name: labels.field(field.key) })} onClick={() => dropRow(where, dc.key)}>×</button>
        </div>
        <div className="pf-row-value">
          <FilterValueEditor schema={schema} field={field} op={dc.op} value={dc.value} labels={labels} invalid={!!problem} onChange={(value) => setRow(where, dc.key, (c) => ({ ...c, value }))} />
        </div>
        {problem && <p className="pf-error" role="alert">{problemText(t, problem)}</p>}
      </li>
    );
  };

  return (
    <section className="pf-builder" aria-labelledby={`${uid}-title`}>
      <header className="pf-head">
        <div>
          <h3 id={`${uid}-title`}>{t('door.pf.title')}</h3>
          <p className="muted">{t('door.pf.hint')}</p>
        </div>
      </header>

      <div className="pf-block">
        <h4>{t('door.pf.all.title')}</h4>
        <p className="muted">{t('door.pf.all.hint')}</p>
        {draft.all.length > 0 && <ul className="pf-rows">{draft.all.map((c, i) => renderRow('all', c, i, t('door.pf.and')))}</ul>}
        <button type="button" className="btn secondary sm" disabled={full} onClick={() => addRow('all')}>{t('door.pf.addCondition')}</button>
      </div>

      {draft.groups.map((g, gi) => (
        <div key={g[0]?.key ?? gi} className="pf-block pf-group">
          <h4>{t('door.pf.group.title', { n: gi + 1 })}</h4>
          <p className="muted">{t('door.pf.group.hint')}</p>
          <ul className="pf-rows">{g.map((c, i) => renderRow(gi, c, i, t('door.pf.or')))}</ul>
          <div className="pf-actions">
            <button type="button" className="btn secondary sm" disabled={full} onClick={() => addRow(gi)}>{t('door.pf.addOption')}</button>
            <button type="button" className="btn ghost sm" onClick={() => setDraft((d) => ({ ...d, groups: d.groups.filter((_, i) => i !== gi) }))}>{t('door.pf.removeGroup')}</button>
          </div>
        </div>
      ))}

      <div className="pf-foot">
        <button type="button" className="btn ghost sm" disabled={full || draft.groups.length >= schema.limits.groups} onClick={addGroup}>{t('door.pf.addGroup')}</button>
        <span className="muted pf-room">{check.tooMany ? t('door.pf.err.tooMany', { max: schema.limits.conditions }) : t('door.pf.room', { n: Math.max(0, schema.limits.conditions - total) })}</span>
      </div>
      {attempted && !check.ok && <p className="pf-error" role="alert">{t('door.pf.fixFirst')}</p>}
      <div className="pf-buttons">
        <button type="button" className="btn" onClick={apply}>{t('door.pf.apply')}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t('door.pf.cancel')}</button>
        {total > 0 && <button type="button" className="btn ghost" onClick={() => { setDraft({ all: [], groups: [] }); setAttempted(false); }}>{t('door.pf.clearRows')}</button>}
      </div>
    </section>
  );
}
