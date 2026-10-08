import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchChurchCalendar,
  fetchMonth,
  fetchMyDuties,
  fetchScheduleOptions,
  movePlan,
  type UnitPlan,
  type MonthView,
  type ScheduleOptions,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { buildOwnMenu, lettersFor } from './menu';
import { CHURCH_SYSTEM } from './portalHome';
import { addMonths, dayHeading, dayOf, groupByDay, monthGrid, monthLabel, overlapping, personClashes, planActions, planStatusKey, scheduleErrorKey, servingCounts, thisMonth, timeRange } from './schedule';
import { SlotCard, SlotForm } from './ScheduleParts';
import { useLoad } from './useLoad';
import { PageHeader, Segmented, StatusChip } from './kit';

/** The Schedule block: my duties, the church calendar (on the church-wide home), and this system's month plans. */
export function SchedulePage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [month, setMonth] = useState(thisMonth());
  const allowed = lettersFor(capabilities, systemId, 'schedule').length > 0;
  const options = useLoad(fetchScheduleOptions, 'sched-options');
  const [layout, setLayout] = useState<'list' | 'calendar'>('list');
  const view = useLoad(() => fetchMonth(systemId, month), `sched-month|${systemId}|${month}`);
  const planner = buildOwnMenu(capabilities, systemId).some((o) => o.block === 'monthplan' && o.letters.includes('W'));
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  return (
    <section className="door-block" aria-labelledby="door-sched-title">
      <PageHeader
        id="door-sched-title"
        title={t('door.block.schedule')}
        purpose={t('door.purpose.schedule')}
        actions={
          <>
            {view.data?.canWrite && <ImportLink systemId={systemId} target="scheduleSlots" />}
            <button type="button" className="btn ghost no-print" onClick={() => window.print()}>
              {t('door.sched.print')}
            </button>
            <Link className="btn secondary no-print" to={`/s/${systemId}/schedule/mine`}>
              {t('door.sched.mine')}
            </Link>
          </>
        }
      />
      <div className="view-bar">
      <div className="door-row">
        <button type="button" className="btn secondary sm" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('door.sched.prev')}>
          ‹
        </button>
        <strong aria-live="polite">{monthLabel(month, locale)}</strong>
        <button type="button" className="btn secondary sm" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('door.sched.next')}>
          ›
        </button>
        {month !== thisMonth() && (
          <button type="button" className="btn ghost sm" onClick={() => setMonth(thisMonth())}>
            {t('door.sched.today')}
          </button>
        )}
      </div>
      <Segmented
        label={t('door.work.layout')}
        value={layout}
        onChange={setLayout}
        items={[{ key: 'list', label: t('door.work.layout.list') }, { key: 'calendar', label: t('door.sched.layout.calendar') }]}
      />
      </div>
      {planner && (
        <div className="panel door-row">
          <span>
            <strong>{t('door.sched.planner')}</strong>
            <span className="muted"> {t('door.sched.plannerHint')}</span>
          </span>
          <Link className="btn" to={`/s/${systemId}/monthplan`}>
            {t('door.sched.plannerOpen')}
          </Link>
        </div>
      )}
      <MyDuties />
      {systemId === CHURCH_SYSTEM && <ChurchCalendar month={month} />}
      <Plans view={view} layout={layout} month={month} options={options.data} />
    </section>
  );
}

function MyDuties() {
  const t = useT();
  const { locale } = useI18n();
  const duties = useLoad(fetchMyDuties, 'sched-mine');
  if (!duties.data || duties.data.length === 0) return null;
  return (
    <div className="panel">
      <h3>{t('door.sched.mine')}</h3>
      <ul className="door-list">
        {duties.data.slice(0, 3).map((d) => (
          <li key={d.assignmentId}>
            <strong>{d.title}</strong> · {d.role}
            <span className="muted">
              {' '}
              — {d.unitName}, {dayHeading(dayOf(d.startsAt), locale)} {timeRange(d.startsAt, d.endsAt, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChurchCalendar({ month }: { month: string }) {
  const t = useT();
  const { locale } = useI18n();
  const cal = useLoad(() => fetchChurchCalendar(month), `sched-church|${month}`);
  return (
    <div className="panel">
      <h3>{t('door.sched.church')}</h3>
      <LoadState loading={cal.loading} failed={cal.failed} retry={cal.reload}>
        {!cal.data || cal.data.length === 0 ? (
          <p className="muted">{t('door.sched.churchNone')}</p>
        ) : (
          groupByDay(cal.data).map((g) => (
            <div key={g.day}>
              <h4>{dayHeading(g.day, locale)}</h4>
              <ul className="door-list">
                {g.slots.map((s) => (
                  <li key={s.id}>
                    <strong>{s.title}</strong>
                    <span className="muted">
                      {' '}
                      — {timeRange(s.startsAt, s.endsAt, locale)}
                      {s.location ? ` · ${s.location}` : ''} · {s.unitName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </LoadState>
    </div>
  );
}

function MonthCalendar({ view, month }: { view: MonthView; month: string }) {
  const t = useT();
  const { locale } = useI18n();
  const all = view.units.flatMap((u) => u.slots);
  const clash = overlapping(all);
  const today = dayOf(new Date().toISOString());
  const dow = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  const byDay = new Map<string, typeof all>();
  for (const s of all) byDay.set(dayOf(s.startsAt), [...(byDay.get(dayOf(s.startsAt)) ?? []), s]);
  return (
    <div className="month-grid print-sheet" role="grid" aria-label={monthLabel(month, locale)}>
      {dow.map((d) => (
        <div key={d} className="dow" role="columnheader">
          {d}
        </div>
      ))}
      {monthGrid(month).map((c) => {
        const slots = (byDay.get(c.day) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return (
          <div key={c.day} className={`month-cell${c.off ? ' off' : ''}${c.day === today ? ' today' : ''}`} role="gridcell" data-n={slots.length}>
            <span className="day-num">{Number(c.day.slice(8))}</span>
            {slots.slice(0, 3).map((s) => (
              <span key={s.id} className={`month-chip${clash.has(s.id) ? ' clash' : ''}`} title={`${s.title} · ${timeRange(s.startsAt, s.endsAt, locale)}${clash.has(s.id) ? ` · ${t('door.sched.clash')}` : ''}`}>
                {timeRange(s.startsAt, null, locale)} {s.title}
              </span>
            ))}
            {slots.length > 3 && <span className="month-more">{t('door.sched.more', { count: slots.length - 3 })}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Plans({ view, layout, month, options }: { view: ReturnType<typeof useLoad<MonthView>>; layout: 'list' | 'calendar'; month: string; options: ScheduleOptions | undefined }) {
  const t = useT();
  return (
    <LoadState loading={view.loading} failed={view.failed} retry={view.reload}>
      {view.data && layout === 'calendar' && <MonthCalendar view={view.data} month={month} />}
      {view.data && view.data.units.length === 0 ? (
        <EmptyState title={t('door.sched.none')} detail={t('door.sched.noneDetail')} />
      ) : (
        view.data?.units.map((u) => <UnitMonth key={u.unitId} unit={u} view={view.data!} month={month} options={options} reload={view.reload} />)
      )}
    </LoadState>
  );
}

function UnitMonth({ unit, view, month, options, reload }: { unit: UnitPlan; view: MonthView; month: string; options: ScheduleOptions | undefined; reload: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const status = unit.plan?.status ?? null;
  const clashes = personClashes(unit.slots);
  const counts = servingCounts(unit.slots);
  const actions = planActions(status, { confirm: view.canConfirm, publish: view.canPublish }, unit.slots.length);
  const canBuild = view.canWrite && (status === null || status === 'DRAFT');

  const step = async (action: 'confirm' | 'publish' | 'reopen') => {
    setError('');
    try {
      await movePlan(unit.plan!.id, action);
      reload();
    } catch (err) {
      setError(t(scheduleErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };

  return (
    <div className="panel">
      <div className="door-row">
        <h3>{unit.unitName}</h3>
        <span className={`door-chip${status === 'PUBLISHED' ? '' : ' warn'}`}>{t(planStatusKey(status))}</span>
      </div>
      {status === 'DRAFT' && <p className="muted">{t('door.sched.draftNote')}</p>}
      {clashes.length > 0 && (
        <div className="panel" role="status">
          <StatusChip tone="warn">{t('door.sched.clash')}</StatusChip>
          <ul className="door-list">
            {clashes.map((c) => (
              <li key={c.name}>{t('door.sched.clashLine', { name: c.name, titles: c.titles.join(', ') })}</li>
            ))}
          </ul>
        </div>
      )}
      {unit.slots.length === 0 && <p className="muted">{t('door.sched.noSlots')}</p>}
      {groupByDay(unit.slots).map((g) => (
        <div key={g.day}>
          <h4>{dayHeading(g.day, locale)}</h4>
          <ul className="door-notices">
            {g.slots.map((s) => (
              <SlotCard
                key={s.id}
                slot={s}
                unitId={unit.unitId}
                status={status ?? 'DRAFT'}
                canWrite={view.canWrite}
                kinds={options?.kinds ?? ['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER']}
                limits={options?.limits ?? { titleMax: 120, roleMax: 80, noteMax: 1000 }}
                month={month}
                onChange={reload}
              />
            ))}
          </ul>
        </div>
      ))}
      {adding && options && (
        <SlotForm unitId={unit.unitId} kinds={options.kinds} limits={options.limits} month={month} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      {counts.length > 1 && (
        <details className="no-print">
          <summary>{t('door.sched.fairness')}</summary>
          <ul className="door-list">
            {counts.map((c) => (
              <li key={c.personId}>
                <strong>{c.name}</strong> · {t('door.sched.times', { count: c.count })}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="door-row no-print">
        {canBuild && !adding && options && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            {t('door.sched.addSlot')}
          </button>
        )}
        {actions.map((a) => (
          <button key={a} type="button" className={a === 'reopen' ? 'btn ghost' : 'btn secondary'} onClick={() => void step(a)}>
            {t(`door.sched.action.${a}` as const)}
          </button>
        ))}
      </div>
    </div>
  );
}
