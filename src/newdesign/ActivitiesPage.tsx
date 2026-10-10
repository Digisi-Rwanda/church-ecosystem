import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchMoneyPlan, fetchPlanOptions, fetchPlans, type MoneyPlanItemView, type PlanItem, type PlanType } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { categoryKey, formatRwf } from './money';
import { PlanForm } from './PlanForm';
import { EventStart } from './PlanScreens';
import { planStatusKey } from './plans';
import { useLoad } from './useLoad';
import { PageHeader, PrintButton, Segmented, SidePanel, StatusChip } from './kit';

type Filter = 'ALL' | PlanType;
const yearOf = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 2 * 3600 * 1000).getUTCFullYear() : null);

/** Every event, project and program of the system on one page: when it happens and what its budget lines are. */
export function ActivitiesPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<PlanType | null>(null);
  const money = lettersFor(capabilities, systemId, 'money').length > 0;
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const list = useLoad(async () => {
    const plans = await fetchPlans({ systemId, view: 'all', status: 'all' });
    const years = [...new Set([new Date().getUTCFullYear(), ...plans.map((p) => yearOf(p.startsOn)).filter((y): y is number => y !== null)])].slice(0, 4);
    const lines = money ? (await Promise.all(years.map((y) => fetchMoneyPlan(systemId, y).catch(() => null)))).flatMap((v) => v?.items ?? []) : [];
    return { plans, lines };
  }, `activities|${systemId}|${money}`);
  const canCreate = !!options.data && options.data.units.some((u) => u.systemId === systemId);
  if (lettersFor(capabilities, systemId, 'work').length === 0) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso));
  const when = (p: PlanItem) =>
    p.startsOn ? (p.endsOn && p.endsOn !== p.startsOn ? `${day(p.startsOn)} – ${day(p.endsOn)}` : day(p.startsOn)) : p.status === 'RUNNING' ? t('door.activities.ongoing') : t('door.activities.undated');
  const items = (list.data?.plans ?? []).filter((p) => filter === 'ALL' || p.planType === filter);
  const linesOf = (p: PlanItem): MoneyPlanItemView[] => (list.data?.lines ?? []).filter((l) => l.planId === p.id && l.status !== 'DROPPED');
  return (
    <section className="door-block" aria-labelledby="door-activities-title">
      <PageHeader
        id="door-activities-title"
        title={t('door.activities.title')}
        primary={canCreate ? <button type="button" className="btn" onClick={() => setCreating(true)}>{t('door.activities.new')}</button> : undefined}
        actions={<PrintButton />}
      />
      <Segmented<Filter>
        label={t('door.activities.filter')}
        value={filter}
        onChange={setFilter}
        items={[{ key: 'ALL', label: t('door.activities.all') }, { key: 'EVENT', label: t('door.plans.EVENT') }, { key: 'PROJECT', label: t('door.plans.PROJECT') }, { key: 'PROGRAM', label: t('door.plans.PROGRAM') }]}
      />
      <SidePanel open={creating && !!options.data} title={t('door.activities.new')} purpose={t('door.plan.form.purpose')} onClose={() => { setCreating(false); setKind(null); }}>
        {options.data && (
          <div className="side-form">
            {kind === null ? (
              <div className="door-row">
                {(['EVENT', 'PROJECT', 'PROGRAM'] as PlanType[]).map((k) => (<button key={k} type="button" className="btn" onClick={() => setKind(k)}>{t(`door.plan.type.${k}` as 'door.plan.type.EVENT')}</button>))}
              </div>
            ) : kind === 'EVENT' ? (
              <EventStart options={options.data} systemId={systemId} onDone={(p) => navigate(`/s/${systemId}/work/plans/${p.id}`)} onCancel={() => { setCreating(false); setKind(null); }} />
            ) : (
              <PlanForm options={options.data} systemId={systemId} planType={kind} onDone={(p) => navigate(`/s/${systemId}/work/plans/${p.id}`)} onCancel={() => { setCreating(false); setKind(null); }} />
            )}
          </div>
        )}
      </SidePanel>
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.plan.none')} detail={t('door.plan.noneDetail')} />
        ) : (
          <ul className="act-list">
            {items.map((p) => {
              const lines = linesOf(p);
              const total = lines.reduce((n, l) => n + l.amount, 0);
              return (
                <li key={p.id} className="panel act-card">
                  <div className="act-head">
                    <div>
                      <Link className="act-title" to={`/s/${systemId}/work/plans/${p.id}`}>{p.title}</Link>
                      <p className="muted">{[t(`door.plan.type.${p.planType}` as 'door.plan.type.EVENT'), p.leaderName, p.unitName].join(' · ')}</p>
                    </div>
                    <StatusChip tone={p.status === 'RUNNING' ? 'info' : p.status === 'ENDED' ? 'success' : p.status === 'CANCELLED' ? 'danger' : p.status === 'PENDING_APPROVAL' || p.status === 'PAUSED' || p.status === 'CLOSING' ? 'warn' : 'neutral'}>{t(planStatusKey(p.status, p.planType))}</StatusChip>
                  </div>
                  <p className="act-when">{when(p)}</p>
                  {money && (
                    <div className="act-budget">
                      {lines.length === 0 ? <span className="muted">{t('door.activities.noBudget')}</span> : (
                        <>
                          <ul className="door-chips">
                            {lines.map((l) => (<li key={l.id}><span className="door-chip">{l.title} · {formatRwf(l.amount)} · {t(categoryKey(l.category) as 'door.money.cat.OTHER')}</span></li>))}
                          </ul>
                          <strong>{t('door.plan.budget.total')} {formatRwf(total)}</strong>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
