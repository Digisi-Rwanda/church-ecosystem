import { Link } from 'react-router-dom';
import { fetchCentralOverview } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { needsAttention, orderOversight, urgentHref, urgentKey } from './central';
import { useFrontDoor } from './FrontDoorContext';
import { LeaderDashboard } from './Dashboard';
import { SystemLink } from './SystemLink';
import { buildOwnMenu } from './menu';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import { useParams } from 'react-router-dom';
import { dayLabel } from './notices';
import { kindKey } from './reports';
import { PageHeader } from './kit';

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
        <PageHeader id="door-central-title" title={t('door.central.title')} />
        <p className="muted">{t('door.central.intro')}</p>
      </div>
      <LeaderDashboard systemId={systemId} systemName={t('door.central.title')} />
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
                      <SystemLink from={systemId} to={`/s/${r.systemId}/governance`}>{r.name}</SystemLink>
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
              {(data.reportsLate ?? []).length > 0 && (
                <>
                  <h4>{t('door.central.reports.late')}</h4>
                  <ul className="door-notices">
                    {(data.reportsLate ?? []).map((l) => (
                      <li key={l.scheduleId}>
                        <SystemLink from={systemId} to={`/s/${l.systemId}/reports`}>
                          {t('door.central.reports.lateLine', { unit: l.unitName, kind: t(kindKey(l.kind)), period: l.periodKey, due: l.dueOn })}
                        </SystemLink>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {data.reports.length === 0 ? (
                <EmptyState title={t('door.central.reports.none')} detail={t('door.central.reports.noneDetail')} />
              ) : (
                <ul className="door-notices">
                  {data.reports.map((r) => (
                    <li key={r.id}>
                      <SystemLink from={systemId} to={`/s/${r.systemId}/reports/${r.id}`}>
                        {t(kindKey(r.kind))} · {r.periodKey} · {r.unitName}
                      </SystemLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}
