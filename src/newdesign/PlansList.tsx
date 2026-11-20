import { levelKeyOf } from './planLevels';
import { useState } from 'react';
import { fetchPlanTable, type BoardItem, type PlanType } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { PLAN_STEPS, planStatusKey, planTone, sortPlans } from './plans';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, RowList, SearchBox, Segmented, StatusChip, matchesText } from './kit';
import { Link } from 'react-router-dom';
import { monthKeyOf } from './plans';
import { PlansTable } from './PlansTable';

type Layout = 'table' | 'list' | 'board' | 'calendar';
type PlanItem = BoardItem;

/** Full work in one system: plans that are approved, run, closed and reported. */
export function PlansList({ systemId, planType }: { systemId: string; planType?: PlanType }) {
  const t = useT();
  const { locale } = useI18n();
  const [show, setShow] = useState<'open' | 'all' | 'mine'>('open');
  const [layout, setLayout] = useState<Layout>('table');
  const [text, setText] = useState('');
  const list = useLoad(() => fetchPlanTable({ systemId, status: show === 'all' ? 'all' : 'open', type: planType }), `plans-table|${systemId}|${show === 'all' ? 'all' : 'open'}|${planType ?? ''}`);
  const items = sortPlans(list.data ?? []).filter((p) => matchesText(text, p.title, p.leaderName, p.unitName, p.state))
    .filter((p) => show !== 'mine' || p.canApprove);
  const waiting = items.filter((p) => p.canApprove);
  const to = (p: PlanItem) => `/s/${systemId}/work/plans/${p.id}`;
  const row = (p: PlanItem) => (
    <ListRow
      key={p.id}
      avatarName={p.leaderName}
      title={p.title}
      detail={`${p.leaderName} · ${p.unitName}`}
      status={<StatusChip tone={planTone(p.state, p.status)}>{p.state === 'WAITING' && p.waitingLevel ? t('door.state.waitingFor', { who: t(`door.level.${levelKeyOf(p.waitingLevel)}` as 'door.level.UNIT') }) : p.state === 'APPROVED' ? t(planStatusKey(p.status, p.planType)) : t(`door.state.${p.state}` as 'door.state.DRAFT')}</StatusChip>}
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
          <SearchBox value={text} onChange={setText} label={t('door.search.plans')} clearLabel={t('door.search.clear')} />
          <SelectField label={t('door.work.show')} name="pl-show" value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all' | 'mine')}>
            <option value="mine">{t('door.work.show.mine')}</option>
            <option value="open">{t('door.work.show.open')}</option>
            <option value="all">{t('door.work.show.all')}</option>
          </SelectField>
        </div>
        <Segmented
          label={t('door.work.layout')}
          value={layout}
          onChange={setLayout}
          items={[
            { key: 'table', label: t('door.plan.layout.table') },
            { key: 'list', label: t('door.work.layout.list') },
            { key: 'board', label: t('door.work.layout.board') },
            { key: 'calendar', label: t('door.plan.layout.calendar') },
          ]}
        />
      </div>
      {waiting.length > 0 && show !== 'mine' && (
        <div className="waiting-strip">
          <h3>{t('door.plan.waitingForYou', { count: waiting.length })}</h3>
          <RowList label={t('door.plan.waitingForYou', { count: waiting.length })}>{waiting.map(row)}</RowList>
        </div>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.plan.none')} detail={t('door.plan.noneDetail')} />
        ) : layout === 'table' ? (
          <PlansTable items={items} systemId={systemId} />
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
