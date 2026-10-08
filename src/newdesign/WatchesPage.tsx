import { useState, type FormEvent } from 'react';
import { addWatchMember, closeWatch, createWatch, fetchWatches, removeWatchMember, type DirectoryPerson } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { byWeekday, caringErrorKey, WEEK_ORDER } from './caring';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The Intercessors' prayer roster: weekly watches and who keeps each one. Everyone who can enter may read it. */
export function WatchesPage() {
  const t = useT();
  const list = useLoad(fetchWatches, 'caring-watches');
  const [form, setForm] = useState(false);
  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState('5');
  const [start, setStart] = useState('05:00');
  const [end, setEnd] = useState('06:00');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      list.reload();
    } catch (err) {
      setError(t(caringErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('door.caring.err.input'));
    void run(() => createWatch({ name: name.trim(), weekday: Number(weekday), startTime: start, endTime: end }), () => { setForm(false); setName(''); });
  };
  const canWrite = !!list.data?.canWrite;
  return (
    <section className="door-block" aria-labelledby="door-watches-title">
      <div>
        <PageHeader id="door-watches-title" title={t('door.own.watches')} />
        <p className="muted">{t('door.caring.watches.intro')}</p>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      {canWrite && !form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.caring.watches.new')}</button>
        </div>
      )}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.caring.watches.new')}</h3>
          <TextField label={t('door.caring.watches.name')} name="w-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <SelectField label={t('door.caring.watches.day')} name="w-day" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEK_ORDER.map((d) => (
              <option key={d} value={d}>{t(`door.caring.weekday.${d}` as 'door.caring.weekday.0')}</option>
            ))}
          </SelectField>
          <TextField label={t('door.caring.watches.from')} name="w-from" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField label={t('door.caring.watches.to')} name="w-to" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          <div className="door-row">
            <button type="submit" className="btn">{t('door.caring.watches.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.watches.length === 0 ? (
          <EmptyState title={t('door.caring.watches.none')} detail={t('door.caring.watches.noneDetail')} />
        ) : (
          byWeekday(list.data?.watches ?? []).map((day) => (
            <div key={day.weekday}>
              <h3>{t(`door.caring.weekday.${day.weekday}` as 'door.caring.weekday.0')}</h3>
              <ul className="door-notices">
                {day.items.map((w) => (
                  <li key={w.id} className="panel door-notice">
                    <div className="door-notice-main">
                      <strong>{w.name} · {w.startTime}–{w.endTime}</strong>
                      <p className="muted">{w.members.length === 0 ? t('door.caring.watches.nobody') : w.members.map((m) => m.name).join(', ')}</p>
                      {canWrite && (
                        <>
                          <ul className="door-chips">
                            {w.members.map((m) => (
                              <li key={m.personId}>
                                <button type="button" className="door-chip" onClick={() => void run(() => removeWatchMember(w.id, m.personId))} aria-label={t('door.work.form.removeHelper', { name: m.name })}>{m.name} ×</button>
                              </li>
                            ))}
                          </ul>
                          <PersonPicker label={t('door.caring.watches.add')} name={`w-add-${w.id}`} onPick={(p: DirectoryPerson) => void run(() => addWatchMember(w.id, p.id))} />
                          <button type="button" className="btn ghost" onClick={() => void run(() => closeWatch(w.id))}>{t('door.caring.watches.close')}</button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </LoadState>
    </section>
  );
}
