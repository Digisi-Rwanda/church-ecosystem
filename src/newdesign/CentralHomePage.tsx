import { Link } from 'react-router-dom';
import { fetchCentralOverview } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { needsAttention, orderOversight, urgentHref, urgentKey } from './central';
import { useFrontDoor } from './FrontDoorContext';
import { buildOwnMenu } from './menu';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import { useParams } from 'react-router-dom';
import { dayLabel } from './notices';

/** Central Administration home: Urgent, Oversight and Reports received, all read-only. */
export function CentralHomePage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const allowed = buildOwnMenu(capabilities, systemId).some((i) => i.block === 'central');
  const { data, loading, failed, reload } = useLoad(fetchCentralOverview, 'central');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} detail={t('door.central.noAccess')} />;

  return (
    <section className="door-block" aria-labelledby="door-central-title">
      <div>
        <h2 id="door-central-title">{t('door.central.title')}</h2>
        <p className="muted">{t('door.central.intro')}</p>
      </div>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <div className="panel">
              <h3>{t('door.central.urgent')}</h3>
              {data.urgent.length === 0 ? (
                <p className="muted">{t('door.central.urgent.none')}</p>
              ) : (
                <>
                  <ul className="door-urgent">
                    {data.urgent.map((u) => (
                      <li key={u.key}>
                        <Link to={urgentHref(u)}>
                          <strong>{t(urgentKey(u.kind))}</strong>: {u.subject}
                        </Link>
                        <span className="muted door-notice-meta">
                          {' '}
                          · {u.systemName}
                          {u.unitName && u.unitName !== u.systemName ? ` · ${u.unitName}` : ''}
                          {u.at ? ` · ${dayLabel(u.at).date}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {data.urgentTotal > data.urgent.length && <p className="muted">{t('door.central.urgent.more', { count: String(data.urgentTotal - data.urgent.length) })}</p>}
                </>
              )}
            </div>
            <div className="panel">
              <h3>{t('door.central.oversight')}</h3>
              <p className="muted">{t('door.central.oversight.hint')}</p>
              <div className="door-oversight">
                {orderOversight(data.oversight).map((r) => (
                  <div key={r.systemId} className={`door-oversight-card${needsAttention(r) ? ' attention' : ''}`}>
                    <strong>
                      <Link to={`/s/${r.systemId}/governance`}>{r.name}</Link>
                    </strong>
                    <dl>
                      <dt>{t('door.central.col.units')}</dt>
                      <dd>{r.units}</dd>
                      <dt>{t('door.central.col.meetings')}</dt>
                      <dd>
                        {r.plannedMeetings}
                        {r.overdueMeetings > 0 && <span className="door-error"> ({t('door.central.overdue', { count: String(r.overdueMeetings) })})</span>}
                      </dd>
                      <dt>{t('door.central.col.decisions')}</dt>
                      <dd>{r.decisionsWaiting}</dd>
                      <dt>{t('door.central.col.letters')}</dt>
                      <dd>{r.lettersOpen}</dd>
                      <dt>{t('door.central.col.vacancies')}</dt>
                      <dd>{r.vacancies}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h3>{t('door.central.reports')}</h3>
              {data.reports.length === 0 ? <EmptyState title={t('door.central.reports.none')} detail={t('door.central.reports.noneDetail')} /> : null}
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}
