import { Link } from 'react-router-dom';
import { fetchMoneyPlan } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { ActivityForm, fundingLabel } from './ActivityForm';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';
import { categoryKey, formatRwf } from './money';
import { useLoad } from './useLoad';

/** The budget line items written for one program, project or event, with the form to add one. Shown only to people who may read the system's money. */
export function PlanBudget({ systemId, planId, startsOn, onSaved }: { systemId: string; planId: string; startsOn: string | null; onSaved?: () => void }) {
  const t = useT();
  const year = startsOn ? new Date(new Date(startsOn).getTime() + 2 * 3600 * 1000).getUTCFullYear() : new Date().getUTCFullYear();
  const { capabilities } = useFrontDoor();
  const allowed = lettersFor(capabilities, systemId, 'money').length > 0;
  const budget = useLoad(() => (allowed ? fetchMoneyPlan(systemId, year) : Promise.reject(new Error('no'))), `plan-budget|${systemId}|${year}|${allowed}`);
  if (!allowed) return null;
  const mine = (budget.data?.items ?? []).filter((i) => i.planId === planId);
  const budgetTotal = mine.filter((i) => i.status !== 'DROPPED').reduce((n, i) => n + i.amount, 0);
  return (
  <div className="panel">
    <h3>{t('door.plan.budget.title')}</h3>
    <p className="muted">{t('door.plan.budget.hint', { year })}</p>
    {mine.length === 0 ? (
      <p className="muted">{t('door.plan.budget.none')}</p>
    ) : (
      <>
        <ul className="door-list">
          {mine.map((i) => (
            <li key={i.id}>
              <strong>{i.title}</strong> · {formatRwf(i.amount)} · {t(categoryKey(i.category) as 'door.money.cat.OTHER')} · {t('door.money.activity.paidFrom')}:{' '}
              {fundingLabel(t, i.fundingKind || null, i.fundingCode ? budget.data?.fundingTypes.find((x) => x.code === i.fundingCode)?.name ?? i.fundingCode : null, i.fundingNote)}
              {i.status === 'DROPPED' ? ` · ${t('door.money.plan.status.DROPPED')}` : ''}
            </li>
          ))}
        </ul>
        <p><strong>{t('door.plan.budget.total')}</strong> {formatRwf(budgetTotal)}</p>
      </>
    )}
    {budget.data?.canWrite && <ActivityForm systemId={systemId} year={year} view={budget.data} fixedPlanId={planId} onSaved={() => { budget.reload(); onSaved?.(); }} />}
    {budget.data && !budget.data.canWrite && <p className="muted">{t('door.plan.budget.readOnly')}</p>}
    <Link className="btn ghost sm" to={`/s/${systemId}/money/budget`}>
      {t('door.plan.budget.open')}
    </Link>
  </div>
  );
}
