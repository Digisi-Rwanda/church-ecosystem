import { useState, type FormEvent } from 'react';
import { fetchP360Deeds, recordP360Deed, removeP360Deed } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { p360ErrorKey } from './person360';
import { useLoad } from './useLoad';

/** Good deeds of a member, recorded by a secretary. Shows only to those who may record or read them. */
export function GoodDeeds({ personId, onChanged }: { personId: string; onChanged?: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const load = useLoad(() => fetchP360Deeds(personId), `p360-deeds|${personId}`);
  const [note, setNote] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const d = load.data;
  if (load.failed || (!load.loading && !d)) return null;
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const refresh = () => {
    load.reload();
    onChanged?.();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 3) return setError(t('door.p360.deed.short'));
    setBusy(true);
    setError('');
    try {
      await recordP360Deed(personId, { note: note.trim(), ...(day ? { day } : {}) });
      setNote('');
      setDay('');
      refresh();
    } catch (err) {
      setError(t(p360ErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await removeP360Deed(id);
      setConfirm(null);
      refresh();
    } catch {
      setError(t('door.people.actionFailed'));
    }
  };
  return (
    <section className="panel p360-deeds" aria-labelledby="p360-deeds-h">
      <h3 id="p360-deeds-h">{t('door.p360.deed.title')}</h3>
      {d && d.items.length === 0 && <p className="muted">{t('door.p360.deed.none')}</p>}
      {d && d.items.length > 0 && (
        <ul className="p360-deed-list">
          {d.items.map((i) => (
            <li key={i.id}>
              <span className="p360-deed-text"><strong>{i.note}</strong><small>{[when(i.day), i.unitName, t('door.p360.deed.by', { name: i.recordedByName })].filter(Boolean).join(' · ')}</small></span>
              {i.mine && (confirm === i.id ? (
                <>
                  <button type="button" className="btn sm danger" onClick={() => void remove(i.id)}>{t('door.p360.docs.confirm')}</button>
                  <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>{t('door.settings.cancel')}</button>
                </>
              ) : (
                <button type="button" className="btn ghost sm" onClick={() => setConfirm(i.id)}>{t('door.p360.docs.remove')}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {d?.canRecord && (
        <form className="door-form" onSubmit={submit} noValidate>
          <TextField label={t('door.p360.deed.note')} name="deed-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <TextField label={t('door.p360.deed.day')} name="deed-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row"><button type="submit" className="btn" disabled={busy}>{t('door.p360.deed.add')}</button></div>
        </form>
      )}
    </section>
  );
}
