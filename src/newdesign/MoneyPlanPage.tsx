import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { changeMoneyPlanItem, fetchMoneyPlan, type MoneyPlanItemView } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { ActivityForm, fundingLabel } from './ActivityForm';
import { categoryKey, formatRwf, moneyErrorKey } from './money';
import { YearSelect } from './MoneyBlockParts';
import { useLoad } from './useLoad';
import { ActivitiesView } from './ActivitiesPage';
import { PageHeader, Tabs } from './kit';

/** The money action plan: what the unit plans to do this year and what it should cost. */
export function MoneyPlanPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { loading, failed, data, reload } = useLoad(() => fetchMoneyPlan(systemId, year), `mplan|${systemId}|${year}`);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'activities' | 'lines'>('activities');
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
          {i.category ? ` · ${t(categoryKey(i.category) as 'door.money.cat.OTHER')}` : ` · ${t('door.money.plan.notTied')}`}
          {i.planTitle && ` · ${i.planTitle}`}
        </p>
        <p className="muted">{t('door.money.activity.paidFrom')}: {fundingLabel(t, i.fundingKind || null, i.fundingCode ? data?.fundingTypes.find((x) => x.code === i.fundingCode)?.name ?? i.fundingCode : null, i.fundingNote)}</p>
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
        <PageHeader
          id="door-mplan-title"
          title={t('door.money.plan')}
          purpose={t('door.purpose.moneyPlan')}
          actions={
            <>
              <Link className="btn ghost" to={`/s/${systemId}/money/plan/new/project`}>{t('door.ap.project.title')}</Link>
              <Link className="btn ghost" to={`/s/${systemId}/money/plan/new/program`}>{t('door.ap.program.title')}</Link>
            </>
          }
          primary={<Link className="btn" to={`/s/${systemId}/money/plan/new/event`}>{t('door.ap.event.title')}</Link>}
        />
        <p className="muted">{t('door.money.plan.intro')}</p>
      </div>
      <Tabs label={t('door.money.plan')} value={tab} onChange={setTab} items={[{ key: 'activities', label: t('door.ap.activities') }, { key: 'lines', label: t('door.ap.lines') }]} />
      {tab === 'activities' && <ActivitiesView systemId={systemId} />}
      {tab === 'lines' && (
        <>
      <YearSelect year={year} onChange={setYear} />
      {data?.canWrite && <div className="door-row"><ImportLink systemId={systemId} target="planItems" /></div>}
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
            {data.canWrite && <ActivityForm systemId={systemId} year={year} view={data} onSaved={reload} />}
            {data.items.length === 0 ? <EmptyState title={t('door.money.plan.none')} /> : <ul className="door-notices">{data.items.map(row)}</ul>}
          </>
        )}
      </LoadState>
        </>
      )}
    </section>
  );
}
