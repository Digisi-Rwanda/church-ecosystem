import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchMoneyReport } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { MonthsChart } from './DashViz';
import { PlanVsActual, YearSelect } from './MoneyBlockParts';
import { useLoad } from './useLoad';
import { PageHeader, PrintButton } from './kit';

/** The year in one place: plan against actual, month by month, contributions, donations and the action plan. */
export function MoneyReportsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { loading, failed, data, reload } = useLoad(() => fetchMoneyReport(systemId, year), `mreport|${systemId}|${year}`);
  return (
    <section className="door-block" aria-labelledby="door-mrep-title">
      <div>
        <PageHeader id="door-mrep-title" title={t('door.money.reports')} purpose={t('door.purpose.moneyReports')} actions={<PrintButton />} />
        <p className="muted">{t('door.money.reports.intro')}</p>
      </div>
      <YearSelect year={year} onChange={setYear} />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <div className="rep">
            <section className="rep-card" aria-label={t('door.money.reports.planActual')}>
              <h3 className="rep-title">{t('door.money.reports.planActual')}</h3>
              <PlanVsActual view={data} />
            </section>
            <section className="rep-card" aria-label={t('door.money.reports.months')}>
              <h3 className="rep-title">{t('door.money.reports.months')}</h3>
              <MonthsChart
                kind="bars"
                title={t('door.money.reports.months')}
                format={formatRwf}
                series={[
                  { key: 'in', name: t('door.money.kind.INCOME'), slot: 1, points: data.months.map((m) => ({ label: m.month, value: m.income })) },
                  { key: 'out', name: t('door.money.kind.SPENDING'), slot: 2, points: data.months.map((m) => ({ label: m.month, value: m.spending })) },
                ]}
              />
              <div className="door-table-wrap">
                <table className="pva-table">
                  <thead>
                    <tr>
                      <th>{t('door.money.month')}</th>
                      <th className="num">{t('door.money.kind.INCOME')}</th>
                      <th className="num">{t('door.money.kind.SPENDING')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.month}>
                        <th scope="row">{m.month}</th>
                        <td className={`num${m.income === 0 ? ' zero' : ''}`} data-label={t('door.money.kind.INCOME')}>{formatRwf(m.income)}</td>
                        <td className={`num${m.spending === 0 ? ' zero' : ''}`} data-label={t('door.money.kind.SPENDING')}>{formatRwf(m.spending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rep-card" aria-label={t('door.money.byPlan.title')}>
              <h3 className="rep-title">{t('door.money.byPlan.title')}</h3>
              <p className="muted">{t('door.money.byPlan.intro')}</p>
              {data.byPlan.length === 0 ? (
                <p className="muted">{t('door.money.byPlan.none')}</p>
              ) : (
                <div className="door-table-wrap">
                  <table className="pva-table">
                    <thead>
                      <tr>
                        <th>{t('door.money.byPlan.name')}</th>
                        <th className="num">{t('door.money.col.planned')}</th>
                        <th className="num">{t('door.money.kind.INCOME')}</th>
                        <th className="num">{t('door.money.kind.SPENDING')}</th>
                        <th className="num">{t('door.money.byPlan.waiting')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPlan.map((r) => (
                        <tr key={r.planId}>
                          <th scope="row">{r.title}</th>
                          <td className="num" data-label={t('door.money.col.planned')}>{formatRwf(r.planned)}</td>
                          <td className={`num${r.income === 0 ? ' zero' : ''}`} data-label={t('door.money.kind.INCOME')}>{formatRwf(r.income)}</td>
                          <td className={`num${r.spending === 0 ? ' zero' : ''}`} data-label={t('door.money.kind.SPENDING')}>{formatRwf(r.spending)}</td>
                          <td className={`num${r.pending === 0 ? ' zero' : ' pend'}`} data-label={t('door.money.byPlan.waiting')}>{formatRwf(r.pending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="rep-tiles">
              <section className="rep-card" aria-label={t('door.money.reports.contributions')}>
                <h3 className="rep-title">{t('door.money.reports.contributions')}</h3>
                {data.contributions.length === 0 ? (
                  <p className="muted">{t('door.money.reports.noContributions')}</p>
                ) : (
                  <ul className="rep-list">
                    {data.contributions.map((c) => (
                      <li key={c.code}>
                        <strong>{c.name}</strong>
                        <span className="muted">
                          {t('door.money.reports.approved')}: {formatRwf(c.approved)} · {t('door.money.reports.inProgress')}: {formatRwf(c.inProgress)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rep-card" aria-label={t('door.money.donations')}>
                <h3 className="rep-title">{t('door.money.donations')}</h3>
                <dl className="acct-figs">
                  <div>
                    <dt>{t('door.money.reports.approved')}</dt>
                    <dd className="good rep-big">{formatRwf(data.donations.approved)}</dd>
                  </div>
                  <div>
                    <dt>{t('door.money.reports.waiting')}</dt>
                    <dd className="warn rep-big">{formatRwf(data.donations.waiting)}</dd>
                  </div>
                </dl>
              </section>
              <section className="rep-card" aria-label={t('door.money.plan')}>
                <h3 className="rep-title">{t('door.money.plan')}</h3>
                <p>{t('door.money.reports.planLine', { items: String(data.plan.items), done: String(data.plan.done), planned: formatRwf(data.plan.planned) })}</p>
              </section>
            </div>
          </div>
        )}
      </LoadState>
    </section>
  );
}
