import { Link } from 'react-router-dom';
import { fetchDashboard, type DashKpi, type DashPoint, type Dashboard } from '../api/frontDoorApi';
import { Icon, type IconName } from '../components/ui/Icon';
import { useI18n, useT } from '../i18n/I18nContext';
import { chartBars, compactNumber, roundedTopBar, shortDay, shortMonth } from './charts';
import { useFrontDoor } from './FrontDoorContext';
import { GlanceDashboard } from './GlanceDashboard';
import { formatRwf } from './money';
import { SystemLink } from './SystemLink';
import { useLoad } from './useLoad';

const KPI_ICON: Record<DashKpi['key'], IconName> = { members: 'users', attendance: 'pulse', giving: 'wallet', money: 'wallet', units: 'layers', reports: 'folder' };

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

function KpiCard({ kpi }: { kpi: DashKpi }) {
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
      {kpi.tone === 'late' && <span className="dash-flag">{t('door.dash.reports.late')}</span>}
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

const W = 320;
const H = 150;
const FLOOR = 124;
const TOP = 16;

function AttendanceChart({ points, title }: { points: DashPoint[]; title: string }) {
  const { locale } = useI18n();
  const top = Math.max(...points.map((p) => p.value), 1);
  const bars = chartBars(points.map((p) => p.value), top, FLOOR - TOP - 10);
  const step = W / points.length;
  const bar = Math.min(26, step - 10);
  return (
    <svg className="dash-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <line x1="0" y1={FLOOR} x2={W} y2={FLOOR} stroke="var(--line-strong)" />
      {bars.map((b, i) => {
        const p = points[i];
        const x = i * step + (step - bar) / 2;
        return (
          <g key={p.label}>
            {b.height > 0 && (
              <path d={roundedTopBar(x, FLOOR - b.height, bar, b.height)} fill="var(--accent)">
                <title>{`${shortMonth(p.label, locale)}: ${p.value}`}</title>
              </path>
            )}
            <text x={i * step + step / 2} y={FLOOR - b.height - 4} textAnchor="middle" fontSize="10" fill="var(--ink-muted)">
              {b.value > 0 ? compactNumber(b.value) : ''}
            </text>
            <text x={i * step + step / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-muted)">
              {shortMonth(p.label, locale)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Line = { key: string; points: DashPoint[]; color: string; text: string };

function LineChart({ lines, title, money }: { lines: Line[]; title: string; money: boolean }) {
  const { locale } = useI18n();
  const n = lines[0]?.points.length ?? 0;
  if (n < 2) return null;
  const top = Math.max(...lines.flatMap((l) => l.points.map((p) => p.value)), 1);
  const x = (i: number) => 12 + (i * (W - 24)) / (n - 1);
  const y = (v: number) => FLOOR - (Math.max(v, 0) / top) * (FLOOR - TOP);
  const path = (l: Line) => l.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const show = (v: number) => (money ? formatRwf(v) : String(v));
  return (
    <svg className="dash-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <line x1="0" y1={FLOOR} x2={W} y2={FLOOR} stroke="var(--line-strong)" />
      {lines.length === 1 && <path d={`${path(lines[0])} L${x(n - 1)},${FLOOR} L${x(0)},${FLOOR} Z`} fill={lines[0].color} opacity="0.14" />}
      {lines.map((l) => (
        <path key={l.key} d={path(l)} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {lines.map((l) =>
        l.points.map((p, i) => (
          <circle key={`${l.key}${p.label}`} cx={x(i)} cy={y(p.value)} r="4" fill={l.color} stroke="var(--surface-2)" strokeWidth="2">
            <title>{`${l.text} · ${shortMonth(p.label, locale)}: ${show(p.value)}`}</title>
          </circle>
        )),
      )}
      {lines[0].points.map((p, i) => (
        <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-muted)">
          {shortMonth(p.label, locale)}
        </text>
      ))}
    </svg>
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
    <div className="dash-lists">
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
    </div>
  );
}

/**
 * The leader's dashboard: figures, two charts and three short lists for this system (the whole
 * church for Central Administration). The server answers only for leaders and only with what their
 * letters allow, so anyone else — or a failure — gets the plain figures instead.
 */
export function LeaderDashboard({ systemId, systemName }: { systemId: string; systemName: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { personName } = useFrontDoor();
  const { data, loading } = useLoad(() => fetchDashboard(systemId), `dash|${systemId}`);
  if (loading) return null;
  if (!data) return <GlanceDashboard systemId={systemId} />;

  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const second = data.second;
  const lines: Line[] = (second?.series ?? [])
    .filter((s) => s.points.length > 1)
    .map((s) => ({
      key: s.key,
      points: s.points,
      color: s.key === 'spent' ? 'var(--warn)' : s.key === 'giving' ? 'var(--success)' : 'var(--accent)',
      text: t(`door.dash.legend.${s.key}` as 'door.dash.legend.income'),
    }));
  const hasSecond = lines.some((l) => l.points.some((p) => p.value > 0));
  const secondTitle = t(second?.kind === 'giving' ? 'door.dash.giving.title' : 'door.dash.money.title');
  const attTitle = t('door.dash.attendance.title');
  const hasAtt = !!data.attendance && data.attendance.some((p) => p.value > 0);

  return (
    <div className="dash">
      <div className="dash-greet">
        <div>
          <h2>{t('door.dash.welcome', { name: personName || systemName })}</h2>
          <p className="muted">{t('door.dash.sub', { system: systemName })}</p>
        </div>
        <span className="dash-date-now">{date}</span>
      </div>
      <ul className="dash-kpis">
        {data.kpis.map((k) => (
          <li key={k.key}>
            <KpiCard kpi={k} />
          </li>
        ))}
      </ul>
      {(data.attendance || second) && (
        <div className="dash-charts">
          {data.attendance && (
            <Panel title={attTitle}>
              <span className="dash-range">{t('door.dash.last6')}</span>
              {hasAtt ? <AttendanceChart points={data.attendance} title={attTitle} /> : <p className="muted">{t('door.dash.noData')}</p>}
            </Panel>
          )}
          {second && (
            <Panel title={secondTitle}>
              <span className="dash-range">{t('door.dash.last6')}</span>
              {hasSecond ? (
                <>
                  <LineChart lines={lines} title={secondTitle} money />
                  {lines.length > 1 && (
                    <ul className="dash-legend">
                      {lines.map((l) => (
                        <li key={l.key}>
                          <span className="dash-dot" style={{ background: l.color }} aria-hidden="true" />
                          {l.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="muted">{t('door.dash.noData')}</p>
              )}
            </Panel>
          )}
        </div>
      )}
      <Lists data={data} systemId={systemId} />
    </div>
  );
}
