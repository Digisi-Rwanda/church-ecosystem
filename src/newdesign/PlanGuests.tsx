import { useState } from 'react';
import { addGuest, cancelMyRegistration, markAttended, registerMember, registerMyself, removeGuest, setRegistration, type PlanDetail, type PlanRegistration } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { PersonPicker } from './PersonPicker';
import { QrCode } from './QrCode';
import { publicCheckinUrl, publicEventUrl } from './plans';
import { ListRow, RowList } from './kit';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;

/** Copies an address; the button says so for a moment. */
function CopyLink({ value }: { value: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn secondary sm" onClick={() => { void navigator.clipboard?.writeText(value).then(() => setDone(true)).catch(() => setDone(false)); }}>
      {done ? t('door.plan.guests.copied') : t('door.plan.guests.copy')}
    </button>
  );
}

/** Open or close, set the places, and share the link and the QR code (or a Google Form) for registration. */
function ShareBox({ p, r, run }: { p: PlanDetail; r: PlanRegistration; run: Run }) {
  const t = useT();
  const [cap, setCap] = useState('');
  const [form, setForm] = useState('');
  const link = r.publicToken ? publicEventUrl(r.publicToken) : '';
  const checkin = r.publicToken ? publicCheckinUrl(r.publicToken) : '';
  return (
    <div className="door-guide-box">
      <div className="door-row">
        <button type="button" className="btn secondary sm" onClick={() => void run(() => setRegistration(p.id, { open: !r.open }))}>
          {r.open ? t('door.plan.guests.close') : t('door.plan.guests.openGo')}
        </button>
        <TextField label={t('door.plan.guests.capacity')} name="p-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} />
        <button type="button" className="btn secondary sm" disabled={!cap} onClick={() => void run(() => setRegistration(p.id, { capacity: Number(cap) }), () => setCap(''))}>
          {t('door.plan.guests.capacityGo')}
        </button>
      </div>
      <h4>{t('door.plan.guests.share')}</h4>
      {!link ? (
        <button type="button" className="btn primary sm" onClick={() => void run(() => setRegistration(p.id, { publicLink: true }))}>{t('door.plan.guests.linkCreate')}</button>
      ) : (
        <>
          <p className="muted">{t('door.plan.guests.shareHelp')}</p>
          <div className="door-row">
            <input className="door-link" readOnly aria-label={t('door.plan.guests.link')} value={link} onFocus={(e) => e.currentTarget.select()} />
            <CopyLink value={link} />
            <button type="button" className="btn ghost sm" onClick={() => void run(() => setRegistration(p.id, { publicLink: false }))}>{t('door.plan.guests.linkOff')}</button>
          </div>
          <QrCode value={r.formUrl ?? link} alt={t('door.plan.guests.qrAlt')} />
        </>
      )}
      <TextField label={t('door.plan.guests.form')} name="p-form" inputMode="url" value={form || r.formUrl || ''} onChange={(e) => setForm(e.target.value)} />
      <p className="muted">{r.formUrl ? t('door.plan.guests.formOn') : t('door.plan.guests.formHelp')}</p>
      <div className="door-row">
        <button type="button" className="btn secondary sm" disabled={!form.trim()} onClick={() => void run(() => setRegistration(p.id, { formUrl: form.trim() }), () => setForm(''))}>{t('door.plan.guests.formSave')}</button>
        {r.formUrl && <button type="button" className="btn ghost sm" onClick={() => void run(() => setRegistration(p.id, { formUrl: null }), () => setForm(''))}>{t('door.plan.guests.formClear')}</button>}
      </div>
      {link && (
        <>
          <h4>{t('door.plan.guests.checkin')}</h4>
          {r.checkinOpen ? (
            <>
              <p className="muted">{t('door.plan.guests.checkinHelp')}</p>
              <QrCode value={checkin} alt={t('door.plan.guests.checkinAlt')} />
            </>
          ) : <p className="muted">{t('door.plan.guests.checkinWait')}</p>}
        </>
      )}
    </div>
  );
}

/** An event's registration and attendance: the team registers members and guests, shares a link or a QR code, and marks who came. */
export function PlanGuests({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const r = p.registration;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  if (!r) return null;
  const team = p.canManageRegistration || p.canMarkAttendance;
  return (
    <div className="panel">
      <h3>{t('door.plan.guests.title')}</h3>
      <p className="muted">
        {r.open ? t('door.plan.guests.open') : t('door.plan.guests.closed')} · {t('door.plan.guests.count', { n: r.count })}
        {r.capacity ? ` / ${r.capacity}` : ''} · {t('door.plan.guests.came', { n: r.attended })}
      </p>
      {r.mine ? (
        <button type="button" className="btn ghost sm" onClick={() => void run(() => cancelMyRegistration(p.id))}>{t('door.plan.guests.cancelMine')}</button>
      ) : (
        r.canRegister && !team && <button type="button" className="btn primary sm" onClick={() => void run(() => registerMyself(p.id))}>{t('door.plan.guests.registerMe')}</button>
      )}
      {p.canManageRegistration && <ShareBox p={p} r={r} run={run} />}
      {team && (
        <div className="door-guide-box">
          <PersonPicker label={t('door.plan.guests.addMember')} name="p-reg-member" onPick={(m) => void run(() => registerMember(p.id, m.id))} />
          <p className="muted">{t('door.plan.guests.addGuest')}</p>
          <div className="door-row">
            <TextField label={t('door.plan.guests.name')} name="p-gname" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t('door.plan.guests.phone')} name="p-gphone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button type="button" className="btn secondary sm" disabled={!name.trim()} onClick={() => void run(() => addGuest(p.id, name.trim(), phone.trim()), () => { setName(''); setPhone(''); })}>
              {t('door.plan.guests.add')}
            </button>
          </div>
        </div>
      )}
      {r.items.length === 0 ? (
        <p className="muted">{t('door.plan.guests.none')}</p>
      ) : (
        <RowList label={t('door.plan.guests.title')}>
          {r.items.map((g) => (
            <ListRow
              key={g.id}
              avatarName={g.name}
              title={g.name}
              detail={`${t(`door.plan.guests.src.${g.source}` as const)}${g.phone ? ` · ${g.phone}` : ''}`}
              action={
                <span className="door-row">
                  {p.canMarkAttendance && (
                    <label className="door-check">
                      <input type="checkbox" checked={g.attended} onChange={(e) => void run(() => markAttended(p.id, g.id, e.target.checked))} /> {t('door.plan.guests.here')}
                    </label>
                  )}
                  {!p.canMarkAttendance && g.attended && <span className="muted">{t('door.plan.guests.here')}</span>}
                  {team && <button type="button" className="btn ghost sm" onClick={() => void run(() => removeGuest(p.id, g.id))}>{t('door.sched.unassign')}</button>}
                </span>
              }
            />
          ))}
        </RowList>
      )}
    </div>
  );
}
