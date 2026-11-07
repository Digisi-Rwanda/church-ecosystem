import { useT } from '../i18n/I18nContext';
import { chartBars } from './charts';

/** A small bar chart of how many came to each meeting, oldest first. Each bar is labelled for screen readers. */
export function AttendanceChart({ points, total }: { points: Array<{ label: string; value: number }>; total: number }) {
  const t = useT();
  if (points.length < 2) return null;
  const bars = chartBars(points.map((p) => p.value), Math.max(total, ...points.map((p) => p.value)), 100);
  const width = bars.length * 28;
  return (
    <figure className="door-chart">
      <figcaption>{t('door.chart.attendance')}</figcaption>
      <svg viewBox={`0 0 ${width} 120`} role="img" aria-label={t('door.chart.attendance')} preserveAspectRatio="xMidYMax meet">
        <line x1="0" y1="100" x2={width} y2="100" stroke="var(--line-strong)" />
        {bars.map((b, i) => (
          <g key={points[i].label}>
            <rect x={i * 28 + 4} y={100 - b.height} width="20" height={b.height} rx="3" fill="var(--accent)">
              <title>{`${points[i].label}: ${points[i].value}`}</title>
            </rect>
            <text x={i * 28 + 14} y={96 - b.height} textAnchor="middle" fontSize="9" fill="var(--ink-muted)">
              {points[i].value}
            </text>
            <text x={i * 28 + 14} y="113" textAnchor="middle" fontSize="8" fill="var(--ink-muted)">
              {points[i].label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
