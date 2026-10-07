import { useState, type FormEvent } from 'react';
import {
  archiveGuest, changePulpitSlot, createGuest, createPulpitSlot, fetchGuests, fetchPulpit,
  type DirectoryPerson, type GuestItem, type PulpitSlotItem,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { evangErrorKey, splitPlan } from './evangelism';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

function SlotForm({ guests, onDone, onCancel }: { guests: GuestItem[]; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [day, setDay] = useState('');
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [guestId, setGuestId] = useState('');
  const [theme, setTheme] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!day) return setError(t('door.caring.err.date'));
    setError('');
    try {
      await createPulpitSlot({ serviceOn: day, personId: guestId ? null : member?.id ?? null, guestId: guestId || null, theme: theme.trim() || null, bibleText: text.trim() || null });
      onDone();
    } catch (err) {
      setError(t(evangErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.evang.pulpit.new')}</h3>
      <TextField label={t('door.evang.pulpit.day')} name="p-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <p className="muted">{guestId ? t('door.evang.pulpit.guestChosen') : member ? t('door.evang.pulpit.preacher', { name: member.name }) : t('door.evang.pulpit.noPreacher')}</p>
      <PersonPicker label={t('door.evang.pulpit.pickMember')} name="p-member" onPick={(p: DirectoryPerson) => { setMember({ id: p.id, name: p.fullName }); setGuestId(''); }} />
      {guests.length > 0 && (
        <SelectField label={t('door.evang.pulpit.orGuest')} name="p-guest" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {guests.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </SelectField>
      )}
      <TextField label={t('door.evang.pulpit.theme')} name="p-theme" value={theme} maxLength={120} onChange={(e) => setTheme(e.target.value)} />
      <TextField label={t('door.evang.pulpit.text')} name="p-text" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
      {error && <p className="door-error" role="alert">{error}</p>}
      <div className="door-row">
        <button type="submit" className="btn">{t('door.evang.pulpit.save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('door.settings.cancel')}</button>
      </div>
    </form>
  );
}

function SlotRow({ slot, canWrite, guests, onChange }: { slot: PulpitSlotItem; canWrite: boolean; guests: GuestItem[]; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [error, setError] = useState('');
  const [swap, setSwap] = useState(false);
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setSwap(false);
      onChange();
    } catch (err) {
      setError(t(evangErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${slot.serviceOn}T00:00:00Z`));
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{day}</strong>
          {slot.status !== 'PLANNED' && <span className={`door-chip${slot.status === 'CANCELLED' ? ' warn' : ''}`}>{t(`door.evang.pulpit.status.${slot.status}` as 'door.evang.pulpit.status.DONE')}</span>}
        </div>
        <p>{slot.preacherName || t('door.evang.pulpit.noPreacher')}{slot.isGuest ? ` · ${t('door.evang.pulpit.guest')}` : ''}</p>
        <p className="muted">{[slot.theme, slot.bibleText].filter(Boolean).join(' · ')}</p>
        {error && <p className="door-error" role="alert">{error}</p>}
        {canWrite && slot.status === 'PLANNED' && (
          <div className="door-row">
            <button type="button" className="btn ghost" onClick={() => setSwap(!swap)}>{t('door.evang.pulpit.change')}</button>
            {slot.serviceOn <= today() && <button type="button" className="btn ghost" onClick={() => void run(() => changePulpitSlot(slot.id, { status: 'DONE' }))}>{t('door.evang.pulpit.markDone')}</button>}
            <button type="button" className="btn ghost" onClick={() => void run(() => changePulpitSlot(slot.id, { status: 'CANCELLED' }))}>{t('door.evang.pulpit.cancel')}</button>
          </div>
        )}
        {swap && (
          <div className="door-form">
            <PersonPicker label={t('door.evang.pulpit.pickMember')} name={`s-m-${slot.id}`} onPick={(p: DirectoryPerson) => void run(() => changePulpitSlot(slot.id, { personId: p.id, guestId: null }))} />
            {guests.length > 0 && (
              <SelectField label={t('door.evang.pulpit.orGuest')} name={`s-g-${slot.id}`} value="" onChange={(e) => e.target.value && void run(() => changePulpitSlot(slot.id, { personId: null, guestId: e.target.value }))}>
                <option value="">{t('door.gov.meeting.choose')}</option>
                {guests.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </SelectField>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function GuestsPanel({ canWrite, guests, onChange }: { canWrite: boolean; guests: GuestItem[]; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [form, setForm] = useState(false);
  const [v, setV] = useState({ name: '', church: '', phone: '', note: '' });
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError(t('door.caring.err.input'));
    setError('');
    try {
      await createGuest({ name: v.name.trim(), church: v.church.trim() || null, phone: v.phone.trim() || null, note: v.note.trim() || null });
      setForm(false);
      setV({ name: '', church: '', phone: '', note: '' });
      onChange();
    } catch (err) {
      setError(t(evangErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <div className="panel">
      <h3>{t('door.evang.guests.title')}</h3>
      {canWrite && !form && <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.evang.guests.new')}</button>}
      {form && (
        <form className="door-form" onSubmit={submit} noValidate>
          <TextField label={t('door.evang.guests.name')} name="g-name" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <TextField label={t('door.evang.guests.church')} name="g-church" value={v.church} maxLength={120} onChange={(e) => setV({ ...v, church: e.target.value })} />
          <TextField label={t('door.evang.contacts.phone')} name="g-phone" inputMode="tel" value={v.phone} maxLength={20} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <TextAreaField label={t('door.evang.contacts.note')} name="g-note" rows={2} value={v.note} maxLength={1000} onChange={(e) => setV({ ...v, note: e.target.value })} />
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row">
            <button type="submit" className="btn">{t('door.evang.guests.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      {guests.length === 0 ? (
        <EmptyState title={t('door.evang.guests.none')} />
      ) : (
        <ul className="door-list">
          {guests.map((g) => (
            <li key={g.id} className="door-row">
              <span>
                <strong>{g.name}</strong>{g.church ? ` · ${g.church}` : ''}{g.phone ? ` · ${g.phone}` : ''}
                <span className="muted"> · {t('door.evang.guests.visits', { count: String(g.visits) })}{g.lastVisitOn ? ` · ${t('door.evang.guests.last', { day: fmt(g.lastVisitOn) })}` : ''}</span>
              </span>
              {canWrite && <button type="button" className="btn ghost" onClick={() => void archiveGuest(g.id).then(onChange)}>{t('door.evang.guests.archive')}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The Pulpit: the preaching plan and guest preachers. Evangelism plans it; the Church Leader can change it. */
export function PulpitPage() {
  const t = useT();
  const plan = useLoad(fetchPulpit, 'pulpit-plan');
  const guests = useLoad(() => fetchGuests().catch(() => ({ canWrite: false, guests: [] as GuestItem[] })), 'pulpit-guests');
  const [form, setForm] = useState(false);
  const { upcoming, past } = splitPlan(plan.data?.slots ?? [], today());
  const reload = () => { plan.reload(); guests.reload(); };
  const canWrite = !!plan.data?.canWrite;
  const guestList = guests.data?.guests ?? [];
  const row = (s: PulpitSlotItem) => <SlotRow key={s.id} slot={s} canWrite={canWrite} guests={guestList} onChange={reload} />;
  return (
    <section className="door-block" aria-labelledby="door-pulpit-title">
      <div>
        <h2 id="door-pulpit-title">{t('door.own.pulpit')}</h2>
        <p className="muted">{t('door.evang.pulpit.intro')}</p>
      </div>
      {canWrite && !form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.evang.pulpit.new')}</button>
        </div>
      )}
      {form && <SlotForm guests={guestList} onDone={() => { setForm(false); reload(); }} onCancel={() => setForm(false)} />}
      <LoadState loading={plan.loading} failed={plan.failed} retry={plan.reload}>
        {plan.data && plan.data.slots.length === 0 ? (
          <EmptyState title={t('door.evang.pulpit.none')} detail={t('door.evang.pulpit.noneDetail')} />
        ) : (
          <>
            {upcoming.length > 0 && (<><h3>{t('door.evang.pulpit.upcoming')}</h3><ul className="door-notices">{upcoming.map(row)}</ul></>)}
            {past.length > 0 && (<><h3>{t('door.evang.pulpit.past')}</h3><ul className="door-notices">{past.map(row)}</ul></>)}
          </>
        )}
      </LoadState>
      {plan.data?.canSeeGuests && <GuestsPanel canWrite={canWrite} guests={guestList} onChange={reload} />}
    </section>
  );
}
