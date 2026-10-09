import { useState } from 'react';
import { addGuest, cancelMyRegistration, markAttended, registerMyself, removeGuest, setRegistration, type PlanDetail } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { publicEventUrl } from './plans';
import { ListRow, RowList } from './kit';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;

/** An event's registration and attendance: members register themselves, the team adds guests and marks who came. */
export function PlanGuests({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const r = p.registration;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cap, setCap] = useState('');
  if (!r) return null;
  const link = r.publicToken ? publicEventUrl(r.publicToken) : '';
  return (
    <div className="panel">
      <h3>{t('door.plan.guests.title')}</h3>
      <p className="muted">
        {r.open ? t('door.plan.guests.open') : t('door.plan.guests.closed')} · {t('door.plan.guests.count', { n: r.count })}
        {r.capacity ? ` / ${r.capacity}` : ''} · {t('door.plan.guests.came', { n: r.attended })}
      </p>
      {r.mine ? (
        <button type="button" className="btn ghost sm" onClick={() => void run(() => cancelMyRegistration(p.id))}>
          {t('door.plan.guests.cancelMine')}
        </button>
      ) : (
        r.canRegister && (
          <button type="button" className="btn primary sm" onClick={() => void run(() => registerMyself(p.id))}>
            {t('door.plan.guests.registerMe')}
          </button>
        )
      )}
      {p.canManageRegistration && (
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
          <div className="door-row">
            <button type="button" className="btn secondary sm" onClick={() => void run(() => setRegistration(p.id, { publicLink: !r.publicToken }))}>
              {r.publicToken ? t('door.plan.guests.linkOff') : t('door.plan.guests.linkOn')}
            </button>
            {link && <input className="door-link" readOnly aria-label={t('door.plan.guests.link')} value={link} onFocus={(e) => e.currentTarget.select()} />}
          </div>
          {link && <p className="muted">{t('door.plan.guests.linkHelp')}</p>}
        </div>
      )}
      {(p.canManageRegistration || p.canMarkAttendance) && (
        <div className="door-row">
          <TextField label={t('door.plan.guests.name')} name="p-gname" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label={t('door.plan.guests.phone')} name="p-gphone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button type="button" className="btn secondary sm" disabled={!name.trim()} onClick={() => void run(() => addGuest(p.id, name.trim(), phone.trim()), () => { setName(''); setPhone(''); })}>
            {t('door.plan.guests.add')}
          </button>
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
                  {(p.canManageRegistration || p.canMarkAttendance) && (
                    <button type="button" className="btn ghost sm" onClick={() => void run(() => removeGuest(p.id, g.id))}>
                      {t('door.sched.unassign')}
                    </button>
                  )}
                </span>
              }
            />
          ))}
        </RowList>
      )}
    </div>
  );
}
