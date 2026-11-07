import { useId } from 'react';
import { Icon } from '../../components/ui/Icon';

/** The one search field every list uses: a magnifier, a clear button, and a label for screen readers. */
export function SearchBox({
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  clearLabel: string;
}) {
  const id = useId();
  return (
    <div className="searchbox">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" size={16} className="searchbox-icon" />
      <input id={id} type="search" className="searchbox-input" value={value} placeholder={placeholder ?? label} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="searchbox-clear" aria-label={clearLabel} onClick={() => onChange('')}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

/** Does every word typed appear somewhere in these fields? Capitals and accents do not matter. */
export function matchesText(query: string, ...fields: Array<string | null | undefined>): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(fields.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}
