import { useRef, type KeyboardEvent } from 'react';

export type TabItem<K extends string> = { key: K; label: string; count?: number };

/** Sections of one page (a plan's Overview, Team, Money…). Arrow keys move between them. */
export function Tabs<K extends string>({ items, value, onChange, label }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void; label: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
    onChange(items[n].key);
    refs.current[n]?.focus();
  };
  return (
    <div className="tabs kit-tabs" role="tablist" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${it.key}`}
          className="tab"
          aria-selected={value === it.key}
          tabIndex={value === it.key ? 0 : -1}
          onClick={() => onChange(it.key)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {it.label}
          {it.count ? <span className="filter-count">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The same data shown another way (list, board, calendar). Choosing one never changes the data. */
export function Segmented<K extends string>({ items, value, onChange, label }: { items: Array<{ key: K; label: string }>; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.key} type="button" className="tab" aria-pressed={value === it.key} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
