import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useI18n, useT } from '../i18n/I18nContext';
import { compactNumber, roundedTopBar, shortMonth } from './charts';

/** One series of a chart: points share the same month labels. Colour is a fixed slot, never picked by rank. */
export type VizSeries = { key: string; name: string; slot: number; points: Array<{ label: string; value: number }> };

const W = 360;
const H = 176;
const L = 40;
const R = 10;
const T = 12;
const B = 24;
const PW = W - L - R;
const PH = H - T - B;

/** A tidy axis ceiling: 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceTop(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const m = max / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** The text of one hover, in the order of the legend. */
function Tip({ x, y, title, rows, right }: { x: number; y: number; title: string; rows: Array<{ slot: number; text: string }>; right: boolean }) {
  const w = 132;
  const h = 18 + rows.length * 14;
  const tx = right ? x - w - 10 : x + 10;
  const ty = Math.max(T, Math.min(y - h / 2, T + PH - h));
  return (
    <g className="dx-tip" pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={h} rx="6" />
      <text x={tx + 8} y={ty + 13} className="dx-tip-title">{title}</text>
      {rows.map((r, i) => (
        <g key={`${r.slot}${i}`}>
          <circle cx={tx + 12} cy={ty + 26 + i * 14} r="4" className={`dx-s${r.slot}`} />
          <text x={tx + 22} y={ty + 30 + i * 14}>{r.text}</text>
        </g>
      ))}
    </g>
  );
}

/**
 * Monthly bars or lines with a crosshair and a tooltip on hover or arrow keys, a legend when there are two or
 * more series, and the same numbers as a table. `money` writes values as Rwandan francs.
 */
export function MonthsChart({ series, title, kind, format }: { series: VizSeries[]; title: string; kind: 'bars' | 'lines'; format: (n: number) => string }) {
  const t = useT();
  const { locale } = useI18n();
  const id = useId();
  const [at, setAt] = useState<number | null>(null);
  const n = series[0]?.points.length ?? 0;
  const top = useMemo(() => niceTop(Math.max(...series.flatMap((s) => s.points.map((p) => p.value)), 0)), [series]);
  if (n === 0) return null;
  const slot = PW / n;
  const x = (i: number) => (kind === 'bars' ? L + slot * i + slot / 2 : L + (n === 1 ? PW / 2 : (PW * i) / (n - 1)));
  const y = (v: number) => T + PH - (Math.max(v, 0) / top) * PH;
  const ticks = [0, top / 2, top];
  const every = n > 8 ? 2 : 1;
  const group = Math.min(series.length, 3);
  const bar = Math.max(4, Math.min(26, (slot - 8) / group - 2));
  const move = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setAt((i) => Math.min((i ?? -1) + 1, n - 1));
    else if (e.key === 'ArrowLeft') setAt((i) => Math.max((i ?? n) - 1, 0));
    else if (e.key === 'Escape') setAt(null);
  };
  const label = (i: number) => shortMonth(series[0]!.points[i]!.label, locale);
  return (
    <figure className="dx-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} tabIndex={0} onKeyDown={move} onBlur={() => setAt(null)} onMouseLeave={() => setAt(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'dx-base' : 'dx-grid'} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="dx-axis">{compactNumber(v)}</text>
          </g>
        ))}
        {kind === 'bars' &&
          series.map((s, si) =>
            s.points.map((p, i) => {
              const bx = x(i) - (group * (bar + 2)) / 2 + si * (bar + 2);
              const h = Math.round(PH - (y(p.value) - T));
              return h > 0 ? <path key={`${s.key}${p.label}`} d={roundedTopBar(bx, y(p.value), bar, h)} className={`dx-s${s.slot}${at === i ? ' on' : ''}`} /> : null;
            }),
          )}
        {kind === 'lines' && series.length === 1 && (
          <path d={`${series[0]!.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')} L${x(n - 1)},${T + PH} L${x(0)},${T + PH} Z`} className={`dx-area dx-s${series[0]!.slot}`} />
        )}
        {kind === 'lines' &&
          series.map((s) => (
            <path key={s.key} d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')} className={`dx-line dx-k${s.slot}`} />
          ))}
        {series[0]!.points.map((p, i) => (i % every === 0 ? <text key={p.label} x={x(i)} y={H - 6} textAnchor="middle" className="dx-axis">{shortMonth(p.label, locale)}</text> : null))}
        {at !== null && (
          <>
            {kind === 'lines' && <line x1={x(at)} x2={x(at)} y1={T} y2={T + PH} className="dx-cross" />}
            {kind === 'lines' && series.map((s) => <circle key={s.key} cx={x(at)} cy={y(s.points[at]!.value)} r="4.5" className={`dx-dot dx-s${s.slot}`} />)}
            <Tip x={x(at)} y={T + PH / 2} title={label(at)} right={at > n / 2} rows={series.map((s) => ({ slot: s.slot, text: `${s.name}: ${format(s.points[at]!.value)}` }))} />
          </>
        )}
        {series[0]!.points.map((p, i) => (
          <rect key={`hit${p.label}`} x={L + slot * i} y={T} width={slot} height={PH + B} className="dx-hit" onMouseEnter={() => setAt(i)} onMouseMove={() => setAt(i)} onClick={() => setAt(i)} />
        ))}
      </svg>
      {series.length > 1 && (
        <ul className="dx-legend">
          {series.map((s) => (<li key={s.key}><span className={`dx-swatch dx-s${s.slot}`} aria-hidden="true" />{s.name}</li>))}
        </ul>
      )}
      <details className="dx-table">
        <summary>{t('door.dash.table')}</summary>
        <table>
          <thead>
            <tr><th scope="col" id={`${id}-m`}>{t('door.dash.month')}</th>{series.map((s) => (<th scope="col" key={s.key}>{s.name}</th>))}</tr>
          </thead>
          <tbody>
            {series[0]!.points.map((p, i) => (
              <tr key={p.label}><th scope="row">{label(i)}</th>{series.map((s) => (<td key={s.key}>{format(s.points[i]!.value)}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** A tiny trend line inside a figure card. Decorative: the value and the change are written next to it. */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const top = Math.max(...values, 1);
  const low = Math.min(...values, 0);
  const span = top - low || 1;
  const w = 84;
  const h = 26;
  const px = (i: number) => 2 + (i * (w - 4)) / (values.length - 1);
  const py = (v: number) => h - 3 - ((v - low) / span) * (h - 6);
  return (
    <svg className="dx-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(v)}`).join(' ')} />
      <circle cx={px(values.length - 1)} cy={py(values[values.length - 1]!)} r="3" />
    </svg>
  );
}

/** One horizontal bar made of parts (a 2px gap between parts), for shares of a whole or progress against a plan. */
export function SegBar({ parts, total, label }: { parts: Array<{ slot: number; value: number; name: string }>; total?: number; label: string }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  let at = 0;
  return (
    <svg className="dx-seg" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={label}>
      <rect x="0" y="0" width="100" height="10" className="dx-seg-track" />
      {sum > 0 &&
        parts.map((p) => {
          const w = Math.min(100 - at, (p.value / sum) * 100);
          const x0 = at;
          at += w;
          return w > 0 ? <rect key={p.name} x={x0} y="0" width={w} height="10" className={`dx-s${p.slot}`}><title>{`${p.name}: ${p.value}`}</title></rect> : null;
        })}
    </svg>
  );
}
