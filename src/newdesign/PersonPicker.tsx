import { useState } from 'react';
import { fetchPeople, type DirectoryPerson } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';

/** Find a person by name or code and pick them. The server decides who may be found. */
export function PersonPicker({ label, name, onPick }: { label: string; name: string; onPick: (p: DirectoryPerson) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<DirectoryPerson[] | null>(null);
  const [error, setError] = useState('');
  const search = async () => {
    setError('');
    if (!q.trim()) {
      setFound(null);
      return;
    }
    try {
      setFound(await fetchPeople({ q: q.trim() }));
    } catch {
      setError(t('door.people.error'));
    }
  };
  return (
    <div className="door-picker">
      <TextField
        label={label}
        name={name}
        value={q}
        placeholder={t('door.gov.pick.search')}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void search();
          }
        }}
      />
      <button type="button" className="btn secondary sm" onClick={() => void search()}>
        {t('door.gov.pick.go')}
      </button>
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      {found && found.length === 0 && <p className="muted">{t('door.gov.pick.none')}</p>}
      {found && found.length > 0 && (
        <ul className="door-list">
          {found.slice(0, 8).map((p) => (
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
