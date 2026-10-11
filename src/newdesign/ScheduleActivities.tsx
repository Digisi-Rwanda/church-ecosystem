import { Link } from 'react-router-dom';
import type { ScheduleActivity } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { dayHeading } from './schedule';
import { activitiesByDay, activityTime } from './when';

/** Approved activities of the month, read-only: each opens the activity itself. A repeat shows once on each of its days. */
export function ActivitiesList({ items, linkSystem }: { items: ScheduleActivity[]; linkSystem?: (a: ScheduleActivity) => string }) {
  const t = useT();
  const { locale } = useI18n();
  if (items.length === 0) return null;
  return (
    <div className="panel">
      <h3>{t('door.sched.activities')}</h3>
      {activitiesByDay(items).map((g) => (
        <div key={g.day}>
          <h4>{dayHeading(g.day, locale)}</h4>
          <ul className="door-list">
            {g.items.map((a) => (
              <li key={`${a.planId}|${a.date}`}>
                <Link to={`/s/${linkSystem ? linkSystem(a) : a.systemId}/work/plans/${a.planId}`}><strong>{a.title}</strong></Link>
                <span className="muted">
                  {' '}— {activityTime(a) || t('door.sched.allDay')}
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
