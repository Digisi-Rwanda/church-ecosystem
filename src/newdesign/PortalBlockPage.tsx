import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchChurchCalendar, fetchMyDuties, fetchPortalSummary } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { isPortalBlock, systemsWithBlock } from './menu';
import { kindKey, lastMonth, periodLabel } from './reports';
import { SystemLink } from './SystemLink';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/**
 * A Portal bar item. People, Reports and Schedule show real content gathered from every system the
 * person may read (what the server answers, never more), each row opening its place in that system.
 */
export function PortalBlockPage() {
  const t = useT();
  const { block = '' } = useParams();
  if (!isPortalBlock(block)) {
    return <EmptyState variant="no-results" title={t('door.portal.unknown')} />;
  }
  const blockName = t(`door.block.${block}` as const);
  return (
    <section className="door-block" aria-labelledby="door-portal-block">
      <div>
        <PageHeader id="door-portal-block" title={t('door.portal.block.title', { block: blockName })} />
        <p className="muted">{t(`door.portal.block.subtitle.${block}` as 'door.portal.block.subtitle')}</p>
      </div>
      {block === 'reports' && <ReportsAcross />}
      {block === 'people' && <PeopleAcross />}
      {block === 'schedule' && <ScheduleAcross />}
      {block === 'work' && <p className="muted">{t('door.portal.block.work')}</p>}
    </section>
  );
}

function useSystemName() {
  const { portal } = useFrontDoor();
  return (id: string) => portal.find((s) => s.id === id)?.shortName ?? id;
}

function ReportsAcross() {
  const t = useT();
  const { locale } = useI18n();
  const name = useSystemName();
  const { portal, capabilities } = useFrontDoor();
  const data = useLoad(fetchPortalSummary, 'portal-summary');
  const where = systemsWithBlock(capabilities, portal, 'reports');
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {(data.data?.reports ?? []).length === 0 ? (
        <EmptyState title={t('door.portal.reports.none')} detail={t('door.portal.reports.noneDetail', { period: periodLabel(lastMonth(), locale) })} />
      ) : (
        <ul className="door-notices">
          {(data.data?.reports ?? []).map((r) => (
            <li key={r.id} className="panel door-notice">
              <div className="door-notice-main">
                <div className="door-row">
                  <strong>
                    <SystemLink to={`/s/${r.systemId}/reports/${r.id}`}>{t(kindKey(r.kind))}</SystemLink>
                  </strong>
                  <span className="door-chip">{periodLabel(r.periodKey, locale)}</span>
                </div>
                <p className="muted">
                  {r.unitName || name(r.systemId)} · {name(r.systemId)}
                  {r.publishedAt ? ` · ${t('door.portal.reports.published', { date: new Date(r.publishedAt).toLocaleDateString(locale) })}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {where.length > 0 && (
        <p className="door-system-links muted">
          {t('door.portal.openIn')}{' '}
          {where.map(({ systemId }, i) => (
            <span key={systemId}>
              {i > 0 && ' · '}
              <SystemLink to={`/s/${systemId}/reports`}>{name(systemId)}</SystemLink>
            </span>
          ))}
        </p>
      )}
    </LoadState>
  );
}

function PeopleAcross() {
  const t = useT();
  const name = useSystemName();
  const data = useLoad(fetchPortalSummary, 'portal-summary');
  const rows = [...(data.data?.people ?? [])].sort((a, b) => b.members - a.members);
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {rows.length === 0 ? (
        <EmptyState title={t('door.portal.block.none', { block: t('door.block.people') })} />
      ) : (
        <ul className="door-cards">
          {rows.map((r) => (
            <li key={r.systemId}>
              <SystemLink className="panel door-system-card" to={`/s/${r.systemId}/people`} aria-label={t('door.portal.block.openIn', { system: name(r.systemId) })}>
                <strong>{name(r.systemId)}</strong>
                <span className="door-big">{r.members}</span>
                <span className="muted">{t('door.portal.people.members')}</span>
              </SystemLink>
            </li>
          ))}
        </ul>
      )}
    </LoadState>
  );
}

function ScheduleAcross() {
  const t = useT();
  const { locale } = useI18n();
  const name = useSystemName();
  const month = new Date().toISOString().slice(0, 7);
  const duties = useLoad(fetchMyDuties, 'portal-duties');
  const calendar = useLoad(() => fetchChurchCalendar(month), `portal-calendar-${month}`);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const [now] = useState(() => Date.now());
  const mine = (duties.data ?? []).filter((d) => +new Date(d.startsAt) >= now - 3600_000).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const upcoming = (calendar.data ?? []).filter((s) => +new Date(s.startsAt) >= now - 3600_000).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 12);
  return (
    <>
      <h3>{t('door.portal.schedule.mine')}</h3>
      <LoadState loading={duties.loading} failed={duties.failed} retry={duties.reload}>
        {mine.length === 0 ? (
          <EmptyState title={t('door.portal.schedule.noneMine')} />
        ) : (
          <ul className="door-notices">
            {mine.map((d) => (
              <li key={d.assignmentId} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong>
                      <SystemLink to={`/s/${d.systemId}/schedule`}>{d.title}</SystemLink>
                    </strong>
                    <span className="door-chip">{d.role}</span>
                  </div>
                  <p className="muted">{when(d.startsAt)} · {d.unitName || name(d.systemId)}{d.location ? ` · ${d.location}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
      <h3>{t('door.portal.schedule.church')}</h3>
      <LoadState loading={calendar.loading} failed={calendar.failed} retry={calendar.reload}>
        {upcoming.length === 0 ? (
          <EmptyState title={t('door.portal.schedule.noneChurch')} />
        ) : (
          <ul className="door-notices">
            {upcoming.map((s) => (
              <li key={s.id} className="panel door-notice">
                <div className="door-notice-main">
                  <strong>{s.title}</strong>
                  <p className="muted">{when(s.startsAt)} · {s.unitName}{s.location ? ` · ${s.location}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}
