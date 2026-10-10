import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { decideBudget, fetchBudget, fetchChurchBudget, saveBudgetLine, setBudgetApproval, submitBudget, type BudgetKind, type BudgetView, type FundingRowView } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useFormat, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { categoryKey, formatRwf, moneyErrorKey } from './money';
import { fundingLabel } from './ActivityForm';
import { YearSelect } from './MoneyBlockParts';
import { SystemLink } from './SystemLink';
import { useLoad } from './useLoad';
import { SegBar } from './DashViz';
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
            <BudgetHero data={data} />
            <div className="pva-grid bud-grid">
              {(['INCOME', 'SPENDING'] as const).map((kind) => (
                <BudgetSide key={kind} kind={kind} data={data} systemId={systemId} year={year} run={run} />
              ))}
            </div>
            <FundingPanel rows={data.funding} total={data.totals.spending} />
            {data.unlinked.count > 0 && (
              <p className="door-error" role="status">
                {t('door.money.budget.unlinked', { count: data.unlinked.count, amount: formatRwf(data.unlinked.amount) })}{' '}
                <SystemLink from={systemId} to={`/s/${systemId}/money/plan`}>{t('door.money.plan')}</SystemLink>
              </p>
            )}
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
            <SendToChurchLeader data={data} send={() => run(() => submitBudget(systemId, year))} reopen={() => run(() => setBudgetApproval(systemId, year, false))} />
            {data.isCentral && <ChurchBudgets year={year} refreshKey={`${data.submission?.submittedAt ?? ''}${data.status}`} />}
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
    <section className={`pva-card bud-card ${kind === 'INCOME' ? 'in' : 'out'}`} aria-label={t(`door.money.kind.${kind}` as 'door.money.kind.INCOME')}>
      <header className="pva-head">
        <h3>{t(`door.money.kind.${kind}` as 'door.money.kind.INCOME')}</h3>
        <span className="pva-total">{formatRwf(sum)}</span>
      </header>
      {lines.length === 0 && <p className="muted">{t('door.money.budget.noLines')}</p>}
      {lines.map((l) => {
        const over = kind === 'SPENDING' && l.setAside > 0 && l.committed > l.setAside;
        return (
          <div key={l.id} className="bud-line">
            <div className="bud-line-top">
              <span className="bud-cat">{t(categoryKey(l.category) as 'door.money.cat.OTHER')}</span>
              <strong className="bud-amt">{formatRwf(l.planned)}</strong>
            </div>
            <LayerBar planned={l.planned} done={l.actual} promised={kind === 'SPENDING' ? l.committed : 0} bad={over} label={t('door.money.col.progress')} />
            <p className="bud-legend">
              <span className="k done">{t('door.money.col.actual')} {formatRwf(l.actual)}</span>
              {kind === 'SPENDING' && <span className="k promised">{t('door.money.col.committed')} {formatRwf(l.committed)}</span>}
              {kind === 'SPENDING' && <span className="k left">{t('door.money.col.left')} {formatRwf(Math.max(0, l.planned - l.committed))}</span>}
              {l.derived && <span className="door-chip">{t('door.money.budget.fromActivities')}</span>}
              {over && <span className="door-chip warn">{t('door.money.budget.over', { amount: formatRwf(l.committed - l.setAside) })}</span>}
            </p>
            {data.canWrite && !l.derived && (
              <TextField label={kind === 'SPENDING' ? t('door.money.budget.setAside') : t('door.money.col.planned')} name={`b-${kind}-${l.category}`} inputMode="numeric" defaultValue={String(kind === 'SPENDING' ? l.setAside : l.planned)} onBlur={(e) => e.target.value !== String(kind === 'SPENDING' ? l.setAside : l.planned) && void save(l.category, e.target.value)} />
            )}
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
                        {a.dueMonth ? ` · ${a.dueMonth}` : ''} · {t(`door.money.plan.status.${a.status}` as 'door.money.plan.status.PLANNED')} · {fundingLabel(t, a.fundingKind, a.fundingCode, a.fundingNote)}
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
    </section>
  );
}

/** What the planned spending will be paid from, by source, worked out from the activities. */
function FundingPanel({ rows, total }: { rows: FundingRowView[]; total: number }) {
  const t = useT();
  if (rows.length === 0) return null;
  const name = (r: FundingRowView) => (r.kind === 'NONE' ? t('door.money.activity.fundingNone') : fundingLabel(t, r.kind, r.name ?? r.code));
  const parts = rows.slice(0, 8).map((r, i) => ({ slot: i + 1, value: r.planned, name: name(r) }));
  return (
    <section className="rep-card" aria-label={t('door.money.budget.fundingTitle')}>
      <h3 className="rep-title">{t('door.money.budget.fundingTitle')}</h3>
      <p className="muted">{t('door.money.budget.fundingHint')}</p>
      <SegBar parts={parts} total={total} label={t('door.money.budget.fundingTitle')} />
      <ul className="bud-fund">
        {rows.map((r, i) => (
          <li key={`${r.kind}|${r.code ?? ''}`}>
            <span className={`dx-swatch dx-s${Math.min(i + 1, 8)}`} aria-hidden="true" />
            <span className="bud-fund-name">{name(r)}</span>
            <span className="muted">{t('door.money.budget.fundingCount', { count: r.count })}</span>
            <strong>{formatRwf(r.planned)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The year at a glance: money in, money out and what is left, how far spending reaches into income, and the status. */
function BudgetHero({ data }: { data: BudgetView }) {
  const t = useT();
  const { income, spending, net } = data.totals;
  const cover = income > 0 ? Math.round((spending / income) * 100) : spending > 0 ? 100 : 0;
  return (
    <div className="bud-hero">
      <div className="bud-hero-main">
        <div>
          <span className="pva-net-label">{t('door.money.kind.INCOME')}</span>
          <strong>{formatRwf(income)}</strong>
        </div>
        <div>
          <span className="pva-net-label">{t('door.money.kind.SPENDING')}</span>
          <strong>{formatRwf(spending)}</strong>
        </div>
        <div>
          <span className="pva-net-label">{t('door.money.net')}</span>
          <strong className={net < 0 ? 'bad' : 'good'}>{`${net > 0 ? '+' : net < 0 ? '−' : ''}${formatRwf(Math.abs(net))}`}</strong>
        </div>
        <span className={`door-chip${data.status !== 'APPROVED' ? ' warn' : ''}`}>{t(`door.money.budget.status.${data.status}` as 'door.money.budget.status.DRAFT')}</span>
      </div>
      <div className="bud-cover">
        <svg viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label={`${t('door.money.kind.SPENDING')} / ${t('door.money.kind.INCOME')}: ${cover}%`}>
          <rect className="pva-track" x="0" y="0" width="100" height="6" rx="3" />
          <rect className={cover > 100 ? 'bud-over' : 'pva-fill'} x="0" y="0" width={Math.min(100, cover)} height="6" rx="3" />
        </svg>
        <span className="muted">{t('door.money.budget.cover', { percent: String(cover) })}</span>
      </div>
    </div>
  );
}

/** Planned amount as the full line; what is done (solid) and what is promised by activities (lighter) fill it. */
function LayerBar({ planned, done, promised, bad, label }: { planned: number; done: number; promised: number; bad: boolean; label: string }) {
  const pct = (n: number) => (planned > 0 ? Math.max(0, Math.min(100, (n / planned) * 100)) : 0);
  return (
    <svg className="pva-line bud-layer" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={`${label}: ${Math.round(pct(done))}%`}>
      <rect className="pva-track" x="0" y="0" width="100" height="4" rx="2" />
      {promised > 0 && <rect className={bad ? 'bud-over soft' : 'bud-promised'} x="0" y="0" width={pct(promised)} height="4" rx="2" />}
      {done > 0 && <rect className="pva-fill" x="0" y="0" width={pct(done)} height="4" rx="2" />}
    </svg>
  );
}

/** The President sends the planned budget to the Church Leader, who approves it or returns it with a reason. */
function SendToChurchLeader({ data, send, reopen }: { data: BudgetView; send: () => Promise<void>; reopen: () => Promise<void> }) {
  const t = useT();
  const f = useFormat();
  if (data.isCentral) return null;
  const sub = data.submission;
  return (
    <section className="rep-card" aria-label={t('door.money.budget.leaderTitle')}>
      <h3 className="rep-title">{t('door.money.budget.leaderTitle')}</h3>
      <p className="muted">{t('door.money.budget.leaderHint')}</p>
      <p>{t('door.money.budget.sends', { total: formatRwf(data.totals.spending), lines: data.lines.length, activities: data.activitiesCount })}</p>
      {data.status === 'DRAFT' && sub?.status === 'RETURNED' && (
        <p className="door-error" role="status">{t('door.money.budget.returned', { name: sub.decidedByName ?? '', note: sub.decisionNote ?? '' })}</p>
      )}
      {data.status === 'DRAFT' && !sub && <p className="muted">{t('door.money.budget.notSent')}</p>}
      {data.status === 'SUBMITTED' && sub && <p role="status">{t('door.money.budget.waiting', { date: f.date(sub.submittedAt ?? ''), name: sub.submittedByName })}</p>}
      {data.status === 'APPROVED' && sub && <p role="status">{t('door.money.budget.approvedBy', { name: sub.decidedByName ?? '', date: f.date(sub.decidedAt ?? '') })}</p>}
      {data.canSubmit && (
        <button type="button" className="btn" onClick={() => void send()}>
          {t('door.money.budget.sendLeader')}
        </button>
      )}
      {data.canWithdraw && (
        <button type="button" className="btn ghost" onClick={() => void reopen()}>
          {data.status === 'SUBMITTED' ? t('door.money.budget.withdraw') : t('door.money.budget.reopen')}
        </button>
      )}
    </section>
  );
}

/** Central only: the overall budget, then each unit (Central Administration first) opening up to its lines and their activities. */
function ChurchBudgets({ year, refreshKey }: { year: number; refreshKey: string }) {
  const t = useT();
  const f = useFormat();
  const { loading, failed, data, reload } = useLoad(() => fetchChurchBudget(year), `church-budget|${year}|${refreshKey}`);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const decide = async (systemId: string, approve: boolean) => {
    setErr('');
    try {
      await decideBudget(systemId, year, approve, reason[systemId]);
      reload();
    } catch (e) {
      setErr(t(moneyErrorKey(errorCode(e)) as 'door.people.actionFailed'));
    }
  };
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
                {!x.own && ` · ${t(`door.money.budget.dec.${x.status}` as 'door.money.budget.dec.SUBMITTED')}`}
              </summary>
              {x.status === 'RETURNED' && x.decisionNote && <p className="muted">{t('door.money.budget.returned', { name: x.decidedByName ?? '', note: x.decisionNote })}</p>}
              {x.canDecide && (
                <div className="door-row">
                  <button type="button" className="btn" onClick={() => void decide(x.systemId, true)}>{t('door.money.budget.leaderApprove')}</button>
                  <TextField label={t('door.money.budget.leaderReason')} name={`b-reason-${x.systemId}`} value={reason[x.systemId] ?? ''} onChange={(e) => setReason({ ...reason, [x.systemId]: e.target.value })} />
                  <button type="button" className="btn ghost" disabled={!(reason[x.systemId] ?? '').trim()} onClick={() => void decide(x.systemId, false)}>{t('door.money.budget.leaderReturn')}</button>
                </div>
              )}
              {x.funding.length > 0 && (
                <p className="muted">{t('door.money.budget.fundingTitle')}: {x.funding.map((r) => `${r.kind === 'NONE' ? t('door.money.activity.fundingNone') : fundingLabel(t, r.kind, r.code)} ${formatRwf(r.planned)}`).join(' · ')}</p>
              )}
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
                                  {a.dueMonth ? ` · ${a.dueMonth}` : ''}{a.planTitle ? ` · ${a.planTitle}` : ''} · {fundingLabel(t, a.fundingKind, a.fundingCode)}
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
      {err && <p className="door-error" role="alert">{err}</p>}
      {data.missing.length > 0 && <p className="muted">{t('door.money.budget.church.missing', { names: data.missing.map((m) => m.name).join(', ') })}</p>}
    </div>
  );
}
