import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FieldShell } from './Field';

export type SearchOption = { value: string; label: string; hint?: string };

/**
 * A choice among many: type to narrow the list, pick with the mouse or the arrow keys and Enter.
 * `empty` adds a first choice with the value '' (for example "All systems").
 */
export function SearchSelect({ label, name, value, options, onChange, empty, placeholder, none }: {
  label: string;
  name: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  empty?: string;
  placeholder?: string;
  none?: string;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [at, setAt] = useState(0);
  const all = useMemo(() => (empty !== undefined ? [{ value: '', label: empty }, ...options] : options), [empty, options]);
  const current = all.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    return q ? all.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : all;
  }, [all, text]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (o: SearchOption) => {
    onChange(o.value);
    setOpen(false);
    setText('');
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setAt((n) => Math.min(n + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((n) => Math.max(n - 1, 0));
    } else if (e.key === 'Enter' && open && shown[at]) {
      e.preventDefault();
      pick(shown[at]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setText('');
    }
  };

  return (
    <FieldShell label={label} htmlFor={`${id}-in`}>
      <div className="searchselect" ref={box}>
        <input
          id={`${id}-in`}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? text : current?.label ?? ''}
          placeholder={open ? placeholder : undefined}
          onFocus={() => {
            setOpen(true);
            setAt(Math.max(0, shown.findIndex((o) => o.value === value)));
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setAt(0);
          }}
          onKeyDown={key}
        />
        {open && (
          <ul className="searchselect-list" id={`${id}-list`} role="listbox">
            {shown.length === 0 && <li className="searchselect-none">{none ?? '—'}</li>}
            {shown.map((o, i) => (
              <li key={o.value || '__all'} role="option" aria-selected={o.value === value} className={`searchselect-opt${i === at ? ' on' : ''}${o.value === value ? ' chosen' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setAt(i)}>
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}
