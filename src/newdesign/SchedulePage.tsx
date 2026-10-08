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
import { addMonths, dayHeading, dayOf, groupByDay, monthLabel, planActions, planStatusKey, scheduleErrorKey, thisMonth, timeRange } from './schedule';
import { SlotCard, SlotForm } from './ScheduleParts';
import { useLoad } from './useLoad';

/** The Schedule block: my duties, the church calendar (on the church-wide home), and this system's month plans. */
export function SchedulePage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [month, setMonth] = useState(thisMonth());
  const allowed = lettersFor(capabilities, systemId, 'schedule').length > 0;
  const options = useLoad(fetchScheduleOptions, 'sched-options');
  const planner = buildOwnMenu(capabilities, systemId).some((o) => o.block === 'monthplan' && o.letters.includes('W'));
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  return (
    <section className="door-block" aria-labelledby="door-sched-title">
      <h2 id="door-sched-title">{t('door.block.schedule')}</h2>
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
      <Plans systemId={systemId} month={month} options={options.data} />
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
        {duties.data.map((d) => (
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

function Plans({ systemId, month, options }: { systemId: string; month: string; options: ScheduleOptions | undefined }) {
  const t = useT();
  const view = useLoad(() => fetchMonth(systemId, month), `sched-month|${systemId}|${month}`);
  return (
    <LoadState loading={view.loading} failed={view.failed} retry={view.reload}>
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
      <div className="door-row">
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
