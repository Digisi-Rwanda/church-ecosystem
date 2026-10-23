import { Link } from 'react-router-dom';
import type { PlanItem } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { ACTIVITY_GROUPS, groupActivities } from './activitySummary';

const SHOWN = 3;
const todayInKigali = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);

/** A few activities in each status (completed, in progress, upcoming); each opens in Work. */
export function ActivityByStatus({ plans, systemId }: { plans: PlanItem[]; systemId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const groups = groupActivities(plans, todayInKigali());
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  return (
    <div className="act-groups">
      {ACTIVITY_GROUPS.map((g) => {
        const list = groups[g];
        return (
          <div key={g} className={`act-group act-${g.toLowerCase()}`}>
            <h4 className="act-title">
              {t(`door.units.act.${g}` as 'door.units.act.DONE')}
              <span className="act-count">{list.length}</span>
            </h4>
            {list.length === 0 ? (
              <p className="muted act-none">{t('door.units.act.none')}</p>
            ) : (
              <ul className="act-list">
                {list.slice(0, SHOWN).map((p) => (
                  <li key={p.id}>
                    <Link to={`/s/${p.systemId || systemId}/work/plans/${p.id}`}>
                      <span className="act-name">{p.title}</span>
                      <span className="act-meta">
                        {t(`door.plans.${p.planType}` as 'door.plans.PROGRAM')}
                        {g === 'DONE' ? ` · ${when(p.endsOn)}` : g === 'UPCOMING' && p.startsOn ? ` · ${when(p.startsOn)}` : g === 'INPROGRESS' && p.endsOn ? ` · ${t('door.units.act.until', { date: when(p.endsOn) })}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {list.length > SHOWN && (
              <Link className="act-more" to={`/s/${systemId}/work`}>
                {t('door.units.act.more', { n: list.length - SHOWN })}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
