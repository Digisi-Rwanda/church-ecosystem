import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assignContact, fetchContact, followUpContact, setContactStatus, type ContactStatus, type DirectoryPerson } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { evangErrorKey, isOpenContact } from './evangelism';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

/** One contact: details, who looks after them, and the follow-up history. */
export function ContactPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '', contactId = '' } = useParams();
  const data = useLoad(() => fetchContact(contactId), `contact|${contactId}`);
  const [form, setForm] = useState(false);
  const [doneOn, setDoneOn] = useState(today());
  const [note, setNote] = useState('');
  const [nextOn, setNextOn] = useState('');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      data.reload();
    } catch (err) {
      setError(t(evangErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return setError(t('door.evang.followup.writeSomething'));
    void run(() => followUpContact(contactId, { doneOn, note: note.trim(), nextOn: nextOn || null }), () => { setForm(false); setNote(''); setNextOn(''); setDoneOn(today()); });
  };
  const c = data.data?.contact;
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const setStatus = (s: ContactStatus) => void run(() => setContactStatus(contactId, s));
  return (
    <section className="door-block" aria-labelledby="door-contact-title">
      <p><Link to={`/s/${systemId}/contacts`}>{t('door.evang.back')}</Link></p>
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {c && (
          <>
            <div>
              <h2 id="door-contact-title">{c.fullName} <span className="door-chip">{t(`door.evang.status.${c.status}` as 'door.evang.status.NEW')}</span></h2>
              <p className="muted">{[c.phone, c.howMet, t('door.evang.contacts.metOnDay', { day: fmt(c.metOn) })].filter(Boolean).join(' · ')}</p>
              <p className="muted">{c.assignedName ? t('door.evang.contacts.assignedTo', { name: c.assignedName }) : t('door.evang.contacts.unassigned')}</p>
              {c.note && <p>{c.note}</p>}
            </div>
            {error && <p className="door-error" role="alert">{error}</p>}
            {c.canWrite && (
              <div className="door-row">
                {isOpenContact(c.status) && !form && <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.evang.followup.new')}</button>}
                {isOpenContact(c.status) && <button type="button" className="btn ghost" onClick={() => setStatus('JOINED')}>{t('door.evang.markJoined')}</button>}
                {isOpenContact(c.status) && <button type="button" className="btn ghost" onClick={() => setStatus('CLOSED')}>{t('door.evang.markClosed')}</button>}
                {!isOpenContact(c.status) && <button type="button" className="btn ghost" onClick={() => setStatus('FOLLOWING')}>{t('door.evang.reopen')}</button>}
              </div>
            )}
            {c.canWrite && <PersonPicker label={t('door.evang.contacts.pickOwner')} name="c-owner" onPick={(p: DirectoryPerson) => void run(() => assignContact(contactId, p.id))} />}
            {form && (
              <form className="panel door-form" onSubmit={submit} noValidate>
                <h3>{t('door.evang.followup.new')}</h3>
                <TextField label={t('door.evang.followup.day')} name="f-day" type="date" value={doneOn} max={today()} onChange={(e) => setDoneOn(e.target.value)} />
                <TextAreaField label={t('door.evang.followup.note')} name="f-note" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
                <TextField label={t('door.evang.followup.next')} name="f-next" type="date" value={nextOn} min={doneOn} onChange={(e) => setNextOn(e.target.value)} />
                <div className="door-row">
                  <button type="submit" className="btn">{t('door.evang.followup.save')}</button>
                  <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
                </div>
              </form>
            )}
            <div className="panel">
              <h3>{t('door.evang.followup.title')}</h3>
              {data.data!.followUps.length === 0 ? (
                <EmptyState title={t('door.evang.followup.none')} />
              ) : (
                <ul className="door-list">
                  {data.data!.followUps.map((f) => (
                    <li key={f.id}>
                      <strong>{fmt(f.doneOn)}</strong> · {f.byName}
                      <p>{f.note}</p>
                      {f.nextOn && <p className="muted">{t('door.evang.contacts.next', { day: fmt(f.nextOn) })}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}
