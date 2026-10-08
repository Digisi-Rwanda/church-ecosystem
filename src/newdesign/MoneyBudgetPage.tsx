import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchBudget, fetchChurchBudget, saveBudgetLine, setBudgetApproval, submitBudget, type BudgetKind, type BudgetView } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useFormat, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { categoryKey, formatRwf, moneyErrorKey } from './money';
import { YearSelect } from './MoneyBlockParts';
import { SystemLink } from './SystemLink';
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
            <div className="door-budget-total">
              <strong>{t('door.money.budget.total')}</strong>
              <span>{t('door.money.kind.INCOME')}: {formatRwf(data.totals.income)}</span>
              <span>{t('door.money.kind.SPENDING')}: {formatRwf(data.totals.spending)}</span>
              <span>{t('door.money.net')}: {formatRwf(data.totals.net)}</span>
            </div>
            <p>
              <span className={`door-chip${data.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.money.budget.status.${data.status}` as 'door.money.budget.status.DRAFT')}</span>
            </p>
            {(['INCOME', 'SPENDING'] as const).map((kind) => (
              <BudgetSide key={kind} kind={kind} data={data} systemId={systemId} year={year} run={run} />
            ))}
            {data.unlinked.count > 0 && (
              <p className="door-error" role="status">
                {t('door.money.budget.unlinked', { count: data.unlinked.count, amount: formatRwf(data.unlinked.amount) })}{' '}
                <SystemLink from={systemId} to={`/s/${systemId}/money/plan`}>{t('door.money.plan')}</SystemLink>
              </p>
            )}
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
            <SendToCentral data={data} run={() => run(() => submitBudget(systemId, year))} />
            {data.isCentral && <ChurchBudgets year={year} refreshKey={data.submission?.submittedAt ?? ''} />}
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
      {lines.map((l) => {
        const over = kind === 'SPENDING' && l.committed > l.planned;
        const used = l.planned > 0 ? Math.min(100, Math.round(((kind === 'SPENDING' ? l.committed : l.actual) / l.planned) * 100)) : 0;
        return (
          <div key={l.id} className="door-budget-line">
            <div className="door-row">
              <span className="door-check-label">{t(categoryKey(l.category) as 'door.money.cat.OTHER')}</span>
              {data.canWrite ? (
                <TextField label={t('door.money.col.planned')} name={`b-${kind}-${l.category}`} inputMode="numeric" defaultValue={String(l.planned)} onBlur={(e) => e.target.value !== String(l.planned) && void save(l.category, e.target.value)} />
              ) : (
                <span>{formatRwf(l.planned)}</span>
              )}
              {over && <span className="door-chip warn">{t('door.money.budget.over', { amount: formatRwf(l.committed - l.planned) })}</span>}
            </div>
            <progress className="door-progress" max={100} value={used} aria-label={t('door.money.col.progress')} />
            <p className="muted">
              {kind === 'SPENDING' && <>{t('door.money.col.committed')}: {formatRwf(l.committed)} · {t('door.money.col.left')}: {formatRwf(Math.max(0, l.planned - l.committed))} · </>}
              {t('door.money.col.actual')}: {formatRwf(l.actual)}
            </p>
            {kind === 'SPENDING' && (
              <details>
                <summary>{t('door.money.budget.activities')} ({l.activities.length})</summary>
                {l.activities.length === 0 ? (
                  <p className="muted">{t('door.money.budget.noActivities')}</p>
                ) : (
                  <ul>
                    {l.activities.map((a) => (
                      <li key={a.id}>
                        {a.title} · {formatRwf(a.amount)}
                        {a.dueMonth ? ` · ${a.dueMonth}` : ''} · {t(`door.money.plan.status.${a.status}` as 'door.money.plan.status.PLANNED')}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </div>
        );
      })}
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

/** Sending the approved budget to Central as a report: nothing is approved there. */
function SendToCentral({ data, run }: { data: BudgetView; run: () => Promise<void> }) {
  const t = useT();
  const f = useFormat();
  if (data.isCentral) return null;
  return (
    <div className="panel door-form" style={{ maxWidth: 'none' }}>
      <h3>{t('door.money.budget.submit')}</h3>
      <p className="muted">{t('door.money.budget.submitHint')}</p>
      <p>{t('door.money.budget.sends', { total: formatRwf(data.totals.spending), lines: data.lines.length, activities: data.lines.reduce((n, l) => n + l.activities.length, 0) })}</p>
      <p>
        {data.submission?.submittedAt
          ? t('door.money.budget.submitted', { date: f.date(data.submission.submittedAt), name: data.submission.submittedByName })
          : t('door.money.budget.notSent')}
      </p>
      {data.status !== 'APPROVED' && <p className="muted">{t('door.money.budget.approveFirst')}</p>}
      {data.canSubmit && (
        <button type="button" className="btn" onClick={() => void run()}>
          {data.submission ? t('door.money.budget.submitAgain') : t('door.money.budget.submit')}
        </button>
      )}
    </div>
  );
}

/** Central only: the overall budget, then each unit (Central Administration first) opening up to its lines and their activities. */
function ChurchBudgets({ year, refreshKey }: { year: number; refreshKey: string }) {
  const t = useT();
  const f = useFormat();
  const { loading, failed, data } = useLoad(() => fetchChurchBudget(year), `church-budget|${year}|${refreshKey}`);
  if (loading || failed || !data) return null;
  const T = data.totals;
  return (
    <div className="panel door-form" style={{ maxWidth: 'none' }}>
      <h3>{t('door.money.budget.church.title')}</h3>
      <p className="muted">{t('door.money.budget.church.intro')}</p>
      {data.systems.length === 0 ? (
        <p className="muted">{t('door.money.budget.church.none')}</p>
      ) : (
        <>
          <div className="door-budget-total">
            <strong>{t('door.money.budget.church.total')}</strong>
            <span>{t('door.money.kind.INCOME')}: {formatRwf(T.incomePlanned)} ({t('door.money.col.actual')} {formatRwf(T.incomeActual)})</span>
            <span>{t('door.money.kind.SPENDING')}: {formatRwf(T.spendingPlanned)} · {t('door.money.col.committed')} {formatRwf(T.spendingCommitted)} · {t('door.money.col.actual')} {formatRwf(T.spendingActual)}</span>
            <span>{t('door.money.net')}: {formatRwf(T.incomePlanned - T.spendingPlanned)}</span>
          </div>
          {data.systems.map((x) => (
            <details key={x.systemId} className="door-unit-budget">
              <summary>
                <strong>{x.own ? t('door.money.budget.church.own', { name: x.name }) : x.name}</strong>
                {' · '}{t('door.money.kind.INCOME')} {formatRwf(x.totals.incomePlanned)} · {t('door.money.kind.SPENDING')} {formatRwf(x.totals.spendingPlanned)} · {t('door.money.net')} {formatRwf(x.totals.incomePlanned - x.totals.spendingPlanned)}
                {x.submittedAt ? ` · ${t('door.money.budget.church.sentOn', { date: f.date(x.submittedAt) })}` : ''}
              </summary>
              {(['INCOME', 'SPENDING'] as const).map((kind) => {
                const lines = x.lines.filter((l) => l.kind === kind);
                if (lines.length === 0) return null;
                return (
                  <div key={kind}>
                    <h4>{t(`door.money.kind.${kind}` as 'door.money.kind.INCOME')}</h4>
                    {lines.map((l) => {
                      const acts = kind === 'SPENDING' ? x.activities.filter((a) => a.category === l.category) : [];
                      return (
                        <div key={l.category} className="door-budget-line">
                          <p>
                            <strong>{t(categoryKey(l.category) as 'door.money.cat.OTHER')}</strong> · {t('door.money.col.planned')} {formatRwf(l.planned)}
                            {kind === 'SPENDING' ? ` · ${t('door.money.col.committed')} ${formatRwf(l.committed)}` : ''} · {t('door.money.col.actual')} {formatRwf(l.actual)}
                          </p>
                          {acts.length > 0 && (
                            <ul>
                              {acts.map((a, i) => (
                                <li key={i}>
                                  {a.title} · {formatRwf(a.amount)}
                                  {a.dueMonth ? ` · ${a.dueMonth}` : ''}{a.planTitle ? ` · ${a.planTitle}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </details>
          ))}
        </>
      )}
      {data.missing.length > 0 && <p className="muted">{t('door.money.budget.church.missing', { names: data.missing.map((m) => m.name).join(', ') })}</p>}
    </div>
  );
}
