import { Link } from 'react-router-dom';
import type { ScheduleActivity } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { dayHeading } from './schedule';
import { activitiesByDay, activityTime, splitActivities } from './when';

/** The date block on the left of an agenda row: weekday over a big day number. */
export function AgendaDate({ day, locale }: { day: string; locale: string }) {
  const at = new Date(`${day}T12:00:00Z`);
  return (
    <div className="agenda-date" aria-hidden="true">
      <span>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(at)}</span>
      <strong>{at.getUTCDate()}</strong>
      <span>{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(at)}</span>
    </div>
  );
}

const short = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/**
 * Approved activities of the month, read-only: each opens the activity itself. A long activity is listed once under
 * "Ongoing"; the rest sit on the day they happen.
 */
export function ActivitiesList({ items, linkSystem }: { items: ScheduleActivity[]; linkSystem?: (a: ScheduleActivity) => string }) {
  const t = useT();
  const { locale } = useI18n();
  if (items.length === 0) return null;
  const { ongoing, days } = splitActivities(items);
  const to = (a: ScheduleActivity) => `/s/${linkSystem ? linkSystem(a) : a.systemId}/work/plans/${a.planId}`;
  const type = (a: ScheduleActivity) => a.planType.toLowerCase();
  return (
    <div className="panel agenda">
      <h3>{t('door.sched.activities')}</h3>
      {ongoing.length > 0 && (
        <div className="agenda-ongoing">
          <p className="agenda-label">{t('door.sched.ongoing')}</p>
          <ul className="agenda-chips">
            {ongoing.map(({ activity: a, from, to: last }) => (
              <li key={a.planId}>
                <Link to={to(a)} className={`agenda-chip agenda-${type(a)}`}>
                  <strong>{a.title}</strong>
                  <span>{short(from, locale)} – {short(last, locale)} · {t(`door.plan.type.${a.planType}` as 'door.plan.type.PROGRAM')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {activitiesByDay(days).map((g) => (
        <div key={g.day} className="agenda-day">
          <AgendaDate day={g.day} locale={locale} />
          <ul className="agenda-items" aria-label={dayHeading(g.day, locale)}>
            {g.items.map((a) => (
              <li key={`${a.planId}|${a.date}`} className={`agenda-item agenda-${type(a)}`}>
                <Link to={to(a)}><strong>{a.title}</strong></Link>
                <span className="muted">
                  {activityTime(a) || t('door.sched.allDay')}
                  {a.location ? ` · ${a.location}` : ''} · {a.unitName} · {t(`door.plan.type.${a.planType}` as 'door.plan.type.PROGRAM')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
