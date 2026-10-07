import { useState, type FormEvent } from 'react';
import { fetchVisits, recordVisit, type DirectoryPerson } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { caringErrorKey } from './caring';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

/** The Elderly visit log. Private: only those who may change People records here can open it. */
export function VisitsPage() {
  const t = useT();
  const { locale } = useI18n();
  const list = useLoad(fetchVisits, 'caring-visits');
  const [form, setForm] = useState(false);
  const [elder, setElder] = useState<{ id: string; name: string } | null>(null);
  const [visitors, setVisitors] = useState<Array<{ id: string; name: string }>>([]);
  const [day, setDay] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const reset = () => { setForm(false); setElder(null); setVisitors([]); setDay(today()); setNote(''); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!elder) return setError(t('door.caring.visits.chooseElder'));
    setError('');
    try {
      await recordVisit({ elderId: elder.id, visitedOn: day, visitorIds: visitors.map((v) => v.id), note: note.trim() || null });
      reset();
      list.reload();
    } catch (err) {
      setError(t(caringErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-visits-title">
      <div>
        <h2 id="door-visits-title">{t('door.own.visits')}</h2>
        <p className="muted">{t('door.caring.visits.intro')}</p>
      </div>
      {!form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.caring.visits.new')}</button>
        </div>
      )}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.caring.visits.new')}</h3>
          <p>{elder ? elder.name : t('door.caring.visits.noElder')}</p>
          <PersonPicker label={t('door.caring.visits.pickElder')} name="v-elder" onPick={(p: DirectoryPerson) => setElder({ id: p.id, name: p.fullName })} />
          <TextField label={t('door.caring.visits.day')} name="v-day" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
          {visitors.length > 0 && (
            <ul className="door-chips">
              {visitors.map((v) => (
                <li key={v.id}>
                  <button type="button" className="door-chip" onClick={() => setVisitors(visitors.filter((x) => x.id !== v.id))} aria-label={t('door.work.form.removeHelper', { name: v.name })}>{v.name} ×</button>
                </li>
              ))}
            </ul>
          )}
          <PersonPicker label={t('door.caring.visits.pickVisitor')} name="v-visitor" onPick={(p: DirectoryPerson) => !visitors.some((v) => v.id === p.id) && visitors.length < 10 && setVisitors([...visitors, { id: p.id, name: p.fullName }])} />
          <TextAreaField label={t('door.caring.visits.note')} name="v-note" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row">
            <button type="submit" className="btn">{t('door.caring.visits.save')}</button>
            <button type="button" className="btn ghost" onClick={reset}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.visits.length === 0 ? (
          <EmptyState title={t('door.caring.visits.none')} detail={t('door.caring.visits.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {(list.data?.visits ?? []).map((v) => (
              <li key={v.id} className="panel door-notice">
                <div className="door-notice-main">
                  <strong>{v.elderName}</strong>
                  <p className="muted">{fmt(v.visitedOn)}{v.visitorNames.length > 0 ? ` · ${t('door.caring.visits.by', { names: v.visitorNames.join(', ') })}` : ''}</p>
                  {v.note && <p>{v.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
