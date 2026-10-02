import { useEffect, useRef, useState } from 'react';
import {
  clampIndex,
  focusAfterDrag,
  windowStart,
} from '../../lib/carousel';
import type { PersonRecordRow } from '../../services/personRecordSummary';
import { Icon } from '../ui/Icon';

const GAP = 16; // px, must match .sc-track gap

/**
 * The record sections as cards, three at a time with the middle one in focus
 * (at the first / last card the focus moves to that end card). Scroll with
 * the arrows, arrow keys, trackpad / shift+wheel, swipe, dots, or by
 * clicking a side card. The focused card opens its section.
 */
export function SectionCards({
  rows,
  activeKey,
  onOpen,
}: {
  rows: PersonRecordRow[];
  /** Section currently open above. */
  activeKey?: string;
  onOpen: (key: string) => void;
}) {
  const [focus, setFocus] = useState(0);
  const [size, setSize] = useState(3);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const wheel = useRef(0);

  // One card at a time on narrow screens.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth < 640 ? 1 : 3);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (next: number) => setFocus(clampIndex(next, rows.length));
  const start = windowStart(focus, rows.length, size);
  const cardWidth = `calc((100% - ${GAP * (size - 1)}px) / ${size})`;
  const shift = `calc(${start} * ((100% + ${GAP}px) / ${size}) * -1)`;

  return (
    <section className="sc" aria-label="All sections">
      <div className="sc-top">
        <h3 className="sc-title">All sections</h3>
        <span className="muted sc-count">
          {focus + 1} / {rows.length}
        </span>
      </div>

      <div className="sc-row">
        <button
          type="button"
          className="dg-pg"
          aria-label="Previous section"
          disabled={focus === 0}
          onClick={() => go(focus - 1)}
        >
          ‹
        </button>

        <div
          className="sc-viewport"
          ref={viewportRef}
          tabIndex={0}
          aria-roledescription="carousel"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              go(focus + 1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              go(focus - 1);
            } else if (e.key === 'Home') go(0);
            else if (e.key === 'End') go(rows.length - 1);
            else if (e.key === 'Enter') {
              const r = rows[focus];
              if (r && !r.restricted) onOpen(r.key);
            }
          }}
          onWheel={(e) => {
            // Only sideways scrolling (or shift+wheel); vertical scroll stays the page's.
            const dx =
              Math.abs(e.deltaX) > Math.abs(e.deltaY)
                ? e.deltaX
                : e.shiftKey
                  ? e.deltaY
                  : 0;
            if (dx === 0) return;
            wheel.current += dx;
            if (Math.abs(wheel.current) >= 60) {
              go(focus + (wheel.current > 0 ? 1 : -1));
              wheel.current = 0;
            }
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, moved: false };
          }}
          onPointerMove={(e) => {
            if (drag.current && Math.abs(e.clientX - drag.current.x) > 8) {
              drag.current.moved = true;
            }
          }}
          onPointerUp={(e) => {
            if (!drag.current) return;
            if (drag.current.moved) {
              setFocus((f) =>
                focusAfterDrag(f, rows.length, e.clientX - drag.current!.x),
              );
            }
            window.setTimeout(() => {
              drag.current = null;
            }, 0);
          }}
        >
          <div className="sc-track" style={{ transform: `translateX(${shift})` }}>
            {rows.map((row, i) => {
              const inWindow = i >= start && i < start + size;
              const focused = i === focus;
              const isOpen = row.key === activeKey;
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`sc-card${focused ? ' focus' : ''}${row.restricted ? ' restricted' : ''}`}
                  style={{ flexBasis: cardWidth }}
                  tabIndex={inWindow ? 0 : -1}
                  aria-hidden={!inWindow}
                  aria-label={`${i + 1} of ${rows.length}: ${row.label}`}
                  onClick={() => {
                    if (drag.current?.moved) return;
                    if (!focused) go(i);
                    else if (!row.restricted) onOpen(row.key);
                  }}
                >
                  <span className="sc-head">
                    <span className="sc-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="sc-label">{row.label}</span>
                    {row.restricted ? <Icon name="lock" size={13} /> : null}
                  </span>
                  <span className="sc-body">
                    {row.restricted ? (
                      <span className="muted">{row.restrictedReason}</span>
                    ) : row.empty ? (
                      <span className="muted">Nothing on file</span>
                    ) : (
                      row.lines.map((line, k) => (
                        <span key={`${k}-${line}`} className="sc-line">
                          {line}
                        </span>
                      ))
                    )}
                  </span>
                  {row.restricted ? null : (
                    <span className="sc-open">
                      {isOpen ? 'Open above ✓' : focused ? 'Open →' : 'View'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="dg-pg"
          aria-label="Next section"
          disabled={focus === rows.length - 1}
          onClick={() => go(focus + 1)}
        >
          ›
        </button>
      </div>

      <div className="sc-dots" role="tablist" aria-label="Choose section">
        {rows.map((r, i) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={i === focus}
            aria-label={r.label}
            title={r.label}
            className={`sc-dot${i === focus ? ' active' : ''}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </section>
  );
}
