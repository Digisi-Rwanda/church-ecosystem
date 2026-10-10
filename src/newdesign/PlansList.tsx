import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPlanOptions, fetchPlans, type PlanItem, type PlanType, type WorkPlanStatus } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { PlanForm } from './PlanForm';
import { EventStart } from './PlanScreens';
import { PLAN_STEPS, planStatusKey, sortPlans } from './plans';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, RowList, Segmented, SidePanel, StatusChip } from './kit';
import { Link } from 'react-router-dom';
import { monthKeyOf } from './plans';

type Layout = 'list' | 'board' | 'calendar';
const tone = (s: WorkPlanStatus) => (s === 'PENDING_APPROVAL' || s === 'CLOSING' ? 'warn' : s === 'RUNNING' ? 'info' : s === 'ENDED' ? 'success' : s === 'CANCELLED' ? 'danger' : 'neutral');

/** Full work in one system: plans that are approved, run, closed and reported. */
export function PlansList({ systemId, planType, creating, onCloseCreate }: { systemId: string; planType?: PlanType; creating: boolean; onCloseCreate: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState<'mine' | 'all'>('all');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [layout, setLayout] = useState<Layout>('list');
  const list = useLoad(() => fetchPlans({ systemId, view, status: show, type: planType }), `plans|${systemId}|${view}|${show}|${planType ?? ''}`);
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const items = sortPlans(list.data ?? []);
  const waiting = items.filter((p) => p.canApprove);
  const to = (p: PlanItem) => `/s/${systemId}/work/plans/${p.id}`;
  const row = (p: PlanItem) => (
    <ListRow
      key={p.id}
      avatarName={p.leaderName}
      title={p.title}
      detail={`${p.leaderName} · ${p.unitName}${p.waitingLevel ? ` · ${t('door.plan.waiting', { level: p.waitingLevel })}` : ''}`}
      status={<StatusChip tone={tone(p.status)}>{t(planStatusKey(p.status, p.planType))}</StatusChip>}
      to={to(p)}
    />
  );
  const months = new Map<string, PlanItem[]>();
  for (const p of items) {
    const k = monthKeyOf(p.startsOn);
    months.set(k, [...(months.get(k) ?? []), p]);
  }
  const monthName = (k: string) => (k === 'none' ? t('door.plan.calendar.undated') : new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${k}-01T00:00:00Z`)));
  return (
    <>
      <div className="view-bar">
        <div className="door-filters">
          <SelectField label={t('door.work.view')} name="pl-view" value={view} onChange={(e) => setView(e.target.value as 'mine' | 'all')}>
            <option value="all">{t('door.work.view.all')}</option>
            <option value="mine">{t('door.plan.view.mine')}</option>
          </SelectField>
          <SelectField label={t('door.work.show')} name="pl-show" value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}>
            <option value="open">{t('door.work.show.open')}</option>
            <option value="all">{t('door.work.show.all')}</option>
          </SelectField>
        </div>
        <Segmented
          label={t('door.work.layout')}
          value={layout}
          onChange={setLayout}
          items={[
            { key: 'list', label: t('door.work.layout.list') },
            { key: 'board', label: t('door.work.layout.board') },
            { key: 'calendar', label: t('door.plan.layout.calendar') },
          ]}
        />
      </div>
      <SidePanel open={creating && !!options.data} title={planType ? t(`door.plan.new.${planType}` as 'door.plan.new.PROGRAM') : t('door.plan.new')} purpose={t('door.plan.form.purpose')} onClose={onCloseCreate}>
        {options.data && (
          <div className="side-form">
            {planType === 'EVENT' ? (
              <EventStart options={options.data} systemId={systemId} onDone={(p) => navigate(`/s/${systemId}/work/plans/${p.id}`)} onCancel={onCloseCreate} />
            ) : (
              <PlanForm options={options.data} systemId={systemId} planType={planType} onDone={(p) => navigate(`/s/${systemId}/work/plans/${p.id}`)} onCancel={onCloseCreate} />
            )}
          </div>
        )}
      </SidePanel>
      {waiting.length > 0 && (
        <div className="waiting-strip">
          <h3>{t('door.plan.waitingForYou', { count: waiting.length })}</h3>
          <RowList label={t('door.plan.waitingForYou', { count: waiting.length })}>{waiting.map(row)}</RowList>
        </div>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.plan.none')} detail={t('door.plan.noneDetail')} />
        ) : layout === 'board' ? (
          <div className="board">
            {[...PLAN_STEPS.slice(0, 4), ...(items.some((p) => p.status === 'PAUSED') ? (['PAUSED'] as const) : []), ...PLAN_STEPS.slice(4)].filter((s) => show === 'all' || s !== 'ENDED').map((st) => {
              const col = items.filter((p) => p.status === st);
              return (
                <div key={st} className="board-col" role="group" aria-label={t(planStatusKey(st))}>
                  <h3>
                    {t(planStatusKey(st))} <span>{col.length}</span>
                  </h3>
                  {col.map((p) => (
                    <Link key={p.id} to={to(p)} className="board-card">
                      <strong>{p.title}</strong>
                      <span className="muted">{p.leaderName}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ) : layout === 'calendar' ? (
          <>
            {[...months.entries()].sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b))).map(([k, ps]) => (
              <div key={k} className="waiting-strip">
                <h3>{monthName(k)}</h3>
                <RowList label={monthName(k)}>{ps.map(row)}</RowList>
              </div>
            ))}
          </>
        ) : (
          <RowList label={t('door.work.layout.list')}>{items.map(row)}</RowList>
        )}
      </LoadState>
    </>
  );
}
