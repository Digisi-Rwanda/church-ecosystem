import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { addMoneyPlanItem, changeMoneyPlanItem, fetchMoneyPlan, type MoneyPlanItemView } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { categoryKey, formatRwf, moneyErrorKey, parseAmount } from './money';
import { PlanSelect, YearSelect } from './MoneyBlockParts';
import { useLoad } from './useLoad';

/** The money action plan: what the unit plans to do this year and what it should cost. */
export function MoneyPlanPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { loading, failed, data, reload } = useLoad(() => fetchMoneyPlan(systemId, year), `mplan|${systemId}|${year}`);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [planId, setPlanId] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      reload();
      return true;
    } catch (e) {
      setError(t(moneyErrorKey(errorCode(e)) as 'door.people.actionFailed'));
      return false;
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = amount.trim() === '' ? 0 : parseAmount(amount);
    if (!title.trim() || n === null) return setError(t('door.money.form.incomplete'));
    if (await run(() => addMoneyPlanItem({ systemId, year, title: title.trim(), amount: n, dueMonth: month || null, category: category || null, planId: planId || null }))) {
      setTitle('');
      setAmount('');
      setMonth('');
      setCategory('');
      setPlanId('');
    }
  };
  const row = (i: MoneyPlanItemView) => (
    <li key={i.id} className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{i.title}</strong>
          <span className={`door-chip${i.status === 'PLANNED' ? ' warn' : ''}`}>{t(`door.money.plan.status.${i.status}` as 'door.money.plan.status.PLANNED')}</span>
        </div>
        <p className="muted">
          {formatRwf(i.amount)}
          {i.dueMonth && ` · ${i.dueMonth}`}
          {i.category && ` · ${t(categoryKey(i.category) as 'door.money.cat.OTHER')}`}
          {i.planTitle && ` · ${i.planTitle}`}
        </p>
        {data?.canWrite && i.status === 'PLANNED' && (
          <div className="door-row">
            <button type="button" className="btn sm" onClick={() => void run(() => changeMoneyPlanItem(i.id, { status: 'DONE' }))}>
              {t('door.money.plan.done')}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => void run(() => changeMoneyPlanItem(i.id, { status: 'DROPPED' }))}>
              {t('door.money.plan.drop')}
            </button>
          </div>
        )}
        {data?.canWrite && i.status !== 'PLANNED' && (
          <button type="button" className="btn ghost sm" onClick={() => void run(() => changeMoneyPlanItem(i.id, { status: 'PLANNED' }))}>
            {t('door.money.plan.reopen')}
          </button>
        )}
      </div>
    </li>
  );
  return (
    <section className="door-block" aria-labelledby="door-mplan-title">
      <div>
        <h2 id="door-mplan-title">{t('door.money.plan')}</h2>
        <p className="muted">{t('door.money.plan.intro')}</p>
      </div>
      <YearSelect year={year} onChange={setYear} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <p>
              <strong>{t('door.money.plan.total')}</strong> {formatRwf(data.totals.planned)} · {t('door.money.plan.budgetSpending')} {formatRwf(data.totals.budgetSpending)}
            </p>
            {data.canWrite && (
              <form className="panel door-form" onSubmit={add} noValidate>
                <h3>{t('door.money.plan.new')}</h3>
                <TextField label={t('door.money.plan.title')} name="mp-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
                <TextField label={t('door.money.plan.cost')} name="mp-cost" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <TextField label={t('door.money.plan.month')} name="mp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                <SelectField label={t('door.money.col.category')} name="mp-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{t('door.money.plan.noCategory')}</option>
                  {data.categories.map((c) => (
                    <option key={c} value={c}>
                      {t(categoryKey(c) as 'door.money.cat.OTHER')}
                    </option>
                  ))}
                </SelectField>
                <PlanSelect systemId={systemId} name="mp-plan" value={planId} onChange={setPlanId} />
                <button type="submit" className="btn">
                  {t('door.money.plan.add')}
                </button>
              </form>
            )}
            {data.items.length === 0 ? <EmptyState title={t('door.money.plan.none')} /> : <ul className="door-notices">{data.items.map(row)}</ul>}
          </>
        )}
      </LoadState>
    </section>
  );
}
