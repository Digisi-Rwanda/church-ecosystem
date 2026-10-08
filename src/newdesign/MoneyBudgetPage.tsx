import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchBudget, saveBudgetLine, setBudgetApproval, type BudgetKind, type BudgetView } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { categoryKey, formatRwf, moneyErrorKey } from './money';
import { YearSelect } from './MoneyBlockParts';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The budget of one unit for one year: a planned amount per kind of money. Totals are computed. */
export function MoneyBudgetPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { loading, failed, data, reload } = useLoad(() => fetchBudget(systemId, year), `budget|${systemId}|${year}`);
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      reload();
    } catch (e) {
      setError(t(moneyErrorKey(errorCode(e)) as 'door.people.actionFailed'));
    }
  };
  return (
    <section className="door-block" aria-labelledby="door-budget-title">
      <div>
        <PageHeader id="door-budget-title" title={t('door.money.budget')} purpose={t('door.purpose.budget')} />
        <p className="muted">{t('door.money.budget.intro')}</p>
      </div>
      <YearSelect year={year} onChange={setYear} />
      {data?.canWrite && <div className="door-row"><ImportLink systemId={systemId} target="budgetLines" /></div>}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <p>
              <span className={`door-chip${data.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.money.budget.status.${data.status}` as 'door.money.budget.status.DRAFT')}</span>
            </p>
            {(['INCOME', 'SPENDING'] as const).map((kind) => (
              <BudgetSide key={kind} kind={kind} data={data} systemId={systemId} year={year} run={run} />
            ))}
            <p>
              <strong>{t('door.money.net')}</strong> {formatRwf(data.totals.net)}
            </p>
            {data.canApprove && data.status === 'DRAFT' && (
              <button type="button" className="btn" onClick={() => void run(() => setBudgetApproval(systemId, year, true))}>
                {t('door.money.budget.approve')}
              </button>
            )}
            {data.canApprove && data.status === 'APPROVED' && (
              <button type="button" className="btn ghost" onClick={() => void run(() => setBudgetApproval(systemId, year, false))}>
                {t('door.money.budget.reopen')}
              </button>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}

function BudgetSide({ kind, data, systemId, year, run }: { kind: BudgetKind; data: BudgetView; systemId: string; year: number; run: (j: () => Promise<void>) => Promise<void> }) {
  const t = useT();
  const lines = data.lines.filter((l) => l.kind === kind);
  const free = data.categories.filter((c) => !lines.some((l) => l.category === c));
  const [cat, setCat] = useState('');
  const [amount, setAmount] = useState('');
  const sum = kind === 'INCOME' ? data.totals.income : data.totals.spending;
  const save = (category: string, raw: string) => {
    const n = Number(raw.replace(/[\s,]/g, ''));
    if (!Number.isInteger(n) || n < 0) return Promise.resolve();
    return run(() => saveBudgetLine({ systemId, year, kind, category, planned: n }));
  };
  return (
    <div className="panel door-form" style={{ maxWidth: 'none' }}>
      <h3>{t(`door.money.kind.${kind}` as 'door.money.kind.INCOME')}</h3>
      {lines.length === 0 && <p className="muted">{t('door.money.budget.noLines')}</p>}
      {lines.map((l) => (
        <div key={l.id} className="door-row">
          <span className="door-check-label">{t(categoryKey(l.category) as 'door.money.cat.OTHER')}</span>
          {data.canWrite ? (
            <TextField label={t('door.money.col.planned')} name={`b-${kind}-${l.category}`} inputMode="numeric" defaultValue={String(l.planned)} onBlur={(e) => e.target.value !== String(l.planned) && void save(l.category, e.target.value)} />
          ) : (
            <span>{formatRwf(l.planned)}</span>
          )}
        </div>
      ))}
      {data.canWrite && free.length > 0 && (
        <div className="door-row">
          <SelectField label={t('door.money.col.category')} name={`b-new-${kind}`} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {free.map((c) => (
              <option key={c} value={c}>
                {t(categoryKey(c) as 'door.money.cat.OTHER')}
              </option>
            ))}
          </SelectField>
          <TextField label={t('door.money.col.planned')} name={`b-amt-${kind}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button
            type="button"
            className="btn ghost"
            disabled={!cat || !amount}
            onClick={() => {
              void save(cat, amount);
              setCat('');
              setAmount('');
            }}
          >
            {t('door.money.budget.addLine')}
          </button>
        </div>
      )}
      <p>
        <strong>{t('door.money.total')}</strong> {formatRwf(sum)}
      </p>
    </div>
  );
}
