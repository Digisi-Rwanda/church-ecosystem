import { useEffect, useState } from 'react';
import { fetchPeople, type DirectoryPerson } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';

/** Find a person by name or code and pick them. The server decides who may be found. */
export function PersonPicker({ label, name, onPick }: { label: string; name: string; onPick: (p: DirectoryPerson) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<DirectoryPerson[] | null>(null);
  const [error, setError] = useState('');
  /** Searches as the person types (after two letters), so there is no button to find and press. */
  useEffect(() => {
    const word = q.trim();
    if (word.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      fetchPeople({ q: word })
        .then((rows) => {
          if (live) {
            setError('');
            setFound(rows);
          }
        })
        .catch(() => live && setError(t('door.people.error')));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, t]);
  const shown = q.trim().length < 2 ? null : found;
  return (
    <div className="door-picker">
      <TextField
        label={label}
        name={name}
        value={q}
        placeholder={t('door.gov.pick.search')}
        hint={t('door.gov.pick.hint')}
        onChange={(e) => setQ(e.target.value)}
      />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      {shown && shown.length === 0 && <p className="muted">{t('door.gov.pick.none')}</p>}
      {shown && shown.length > 0 && (
        <ul className="door-list">
          {shown.slice(0, 8).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  onPick(p);
                  setFound(null);
                  setQ('');
                }}
              >
                {p.fullName}
                {p.memberCode ? ` · ${p.memberCode}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
