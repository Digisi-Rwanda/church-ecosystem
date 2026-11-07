import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCentralOverview } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { useT } from '../i18n/I18nContext';
import { groupUrgent, needsAttention, orderOversight, takeFirst, urgentHref, urgentKey } from './central';
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
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} detail={t('door.central.noAccess')} />;

  return (
    <section className="door-block" aria-labelledby="door-central-title">
      <div>
        <PageHeader id="door-central-title" title={t('door.central.title')} />
      </div>
      <LeaderDashboard systemId={systemId} systemName={t('door.central.title')} />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <section className="panel cen cen-urgent" aria-labelledby="cen-urgent-h">
              <header className="cen-head">
                <span className="cen-chip red" aria-hidden="true"><Icon name="exclaim" size={20} /></span>
                <h3 id="cen-urgent-h">{t('door.central.urgent')}</h3>
                <span className="cen-count red">{data.urgentTotal}</span>
              </header>
              {data.urgent.length === 0 ? (
                <p className="muted">{t('door.central.urgent.none')}</p>
              ) : (
                <div className="cen-groups">
                  {groupUrgent(data.urgent).map((g) => {
                    const { shown, more } = takeFirst(g.items, open[g.kind] ? g.items.length : 3);
                    const rest = g.items.length - 3;
                    return (
                      <div key={g.kind} className={`cen-group ${g.tone}`}>
                        <div className="cen-group-head">
                          <span className="cen-chip sm" aria-hidden="true"><Icon name={g.icon} size={15} /></span>
                          <strong>{t(urgentKey(g.kind))}</strong>
                          <span className="cen-count">{g.items.length}</span>
                        </div>
                        <ul className="cen-rows">
                          {shown.map((u) => (
                            <li key={u.key}>
                              <Link className="cen-row" to={urgentHref(u)}>
                                <span className="cen-row-main">
                                  <strong>{u.subject}</strong>
                                  <small>
                                    {u.systemName}
                                    {u.unitName && u.unitName !== u.systemName ? ` · ${u.unitName}` : ''}
                                    {u.at ? ` · ${dayLabel(u.at).date}` : ''}
                                  </small>
                                </span>
                                <Icon name="chevron-right" size={16} className="cen-go" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {(more > 0 || (open[g.kind] && rest > 0)) && (
                          <button type="button" className="cen-more" onClick={() => toggle(g.kind)}>
                            {open[g.kind] ? t('door.central.showLess') : t('door.central.showMore', { count: String(rest) })}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {data.urgentTotal > data.urgent.length && <p className="muted cen-note">{t('door.central.urgent.more', { count: String(data.urgentTotal - data.urgent.length) })}</p>}
            </section>
            <section className="panel cen" aria-labelledby="cen-over-h">
              <header className="cen-head">
                <span className="cen-chip" aria-hidden="true"><Icon name="systems" size={20} /></span>
                <div className="cen-head-text">
                  <h3 id="cen-over-h">{t('door.central.oversight')}</h3>
                  <p className="muted">{t('door.central.oversight.hint')}</p>
                </div>
                <span className="cen-count amber">{data.oversight.filter(needsAttention).length}</span>
              </header>
              <div className="cen-systems">
                {orderOversight(data.oversight).map((r) => {
                  const hot = needsAttention(r);
                  const stat = (label: string, n: number, warn: boolean) => (<div className={`cen-stat${warn && n > 0 ? ' warn' : ''}${n === 0 ? ' zero' : ''}`}><strong>{n}</strong><span>{label}</span></div>);
                  return (
                    <div key={r.systemId} className={`cen-system${hot ? ' hot' : ''}`}>
                      <div className="cen-system-head">
                        <SystemLink from={systemId} to={`/s/${r.systemId}/governance`}>{r.name}</SystemLink>
                        <span className={`cen-pill ${hot ? 'amber' : 'green'}`}>{hot ? t('door.central.status.attention') : t('door.central.status.clear')}</span>
                      </div>
                      <div className="cen-stats">
                        {stat(t('door.central.col.units'), r.units, false)}
                        {stat(t('door.central.col.meetings'), r.plannedMeetings, false)}
                        {stat(t('door.central.col.decisions'), r.decisionsWaiting, true)}
                        {stat(t('door.central.col.letters'), r.lettersOpen, false)}
                        {stat(t('door.central.col.vacancies'), r.vacancies, true)}
                      </div>
                      {r.overdueMeetings > 0 && <p className="cen-overdue">{t('door.central.overdue', { count: String(r.overdueMeetings) })}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="cen-reports">
              {(data.reportsLate ?? []).length > 0 && (
                <section className="panel cen cen-late" aria-labelledby="cen-late-h">
                  <header className="cen-head">
                    <span className="cen-chip red" aria-hidden="true"><Icon name="clock" size={20} /></span>
                    <h3 id="cen-late-h">{t('door.central.reports.late')}</h3>
                    <span className="cen-count red">{(data.reportsLate ?? []).length}</span>
                  </header>
                  <ul className="cen-rows">
                    {takeFirst(data.reportsLate ?? [], open.late ? 99 : 5).shown.map((l) => (
                      <li key={l.scheduleId}>
                        <SystemLink from={systemId} to={`/s/${l.systemId}/reports`} className="cen-row">
                          <span className="cen-row-main">
                            <strong>{l.unitName} · {t(kindKey(l.kind))}</strong>
                            <small>{l.periodKey}</small>
                          </span>
                          <span className="cen-pill red">{t('door.central.dueOn', { date: l.dueOn })}</span>
                        </SystemLink>
                      </li>
                    ))}
                  </ul>
                  {(data.reportsLate ?? []).length > 5 && <button type="button" className="cen-more" onClick={() => toggle('late')}>{open.late ? t('door.central.showLess') : t('door.central.showMore', { count: String((data.reportsLate ?? []).length - 5) })}</button>}
                </section>
              )}
              <section className="panel cen" aria-labelledby="cen-rec-h">
                <header className="cen-head">
                  <span className="cen-chip" aria-hidden="true"><Icon name="document" size={20} /></span>
                  <h3 id="cen-rec-h">{t('door.central.reports')}</h3>
                  <span className="cen-count">{data.reports.length}</span>
                </header>
                {data.reports.length === 0 ? (
                  <EmptyState title={t('door.central.reports.none')} detail={t('door.central.reports.noneDetail')} />
                ) : (
                  <>
                    <ul className="cen-rows">
                      {takeFirst(data.reports, open.rec ? 99 : 6).shown.map((r) => (
                        <li key={r.id}>
                          <SystemLink from={systemId} to={`/s/${r.systemId}/reports/${r.id}`} className="cen-row">
                            <span className="cen-row-main">
                              <strong>{t(kindKey(r.kind))} · {r.unitName}</strong>
                              <small>{r.periodKey}</small>
                            </span>
                            <Icon name="chevron-right" size={16} className="cen-go" />
                          </SystemLink>
                        </li>
                      ))}
                    </ul>
                    {data.reports.length > 6 && <button type="button" className="cen-more" onClick={() => toggle('rec')}>{open.rec ? t('door.central.showLess') : t('door.central.showMore', { count: String(data.reports.length - 6) })}</button>}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}
