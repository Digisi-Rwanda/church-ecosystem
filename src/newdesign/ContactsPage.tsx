import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createContact, fetchContacts, type ContactStatus, type DirectoryPerson } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { CONTACT_FILTERS, evangErrorKey } from './evangelism';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

const today = () => new Date().toISOString().slice(0, 10);

/** Evangelism contacts: people met through outreach, followed up until they join. */
export function ContactsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const [filter, setFilter] = useState<'' | ContactStatus>('');
  const list = useLoad(() => fetchContacts(filter), `contacts|${filter}`);
  const [form, setForm] = useState(false);
  const [v, setV] = useState({ fullName: '', phone: '', howMet: '', metOn: today(), note: '' });
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const reset = () => { setForm(false); setV({ fullName: '', phone: '', howMet: '', metOn: today(), note: '' }); setWho(null); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.fullName.trim()) return setError(t('door.caring.err.input'));
    setError('');
    try {
      await createContact({ fullName: v.fullName.trim(), phone: v.phone.trim() || null, howMet: v.howMet.trim() || null, metOn: v.metOn || null, assignedToId: who?.id ?? null, note: v.note.trim() || null });
      reset();
      list.reload();
    } catch (err) {
      setError(t(evangErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-contacts-title">
      <div>
        <PageHeader id="door-contacts-title" title={t('door.own.contacts')} />
        <p className="muted">{t('door.evang.contacts.intro')}</p>
      </div>
      <ul className="door-filters">
        {CONTACT_FILTERS.map((f) => (
          <li key={f || 'all'}>
            <button type="button" className={`door-chip${filter === f ? ' warn' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f ? t(`door.evang.status.${f}` as 'door.evang.status.NEW') : t('door.evang.filter.all')}
            </button>
          </li>
        ))}
      </ul>
      {list.data?.canWrite && !form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.evang.contacts.new')}</button>
        </div>
      )}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.evang.contacts.new')}</h3>
          <TextField label={t('door.evang.contacts.name')} name="e-name" value={v.fullName} maxLength={80} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
          <TextField label={t('door.evang.contacts.phone')} name="e-phone" inputMode="tel" value={v.phone} maxLength={20} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <TextField label={t('door.evang.contacts.howMet')} name="e-how" value={v.howMet} maxLength={120} onChange={(e) => setV({ ...v, howMet: e.target.value })} />
          <TextField label={t('door.evang.contacts.metOn')} name="e-met" type="date" value={v.metOn} max={today()} onChange={(e) => setV({ ...v, metOn: e.target.value })} />
          <p className="muted">{who ? t('door.evang.contacts.assignedTo', { name: who.name }) : t('door.evang.contacts.unassigned')}</p>
          <PersonPicker label={t('door.evang.contacts.pickOwner')} name="e-owner" onPick={(p: DirectoryPerson) => setWho({ id: p.id, name: p.fullName })} />
          <TextAreaField label={t('door.evang.contacts.note')} name="e-note" rows={2} value={v.note} maxLength={1000} onChange={(e) => setV({ ...v, note: e.target.value })} />
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row">
            <button type="submit" className="btn">{t('door.evang.contacts.save')}</button>
            <button type="button" className="btn ghost" onClick={reset}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.contacts.length === 0 ? (
          <EmptyState title={t('door.evang.contacts.none')} detail={t('door.evang.contacts.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {(list.data?.contacts ?? []).map((c) => (
              <li key={c.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong><Link to={`/s/${systemId}/contacts/${c.id}`}>{c.fullName}</Link></strong>
                    <span className="door-chip">{t(`door.evang.status.${c.status}` as 'door.evang.status.NEW')}</span>
                    {c.overdue && <span className="door-chip warn">{t('door.evang.overdue')}</span>}
                  </div>
                  <p className="muted">{[c.howMet, t('door.evang.contacts.metOnDay', { day: fmt(c.metOn) }), c.assignedName && t('door.evang.contacts.assignedTo', { name: c.assignedName })].filter(Boolean).join(' · ')}</p>
                  {c.nextOn && <p className="muted">{t('door.evang.contacts.next', { day: fmt(c.nextOn) })}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
