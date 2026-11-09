import { useEffect, useState } from 'react';
import { addMoneyLine, removeMoneyLine, setMoneySources, type ActivityMoney, type PlanDetail } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { bucketName } from './fundLabels';
import { errorCode } from './governance';
import { categoryKey, formatRwf } from './money';
import { planErrorKey } from './plans';

export const COST_CATEGORIES = ['EVENT', 'SUPPLIES', 'SERVICES', 'TRANSPORT', 'AID', 'DONATION', 'OTHER'];
type Row = { potId: string; amount: string };
const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Step 2 of creating an activity: what it will cost, and which money is set aside for it.
 * A draft holds nothing. The set-aside list offers only the funds that apply to this activity
 * (unrestricted money, money restricted to it, or restricted to a category one of its cost lines is in).
 */
export function CreateMoney({ p, m, kind, onChange }: { p: PlanDetail; m: ActivityMoney; kind: string; onChange: (next: ActivityMoney) => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [phase, setPhase] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const phases = p.milestones.map((x) => ({ id: x.id, title: x.title }));
  const fingerprint = m.sources.map((s) => `${s.potId}:${s.amount}`).join('|');
  useEffect(() => {
    setRows(m.sources.map((s) => ({ potId: s.potId, amount: String(s.amount) })));
  }, [fingerprint]);

  const go = async (job: () => Promise<ActivityMoney>, after?: () => void) => {
    setError('');
    try {
      onChange(await job());
      after?.();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const aside = rows.reduce((n, r) => n + num(r.amount), 0);
  const gap = m.planned - aside;
  const free = (potId: string) => m.pots.find((x) => x.id === potId)?.available ?? 0;
  const usable = m.pots.filter((x) => x.available > 0 || rows.some((r) => r.potId === x.id));
  const target = p.fundTarget ?? 0;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dirty = rows.map((r) => `${r.potId}:${num(r.amount)}`).filter((x) => !x.endsWith(':0')).join('|') !== fingerprint;

  return (
    <>
      <div className="panel-inset">
        <h4>{t(`door.ac.cost.${kind}` as 'door.ac.cost.event')}</h4>
        <p className="muted">{t(`door.ac.cost.${kind}.hint` as 'door.ac.cost.event.hint')}</p>
        {m.lines.length > 0 && (
          <div className="door-table-wrap">
            <table className="door-table door-stack">
              <thead>
                <tr>
                  <th scope="col">{t('door.pm.for')}</th>
                  <th scope="col">{t('door.ac.category')}</th>
                  {kind === 'project' && phases.length > 0 && <th scope="col">{t('door.pm.phase.pick')}</th>}
                  <th scope="col">{t('door.pm.amount')}</th>
                  <th scope="col"><span className="sr-only">{t('door.funds.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {m.lines.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">{l.title}</th>
                    <td data-label={t('door.ac.category')}>{l.category ? t(categoryKey(l.category) as 'door.money.cat.OTHER') : '—'}</td>
                    {kind === 'project' && phases.length > 0 && <td data-label={t('door.pm.phase.pick')}>{phases.find((x) => x.id === l.milestoneId)?.title ?? t('door.pm.phase.general')}</td>}
                    <td data-label={t('door.pm.amount')}>{formatRwf(l.amount)}</td>
                    <td><button type="button" className="btn ghost sm" onClick={() => void go(() => removeMoneyLine(p.id, l.id))}>{t('door.pm.remove')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="door-form">
          <TextField label={t('door.pm.for')} name="ac-line-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <SelectField label={t('door.ac.category')} name="ac-line-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('door.ac.categoryNone')}</option>
            {COST_CATEGORIES.map((c) => <option key={c} value={c}>{t(categoryKey(c) as 'door.money.cat.OTHER')}</option>)}
          </SelectField>
          {kind === 'project' && phases.length > 0 && (
            <SelectField label={t('door.pm.phase.pick')} name="ac-line-phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="">{t('door.pm.phase.general')}</option>
              {phases.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </SelectField>
          )}
          <TextField label={t('door.pm.amount')} name="ac-line-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button
            type="button"
            className="btn secondary sm"
            disabled={!title.trim() || num(amount) < 1}
            onClick={() => void go(() => addMoneyLine(p.id, { title: title.trim(), amount: num(amount), ...(category ? { category } : {}), ...(phase ? { milestoneId: phase } : {}) }), () => { setTitle(''); setAmount(''); })}
          >
            {t('door.pm.add')}
          </button>
        </div>
      </div>

      <div className="panel-inset">
        <h4>{t('door.ac.aside')}</h4>
        <p className="muted">{t('door.ac.aside.hint')}</p>
        {rows.map((r, i) => (
          <div className="door-row" key={`${r.potId}-${i}`}>
            <SelectField label={t('door.ac.fund')} name={`ac-aside-pot-${i}`} value={r.potId} onChange={(e) => set(i, { potId: e.target.value })}>
              {usable.filter((x) => x.id === r.potId || !rows.some((o) => o.potId === x.id)).map((x) => (
                <option key={x.id} value={x.id}>{bucketName(t, x)} — {t('door.funds.available')} {formatRwf(x.available)}</option>
              ))}
            </SelectField>
            <TextField label={t('door.pm.setAside')} name={`ac-aside-amt-${i}`} inputMode="numeric" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
            {num(r.amount) > free(r.potId) + (m.sources.find((s) => s.potId === r.potId)?.amount ?? 0) && <p className="door-error" role="status">{t('door.ac.moreThanFree')}</p>}
            <button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t('door.pm.remove')}</button>
          </div>
        ))}
        {usable.length === 0 && <p className="muted">{t('door.ac.noFunds')}</p>}
        <div className="door-row">
          {usable.some((x) => !rows.some((r) => r.potId === x.id)) && (
            <button type="button" className="btn secondary sm" onClick={() => setRows([...rows, { potId: usable.find((x) => !rows.some((r) => r.potId === x.id))!.id, amount: '' }])}>{t('door.ac.addAside')}</button>
          )}
          {gap > 0 && rows.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setRows(rows.map((r, i) => (i === rows.length - 1 ? { ...r, amount: String(num(r.amount) + gap) } : r)))}>{t('door.ac.fillGap')}</button>}
          <button
            type="button"
            className="btn sm"
            disabled={!dirty}
            onClick={() => void go(() => setMoneySources(p.id, rows.map((r) => { const pot = m.pots.find((x) => x.id === r.potId)!; return { kind: pot.kind, code: pot.code, amount: num(r.amount) }; }).filter((x) => x.amount > 0)))}
          >
            {t('door.pm.saveAside')}
          </button>
        </div>
      </div>

      <div className="stat-tiles" aria-label={t('door.ac.totals')}>
        <div className="stat-tile"><span className="muted">{t('door.ac.totalCost')}</span><strong>{formatRwf(m.planned)}</strong></div>
        <div className="stat-tile"><span className="muted">{t('door.ac.totalAside')}</span><strong>{formatRwf(aside)}</strong></div>
        <div className="stat-tile"><span className="muted">{t('door.ac.gap')}</span><strong>{formatRwf(m.planned - aside)}</strong></div>
        {kind === 'fundraising' && <div className="stat-tile"><span className="muted">{t('door.ac.net')}</span><strong>{formatRwf(target - m.planned)}</strong></div>}
      </div>
      <p className={m.gap === 0 && !dirty ? 'muted' : 'door-error'} role="status">{dirty ? t('door.ac.unsaved') : m.gap === 0 ? t('door.ac.balanced') : t('door.ac.blocked')}</p>
      {kind === 'program' && m.planned > 0 && <p className="muted">{t('door.ac.burn', { n: formatRwf(Math.round(m.planned / 12)) })}</p>}
      {error && <p className="door-error" role="alert">{error}</p>}
    </>
  );
}
