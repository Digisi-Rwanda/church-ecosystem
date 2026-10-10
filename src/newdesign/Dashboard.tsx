import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { fetchDashboard, type DashKpi, type Dashboard } from '../api/frontDoorApi';
import { Icon, type IconName } from '../components/ui/Icon';
import { useI18n, useT } from '../i18n/I18nContext';
import { shortDay } from './charts';
import { MonthsChart, SegBar, Spark, type VizSeries } from './DashViz';
import { Segmented } from './kit';
import { useFrontDoor } from './FrontDoorContext';
import { DashboardOverview } from './DashboardOverview';
import { GlanceDashboard } from './GlanceDashboard';
import { formatRwf } from './money';
import { SystemLink } from './SystemLink';
import { useLoad } from './useLoad';

const KPI_ICON: Record<DashKpi['key'], IconName> = { members: 'users', attendance: 'pulse', giving: 'wallet', money: 'wallet', units: 'layers', reports: 'folder', work: 'task', done: 'task' };

/** "Up 12%" / "Down 3%" / "Same": the words travel with the arrow, so colour is never the only signal. */
function Trend({ value }: { value: number | null }) {
  const t = useT();
  if (value === null) return null;
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'same';
  const text = dir === 'same' ? t('door.dash.trend.same') : t(`door.dash.trend.${dir}` as 'door.dash.trend.up', { percent: String(Math.abs(value)) });
  return (
    <span className={`dash-trend ${dir}`} title={text}>
      <span aria-hidden="true">{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}</span>
      {dir !== 'same' && <span>{Math.abs(value)}%</span>}
      <span className="sr-only">{text}</span>
    </span>
  );
}

function KpiCard({ kpi, note }: { kpi: DashKpi; note?: string }) {
  const t = useT();
  const label = t(`door.dash.kpi.${kpi.key}` as 'door.dash.kpi.members');
  const body = (
    <>
      <span className="dash-kpi-icon" aria-hidden="true">
        <Icon name={KPI_ICON[kpi.key]} size={22} />
      </span>
      <span className="dash-kpi-main">
        <strong className="dash-kpi-value">{kpi.format === 'rwf' ? formatRwf(kpi.value) : kpi.value.toLocaleString('en-US')}</strong>
        <span className="dash-kpi-label">{label}</span>
      </span>
      <Trend value={kpi.trend} />
      {kpi.spark && <Spark values={kpi.spark} />}
      {kpi.prev !== undefined && kpi.prev !== null && kpi.trend !== null && <span className="dx-prev">{t('door.dash.vsLast', { value: kpi.format === 'rwf' ? formatRwf(kpi.prev) : kpi.prev.toLocaleString('en-US') })}</span>}
      {note && <span className="dash-flag">{note}</span>}
      {!note && kpi.tone === 'late' && kpi.key === 'reports' && <span className="dash-flag">{t('door.dash.reports.late')}</span>}
    </>
  );
  return kpi.href ? (
    <Link className="panel dash-kpi" to={kpi.href}>
      {body}
    </Link>
  ) : (
    <div className="panel dash-kpi">{body}</div>
  );
}

function Panel({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <section className="panel dash-panel" aria-label={title}>
      <header className="dash-panel-head">
        <h3>{title}</h3>
        {to && (
          <Link className="dash-viewall" to={to}>
            {t('door.dash.viewAll')}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

function Lists({ data, systemId }: { data: Dashboard; systemId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const day = (iso: string | null) => (iso ? shortDay(iso.slice(0, 10), locale) : '');
  return (
    <>
      <Panel title={t('door.dash.events.title')} to={`/s/${systemId}/events`}>
        {data.events.length === 0 ? (
          <p className="muted">{t('door.dash.events.none')}</p>
        ) : (
          <ul className="dash-list">
            {data.events.map((e) => (
              <li key={e.id}>
                <SystemLink from={systemId} to={e.href} className="dash-row">
                  <span className="dash-date">{day(e.startsOn)}</span>
                  <span className="dash-row-main">
                    <strong>{e.title}</strong>
                    <span className="dash-chip">{t(`door.plans.${e.planType}` as 'door.plans.EVENT')}</span>
                  </span>
                </SystemLink>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {data.members && (
      <Panel title={t('door.dash.members.title')} to={`/s/${systemId}/people`}>
        {data.members.length === 0 ? (
          <p className="muted">{t('door.dash.members.none')}</p>
        ) : (
          <ul className="dash-list">
            {data.members.map((m) => (
              <li key={m.personId}>
                <SystemLink from={systemId} to={m.href} className="dash-row">
                  <span className="dash-avatar" aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <span className="dash-row-main">
                    <strong>{m.name}</strong>
                    <span className="muted">{t('door.dash.members.joined', { date: day(m.joinedOn) })}</span>
                  </span>
                </SystemLink>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      )}
      {data.reports && (
        <Panel title={t('door.dash.reports.title')} to={`/s/${systemId}/reports`}>
          {data.reports.length === 0 ? (
            <p className="muted">{t('door.dash.reports.none')}</p>
          ) : (
            <ul className="dash-list">
              {data.reports.map((r) => (
                <li key={r.id}>
                  <SystemLink from={systemId} to={r.href} className="dash-row">
                    <span className="dash-icon" aria-hidden="true">
                      <Icon name="folder" size={18} />
                    </span>
                    <span className="dash-row-main">
                      <strong>{r.title}</strong>
                      <span className="muted">
                        {t(`door.reports.kind.${r.kind}` as 'door.dash.reports.none')} · {r.periodKey}
                      </span>
                    </span>
                    {r.late && <span className="dash-flag">{t('door.dash.reports.late')}</span>}
                  </SystemLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <Panel title={t('door.dash.work.title')} to={`/s/${systemId}/work`}>
        {data.work.length === 0 ? (
          <p className="muted">{t('door.dash.work.none')}</p>
        ) : (
          <ul className="dash-list">
            {data.work.map((w) => (
              <li key={w.id}>
                <SystemLink from={systemId} to={w.href} className="dash-row">
                  <span className="dash-icon" aria-hidden="true">
                    <Icon name="task" size={18} />
                  </span>
                  <span className="dash-row-main">
                    <strong>{w.title}</strong>
                    <span className="muted">{t(`door.work.status.${w.status}` as 'door.work.status.TODO')}</span>
                  </span>
                </SystemLink>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

const RANGES = [3, 6, 12] as const;

/** What needs this person first: short links with a count, or a calm "all clear". */
function Attention({ items }: { items: NonNullable<Dashboard['attention']> }) {
  const t = useT();
  if (items.length === 0) return <p className="dx-clear" role="status"><Icon name="check" size={16} /> {t('door.dash.att.clear')}</p>;
  return (
    <section className="dx-attention" aria-label={t('door.dash.att.title')}>
      <strong>{t('door.dash.att.title')}</strong>
      <ul>
        {items.map((a) => (
          <li key={a.key}>
            <Link to={a.href}><span className="dx-count">{a.count}</span> {t(`door.dash.att.${a.key}` as 'door.dash.att.approvals', { count: String(a.count) })}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Contributions per unit, split by church-wide type and the unit's own, with donations beside them. Offerings are never mixed in. */
function ByUnit({ data }: { data: NonNullable<Dashboard['byUnit']> }) {
  const t = useT();
  if (data.units.length === 0) return <p className="muted">{t('door.dash.byUnit.none')}</p>;
  const top = Math.max(...data.units.map((u) => u.total), 1);
  const names = [...data.types, ...(data.units.some((u) => u.own > 0) ? [t('door.dash.byUnit.own')] : []), ...(data.units.some((u) => u.donations > 0) ? [t('door.dash.byUnit.donations')] : [])];
  return (
    <div className="dx-byunit">
      <ul className="dx-legend">
        {names.map((n, i) => (<li key={n}><span className={`dx-swatch dx-s${i + 1}`} aria-hidden="true" />{n}</li>))}
      </ul>
      <ul className="dx-units">
        {data.units.map((u) => {
          const parts = [...data.types.map((ty, i) => ({ slot: i + 1, value: u.byType[ty] ?? 0, name: ty })), { slot: data.types.length + 1, value: u.own, name: t('door.dash.byUnit.own') }, { slot: data.types.length + 2, value: u.donations, name: t('door.dash.byUnit.donations') }].filter((p) => p.value > 0);
          return (
            <li key={u.systemId}>
              <span className="dx-unit-name">{u.name}</span>
              <SegBar parts={parts} total={top} label={`${u.name}: ${formatRwf(u.total)}`} />
              <strong className="dx-unit-total">{formatRwf(u.total)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The leader's dashboard: what needs action first, the figures with their trend, charts you can hover, and
 * short lists for this system (the whole church for Central Administration). The server answers only for
 * leaders and only with what their letters allow, so anyone else — or a failure — gets the plain figures.
 */
export function LeaderDashboard({ systemId, systemName, fallback }: { systemId: string; systemName: string; fallback?: React.ReactNode }) {
  const t = useT();
  const { locale } = useI18n();
  const { personName } = useFrontDoor();
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const fresh = useLoad(() => fetchDashboard(systemId, range), `dash|${systemId}|${range}`);
  // Keep showing the last answer while another range loads, so the page does not blink away.
  const last = useRef<Dashboard | undefined>(undefined);
  if (fresh.data) last.current = fresh.data;
  const data = fresh.data ?? (last.current?.systemId === systemId ? last.current : undefined);
  if (fresh.loading && !data) return null;
  if (!data) {
    return (
      <>
        <GlanceDashboard systemId={systemId} />
        {fallback}
      </>
    );
  }

  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const rwf = (n: number) => formatRwf(n);
  const count = (n: number) => n.toLocaleString('en-US');
  const second = data.second;
  const moneySeries: VizSeries[] = (second?.series ?? [])
    .filter((s) => s.points.length > 1)
    .map((s, i) => ({ key: s.key, name: t(`door.dash.legend.${s.key}` as 'door.dash.legend.income'), slot: s.key === 'spent' ? 2 : i === 0 ? 1 : 3, points: s.points }));
  const hasSecond = moneySeries.some((l) => l.points.some((p) => p.value > 0));
  const secondTitle = t(second?.kind === 'giving' ? 'door.dash.giving.title' : 'door.dash.money.title');
  const attTitle = t('door.dash.attendance.title');
  const hasAtt = !!data.attendance && data.attendance.some((p) => p.value > 0);
  const workSeries: VizSeries[] = (data.workSeries ?? []).map((s) => ({ key: s.key, name: t(`door.dash.work.${s.key}` as 'door.dash.work.created'), slot: s.key === 'created' ? 1 : 3, points: s.points }));
  const hasWork = workSeries.some((s) => s.points.some((p) => p.value > 0));
  const w = data.overview.work;
  const mo = data.overview.money;
  const budget = mo && mo.plannedYear > 0 ? Math.round((mo.spentYear / mo.plannedYear) * 100) : null;
  const rangeLabel = t('door.dash.lastN', { n: String(data.range ?? range) });

  return (
    <div className="dash">
      <div className="dash-greet">
        <div>
          <h2>{t('door.dash.welcome', { name: personName || systemName })}</h2>
          <p className="muted">{t('door.dash.sub', { system: systemName })} · {date}</p>
        </div>
        <Segmented label={t('door.dash.range')} value={String(range) as '3' | '6' | '12'} onChange={(k) => setRange(Number(k) as (typeof RANGES)[number])} items={RANGES.map((n) => ({ key: String(n) as '3' | '6' | '12', label: t('door.dash.months', { n: String(n) }) }))} />
      </div>
      <Attention items={data.attention ?? []} />
      <ul className="dash-kpis">
        {data.kpis.map((k) => (
          <li key={k.key}>
            <KpiCard kpi={k} note={k.key === 'work' && w?.overdue ? t('door.dash.work.overdueN', { count: String(w.overdue) }) : undefined} />
          </li>
        ))}
      </ul>
      {(data.attendance || second || hasWork) && (
        <div className="dash-charts">
          {data.attendance && (
            <Panel title={attTitle}>
              <span className="dash-range">{rangeLabel}</span>
              {hasAtt ? <MonthsChart kind="bars" series={[{ key: 'att', name: attTitle, slot: 1, points: data.attendance }]} title={attTitle} format={count} /> : <p className="muted">{t('door.dash.noData')}</p>}
            </Panel>
          )}
          {second && (
            <Panel title={secondTitle}>
              <span className="dash-range">{rangeLabel}</span>
              {hasSecond ? <MonthsChart kind="lines" series={moneySeries} title={secondTitle} format={rwf} /> : <p className="muted">{t('door.dash.noData')}</p>}
            </Panel>
          )}
          {hasWork && (
            <Panel title={t('door.dash.work.chart')} to={`/s/${systemId}/work`}>
              <span className="dash-range">{rangeLabel}</span>
              <MonthsChart kind="bars" series={workSeries} title={t('door.dash.work.chart')} format={count} />
            </Panel>
          )}
        </div>
      )}
      {(w || mo) && (
        <div className="dash-charts">
          {w && (
            <Panel title={t('door.dash.plans.title')} to={`/s/${systemId}/money/plan`}>
              <SegBar label={t('door.dash.plans.title')} parts={[{ slot: 1, value: w.plansRunning, name: t('door.dash.work.running') }, { slot: 2, value: w.plansWaiting, name: t('door.dash.work.waiting') }, { slot: 3, value: w.plansDraft, name: t('door.dash.work.drafts') }]} />
              <ul className="dx-legend">
                <li><span className="dx-swatch dx-s1" aria-hidden="true" />{t('door.dash.work.running')}: {w.plansRunning}</li>
                <li><span className="dx-swatch dx-s2" aria-hidden="true" />{t('door.dash.work.waiting')}: {w.plansWaiting}</li>
                <li><span className="dx-swatch dx-s3" aria-hidden="true" />{t('door.dash.work.drafts')}: {w.plansDraft}</li>
              </ul>
            </Panel>
          )}
          {mo && (
            <Panel title={t('door.dash.budget.title')} to={`/s/${systemId}/money/budget`}>
              {budget !== null ? (
                <>
                  <p className="dx-big">{budget}% <span className="muted">{t('door.dash.budget.used')}</span></p>
                  <SegBar label={t('door.dash.budget.title')} total={mo.plannedYear} parts={[{ slot: budget > 100 ? 2 : 1, value: mo.spentYear, name: t('door.dash.budget.spent') }]} />
                  <p className="muted">{formatRwf(mo.spentYear)} / {formatRwf(mo.plannedYear)}{budget > 100 ? ` · ${t('door.dash.budget.over')}` : ''}</p>
                </>
              ) : (
                <p className="muted">{t('door.dash.budget.none')}</p>
              )}
              <p className="muted">{t('door.dash.money.balance')}: <strong>{formatRwf(mo.balance)}</strong></p>
            </Panel>
          )}
        </div>
      )}
      {data.byUnit && (
        <Panel title={t('door.dash.byUnit.title', { year: String(data.byUnit.year) })}>
          <p className="muted">{t('door.dash.byUnit.hint')}</p>
          <ByUnit data={data.byUnit} />
        </Panel>
      )}
      <div className="dash-masonry">
        <DashboardOverview data={data} systemId={systemId} />
        <Lists data={data} systemId={systemId} />
      </div>
    </div>
  );
}
