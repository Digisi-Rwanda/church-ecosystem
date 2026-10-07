import { Link } from 'react-router-dom';
import { fetchGlance, type GlanceSeries, type GlanceTile } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { chartBars, compactNumber, roundedTopBar, shortMonth } from './charts';
import { formatRwf } from './money';
import { useLoad } from './useLoad';

const BAR = 22;
const STEP = 36;
const FLOOR = 104;

export function MonthChart({ series, title }: { series: GlanceSeries; title: string }) {
  const { locale } = useI18n();
  const top = Math.max(...series.points.map((p) => p.value), 1);
  const bars = chartBars(series.points.map((p) => p.value), top, 80);
  const width = bars.length * STEP;
  const show = (n: number) => (series.format === 'rwf' ? formatRwf(n) : String(n));
  return (
    <figure className="door-chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${width} 124`} role="img" aria-label={title} preserveAspectRatio="xMidYMax meet">
        <line x1="0" y1={FLOOR} x2={width} y2={FLOOR} stroke="var(--line-strong)" />
        {bars.map((b, i) => {
          const p = series.points[i];
          const x = i * STEP + (STEP - BAR) / 2;
          return (
            <g key={p.label}>
              {b.height > 0 && (
                <path d={roundedTopBar(x, FLOOR - b.height, BAR, b.height)} fill="var(--accent)">
                  <title>{`${shortMonth(p.label, locale)}: ${show(p.value)}`}</title>
                </path>
              )}
              <text x={i * STEP + STEP / 2} y={FLOOR - b.height - 4} textAnchor="middle" fontSize="9" fill="var(--ink-muted)">
                {b.value > 0 ? (series.format === 'rwf' ? compactNumber(b.value) : b.value) : ''}
              </text>
              <text x={i * STEP + STEP / 2} y="118" textAnchor="middle" fontSize="9" fill="var(--ink-muted)">
                {shortMonth(p.label, locale)}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="door-chart-table">
        <summary>{title}</summary>
        <table className="door-chart-rows">
          <tbody>
            {series.points.map((p) => (
              <tr key={p.label}>
                <th scope="row">{shortMonth(p.label, locale)}</th>
                <td>{show(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Tile({ tile, label }: { tile: GlanceTile; label: string }) {
  const value = tile.format === 'rwf' ? formatRwf(tile.value) : String(tile.value);
  const body = (
    <>
      <span className="door-stat-label">{label}</span>
      <strong className="door-stat-value">{value}</strong>
    </>
  );
  const cls = `panel door-stat${tile.tone === 'warn' ? ' warn' : ''}`;
  return tile.href ? (
    <Link className={cls} to={tile.href}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * The figures and small charts at the top of a Home. The server sends only what this person's
 * letters allow; if it sends nothing, or fails, the Home simply carries on without a dashboard.
 */
export function GlanceDashboard({ systemId }: { systemId: string }) {
  const t = useT();
  const { data } = useLoad(() => fetchGlance(systemId), `glance|${systemId}`);
  if (!data || (data.tiles.length === 0 && data.series.length === 0)) return null;
  const charts = data.series.filter((s) => s.points.some((p) => p.value > 0));
  return (
    <section className="door-glance" aria-label={t('door.glance.title')}>
      <ul className="door-stats">
        {data.tiles.map((x) => (
          <li key={x.key}>
            <Tile tile={x} label={t(`door.glance.${x.key}` as 'door.glance.work.open')} />
          </li>
        ))}
      </ul>
      {charts.length > 0 && (
        <div className="door-charts">
          {charts.map((s) => (
            <MonthChart key={s.key} series={s} title={t(`door.glance.chart.${s.key}` as 'door.glance.chart.money.income')} />
          ))}
        </div>
      )}
    </section>
  );
}
