import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { CARD_WIDTH_DEFAULT } from './coverflowConfig';
import {
  cardPose,
  clampIndex,
  indexAfterDrag,
} from '../../lib/coverflow';
import type { PersonRecordRow } from '../../services/personRecordSummary';

/**
 * Coverflow of the person's record sections: the centre card faces you, the
 * rest fan out either side. Arrow keys, buttons, dots, swipe/drag, or clicking
 * a side card all move it; the centre card opens that section.
 */
export function SectionCoverflow({
  rows,
  activeKey,
  onOpen,
}: {
  rows: PersonRecordRow[];
  /** Section currently shown below (starts the carousel on that card). */
  activeKey?: string;
  onOpen: (key: string) => void;
}) {
  const [index, setIndex] = useState(() =>
    clampIndex(
      Math.max(
        0,
        rows.findIndex((r) => r.key === activeKey),
      ),
      rows.length,
    ),
  );
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(CARD_WIDTH_DEFAULT);

  // Smaller cards on narrow screens.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () =>
      setCardWidth(el.clientWidth < 520 ? 210 : CARD_WIDTH_DEFAULT);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (next: number) => setIndex(clampIndex(next, rows.length));
  const current = rows[index];

  return (
    <section
      className="coverflow"
      aria-roledescription="carousel"
      aria-label="Record sections"
    >
      <div
        className="cf-stage"
        ref={stageRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(index + 1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(index - 1);
          } else if (e.key === 'Home') {
            go(0);
          } else if (e.key === 'End') {
            go(rows.length - 1);
          } else if (e.key === 'Enter' && current && !current.restricted) {
            onOpen(current.key);
          }
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, moved: false };
        }}
        onPointerMove={(e) => {
          if (drag.current && Math.abs(e.clientX - drag.current.x) > 6) {
            drag.current.moved = true;
          }
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          if (drag.current.moved) setIndex((i) => indexAfterDrag(i, rows.length, dx));
          // keep `moved` until the click that follows has been handled
          window.setTimeout(() => {
            drag.current = null;
          }, 0);
        }}
      >
        {rows.map((row, i) => {
          const offset = i - index;
          const pose = cardPose(offset, cardWidth);
          const isCentre = offset === 0;
          return (
            <article
              key={row.key}
              className={`cf-card${isCentre ? ' centre' : ''}${row.restricted ? ' restricted' : ''}`}
              style={{
                width: cardWidth,
                marginLeft: -cardWidth / 2,
                transform: pose.transform,
                opacity: pose.opacity,
                zIndex: pose.zIndex,
                pointerEvents: pose.hidden ? 'none' : 'auto',
              }}
              aria-hidden={!isCentre}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${rows.length}: ${row.label}`}
              onClick={() => {
                if (drag.current?.moved) return;
                if (!isCentre) go(i);
              }}
            >
              <header className="cf-card-head">
                <span className="cf-num">{String(i + 1).padStart(2, '0')}</span>
                <h4>{row.label}</h4>
                {row.restricted ? <Icon name="lock" size={14} /> : null}
              </header>
              <div className="cf-card-body">
                {row.restricted ? (
                  <p className="muted">{row.restrictedReason}</p>
                ) : row.empty ? (
                  <p className="muted">Nothing on file</p>
                ) : (
                  <ul>
                    {row.lines.map((line, k) => (
                      <li key={`${k}-${line}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
              {isCentre && !row.restricted ? (
                <button
                  type="button"
                  className="btn sm cf-open"
                  onClick={() => onOpen(row.key)}
                >
                  Open section
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="cf-nav">
        <button
          type="button"
          className="dg-pg"
          aria-label="Previous section"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          ‹
        </button>
        <div className="cf-dots" role="tablist" aria-label="Choose section">
          {rows.map((r, i) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={r.label}
              title={r.label}
              className={`cf-dot${i === index ? ' active' : ''}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="dg-pg"
          aria-label="Next section"
          disabled={index === rows.length - 1}
          onClick={() => go(index + 1)}
        >
          ›
        </button>
      </div>
    </section>
  );
}
