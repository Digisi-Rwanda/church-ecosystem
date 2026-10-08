import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Dashboard } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { shortDay } from './charts';
import { formatRwf } from './money';

function Card({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  const t = useT();
  return (
    <section className="panel dash-panel" aria-label={title}>
      <header className="dash-panel-head">
        <h3>{title}</h3>
        <Link className="dash-viewall" to={to}>
          {t('door.dash.viewAll')}
        </Link>
      </header>
      {children}
    </section>
  );
}

function Stats({ rows }: { rows: Array<[string, ReactNode, boolean?]> }) {
  return (
    <dl className="dash-stats">
      {rows.map(([label, value, warn]) => (
        <div key={label} className={warn ? 'warn' : undefined}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A short summary of each part of the system, in place of a card that only points at it. Each
 * part is here only when the server sent it, which it does only for letters this person holds.
 */
export function DashboardOverview({ data, systemId }: { data: Dashboard; systemId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const o = data.overview;
  const base = `/s/${systemId}`;
  const day = (iso: string | null) => (iso ? shortDay(iso.slice(0, 10), locale) : '');
  return (
    <>
      {o.schedule && (
        <Card title={t('door.block.schedule')} to={`${base}/schedule`}>
          {o.schedule.next.length === 0 ? (
            <p className="muted">{t('door.dash.schedule.none')}</p>
          ) : (
            <ul className="dash-list">
              {o.schedule.next.map((x) => (
                <li key={x.id} className="dash-row">
                  <span className="dash-date">{day(x.startsAt)}</span>
                  <span className="dash-row-main">
                    <strong>{x.title}</strong>
                    <span className="muted">{t(`door.sched.kind.${x.kind}` as 'door.dash.schedule.none')}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {o.monthPlan && (
        <Card title={t('door.own.monthplan')} to={`${base}/monthplan`}>
          {o.monthPlan.next.length === 0 ? (
            <p className="muted">{t(o.monthPlan.planned ? 'door.dash.monthplan.none' : 'door.dash.monthplan.notYet')}</p>
          ) : (
            <ul className="dash-list">
              {o.monthPlan.next.map((x) => (
                <li key={`${x.date}${x.kind}`} className="dash-row">
                  <span className="dash-date">{day(x.date)}</span>
                  <span className="dash-row-main">
                    <strong>{t(`door.music.kind.${x.kind}` as 'door.music.kind.SS1')}</strong>
                    <span className="muted">{x.choirs.length ? x.choirs.join(', ') : t('door.dash.monthplan.nobody')}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {o.money && (
        <Card title={t('door.block.money')} to={`${base}/money`}>
          <Stats
            rows={[
              [t('door.dash.money.balance'), formatRwf(o.money.balance)],
              [t('door.dash.money.inMonth'), formatRwf(o.money.incomeMonth)],
              [t('door.dash.money.spentMonth'), formatRwf(o.money.spentMonth)],
              [t('door.dash.money.pending'), o.money.pendingCount > 0 ? `${o.money.pendingCount} · ${formatRwf(o.money.pendingAmount)}` : '0', o.money.pendingCount > 0],
              ...(o.money.plannedYear > 0 ? ([[t('door.dash.money.budget'), `${formatRwf(o.money.spentYear)} / ${formatRwf(o.money.plannedYear)}`]] as Array<[string, ReactNode]>) : []),
            ]}
          />
        </Card>
      )}
      {o.work && (
        <Card title={t('door.block.work')} to={`${base}/work`}>
          <Stats
            rows={[
              [t('door.dash.work.openTasks'), o.work.openTasks],
              [t('door.dash.work.running'), o.work.plansRunning],
              [t('door.dash.work.waiting'), o.work.plansWaiting, o.work.plansWaiting > 0],
              [t('door.dash.work.drafts'), o.work.plansDraft],
            ]}
          />
        </Card>
      )}
      {o.people && (
        <Card title={t('door.block.people')} to={`${base}/people`}>
          <Stats rows={[[t('door.dash.kpi.members'), o.people.members], [t('door.dash.people.joined'), o.people.joinedThisMonth], [t('door.dash.kpi.units'), o.people.units]]} />
        </Card>
      )}
      {o.governance && (
        <Card title={t('door.gov.title')} to={`${base}/governance`}>
          <Stats
            rows={[
              [t('door.dash.gov.next'), o.governance.nextMeeting ? `${o.governance.nextMeeting.title} · ${day(o.governance.nextMeeting.at)}` : t('door.dash.gov.noMeeting')],
              [t('door.dash.gov.decisions'), o.governance.decisionsWaiting, o.governance.decisionsWaiting > 0],
              [t('door.dash.gov.letters'), o.governance.lettersOpen],
            ]}
          />
        </Card>
      )}
      {o.choirs && (
        <Card title={t('door.own.choirs')} to={`${base}/choirs`}>
          {o.choirs.count === 0 ? (
            <p className="muted">{t('door.dash.choirs.none')}</p>
          ) : (
            <>
              <Stats rows={[[t('door.dash.choirs.count'), o.choirs.count], [t('door.dash.choirs.members'), o.choirs.members]]} />
              <ul className="dash-list">
                {o.choirs.list.map((c) => (
                  <li key={c.name} className="dash-row">
                    <span className="dash-row-main">
                      <strong>{c.name}</strong>
                      <span className="muted">{t('door.dash.choirs.sing', { count: String(c.members) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </>
  );
}
