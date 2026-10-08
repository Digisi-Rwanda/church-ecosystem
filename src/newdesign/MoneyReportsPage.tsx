import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchMoneyReport } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { PlanVsActual, YearSelect } from './MoneyBlockParts';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The year in one place: plan against actual, month by month, contributions, donations and the action plan. */
export function MoneyReportsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { loading, failed, data, reload } = useLoad(() => fetchMoneyReport(systemId, year), `mreport|${systemId}|${year}`);
  return (
    <section className="door-block" aria-labelledby="door-mrep-title">
      <div>
        <PageHeader id="door-mrep-title" title={t('door.money.reports')} purpose={t('door.purpose.moneyReports')} />
        <p className="muted">{t('door.money.reports.intro')}</p>
      </div>
      <YearSelect year={year} onChange={setYear} />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <h3>{t('door.money.reports.planActual')}</h3>
            <PlanVsActual view={data} />
            <h3>{t('door.money.reports.months')}</h3>
            <div className="door-table-wrap">
              <table className="door-table door-stack">
                <thead>
                  <tr>
                    <th>{t('door.money.month')}</th>
                    <th>{t('door.money.kind.INCOME')}</th>
                    <th>{t('door.money.kind.SPENDING')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{m.month}</th>
                      <td data-label={t('door.money.kind.INCOME')}>{formatRwf(m.income)}</td>
                      <td data-label={t('door.money.kind.SPENDING')}>{formatRwf(m.spending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{t('door.money.byPlan.title')}</h3>
            <p className="muted">{t('door.money.byPlan.intro')}</p>
            {data.byPlan.length === 0 ? (
              <p className="muted">{t('door.money.byPlan.none')}</p>
            ) : (
              <div className="door-table-wrap">
                <table className="door-table door-stack">
                  <thead>
                    <tr>
                      <th>{t('door.money.byPlan.name')}</th>
                      <th>{t('door.money.col.planned')}</th>
                      <th>{t('door.money.kind.INCOME')}</th>
                      <th>{t('door.money.kind.SPENDING')}</th>
                      <th>{t('door.money.byPlan.waiting')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPlan.map((r) => (
                      <tr key={r.planId}>
                        <th scope="row">{r.title}</th>
                        <td data-label={t('door.money.col.planned')}>{formatRwf(r.planned)}</td>
                        <td data-label={t('door.money.kind.INCOME')}>{formatRwf(r.income)}</td>
                        <td data-label={t('door.money.kind.SPENDING')}>{formatRwf(r.spending)}</td>
                        <td data-label={t('door.money.byPlan.waiting')}>{formatRwf(r.pending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h3>{t('door.money.reports.contributions')}</h3>
            {data.contributions.length === 0 ? (
              <p className="muted">{t('door.money.reports.noContributions')}</p>
            ) : (
              <ul className="door-notices">
                {data.contributions.map((c) => (
                  <li key={c.code} className="panel door-notice">
                    <strong>{c.name}</strong>
                    <p className="muted">
                      {t('door.money.reports.approved')}: {formatRwf(c.approved)} · {t('door.money.reports.inProgress')}: {formatRwf(c.inProgress)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <h3>{t('door.money.donations')}</h3>
            <p>
              {t('door.money.reports.approved')}: {formatRwf(data.donations.approved)} · {t('door.money.reports.waiting')}: {formatRwf(data.donations.waiting)}
            </p>
            <h3>{t('door.money.plan')}</h3>
            <p>{t('door.money.reports.planLine', { items: String(data.plan.items), done: String(data.plan.done), planned: formatRwf(data.plan.planned) })}</p>
          </>
        )}
      </LoadState>
    </section>
  );
}
