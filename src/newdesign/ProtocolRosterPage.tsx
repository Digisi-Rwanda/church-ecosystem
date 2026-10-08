import { useParams } from 'react-router-dom';
import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import {
  addProtocolMember, fetchProtocolRoster, fetchProtocolScores, patchProtocolMember, type DirectoryPerson, type ProtocolKind, type ProtocolMemberRow, type ProtocolOffice, type ProtocolRosterPatch,
  type ProtocolServeDays,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { KINDS, OFFICES, ROSTER_STATUS, SERVE_DAYS, protocolErrorKey, toggleKind, withDay, withoutDay } from './protocol';
import { useLoad } from './useLoad';
import { PageHeader, PrintButton } from './kit';

/** One person's limits: office, serve days, the services their leader allows, dates they cannot come. */
function MemberEditor({ m, onSave }: { m: ProtocolMemberRow; onSave: (patch: ProtocolRosterPatch) => void }) {
  const t = useT();
  const [office, setOffice] = useState<ProtocolOffice>(m.office);
  const [days, setDays] = useState<ProtocolServeDays>(m.serveDays);
  const [status, setStatus] = useState(m.status);
  const [kinds, setKinds] = useState<ProtocolKind[]>(m.allowedServiceKinds);
  const [away, setAway] = useState<string[]>(m.unavailableDates);
  const [newDay, setNewDay] = useState('');
  const [notes, setNotes] = useState(m.notes);
  return (
    <div className="panel door-form">
      <SelectField label={t('door.protocol.office')} name={`o-${m.id}`} value={office} onChange={(e) => setOffice(e.target.value as ProtocolOffice)}>
        {OFFICES.map((o) => <option key={o} value={o}>{t(`door.protocol.office.${o}` as 'door.protocol.office.MEMBER')}</option>)}
      </SelectField>
      <SelectField label={t('door.protocol.serveDays')} name={`d-${m.id}`} value={days} onChange={(e) => setDays(e.target.value as ProtocolServeDays)}>
        {SERVE_DAYS.map((d) => <option key={d} value={d}>{t(`door.protocol.days.${d}` as 'door.protocol.days.BOTH')}</option>)}
      </SelectField>
      <SelectField label={t('door.protocol.status')} name={`s-${m.id}`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
        {ROSTER_STATUS.map((s) => <option key={s} value={s}>{t(`door.protocol.status.${s}` as 'door.protocol.status.ACTIVE')}</option>)}
      </SelectField>
      <fieldset className="door-fieldset">
        <legend>{t('door.protocol.onlyKinds')}</legend>
        <p className="muted">{t('door.protocol.onlyKindsHint')}</p>
        {KINDS.map((k) => (
          <label key={k} className="door-check">
            <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(toggleKind(kinds, k))} /> {t(`door.music.kind.${k}` as 'door.music.kind.SS1')}
          </label>
        ))}
      </fieldset>
      <div>
        <strong>{t('door.protocol.away')}</strong>
        <ul className="door-list">
          {away.map((d) => (
            <li key={d} className="door-row">
              <span>{d}</span>
              <button type="button" className="btn ghost" onClick={() => setAway(withoutDay(away, d))}>{t('door.groups.remove')}</button>
            </li>
          ))}
        </ul>
        <div className="door-row">
          <TextField label={t('door.protocol.awayAdd')} name={`a-${m.id}`} type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
          <button type="button" className="btn ghost" onClick={() => { setAway(withDay(away, newDay)); setNewDay(''); }}>{t('door.protocol.awayButton')}</button>
        </div>
      </div>
      <TextAreaField label={t('door.protocol.notes')} name={`n-${m.id}`} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
      <button type="button" className="btn" onClick={() => onSave({ office, serveDays: days, status, allowedServiceKinds: kinds, unavailableDates: away, notes })}>{t('door.protocol.save')}</button>
    </div>
  );
}

/** The Protocol team: who serves, on which days and under which limits, and how each has done. */
export function ProtocolRosterPage() {
  const { systemId = '' } = useParams();
  const t = useT();
  const { locale } = useI18n();
  const data = useLoad(fetchProtocolRoster, 'protocol-roster');
  const scores = useLoad(() => fetchProtocolScores(), 'protocol-scores');
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const run = async (job: () => Promise<unknown>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      data.reload();
      scores.reload();
    } catch (err) {
      setError(t(protocolErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const points = new Map((scores.data?.scores ?? []).map((s) => [s.personId, s]));
  const members = (data.data?.members ?? []).filter((m) => showInactive || m.status === 'ACTIVE');
  const dayList = (days: string[]) => days.map((d) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))).join(', ');
  return (
    <section className="door-block" aria-labelledby="door-roster-title">
      <div>
        <PageHeader id="door-roster-title" title={t('door.own.roster')} purpose={t('door.purpose.roster')} actions={<PrintButton />} />
        <p className="muted">{t('door.protocol.roster.intro')}</p>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {data.data && (
          <>
            {data.data.canWrite && (
              <div className="panel door-form">
                <PersonPicker label={t('door.protocol.roster.add')} name="r-add" onPick={(p: DirectoryPerson) => void run(() => addProtocolMember(p.id))} />
                <ImportLink systemId={systemId} target="protocolRoster" />
              </div>
            )}
            <label className="door-check">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t('door.protocol.showInactive')}
            </label>
            {members.length === 0 ? (
              <EmptyState title={t('door.protocol.roster.none')} />
            ) : (
              <ul className="door-list">
                {members.map((m) => {
                  const sc = points.get(m.personId);
                  return (
                    <li key={m.id} className="panel door-notice">
                      <div className="door-notice-main">
                        <div className="door-row">
                          <strong>{m.name}</strong>
                          <span className="door-chip">{t(`door.protocol.office.${m.office}` as 'door.protocol.office.MEMBER')}</span>
                          <span className="door-chip">{t(`door.protocol.days.${m.serveDays}` as 'door.protocol.days.BOTH')}</span>
                          {m.status !== 'ACTIVE' && <span className="door-chip">{t(`door.protocol.status.${m.status}` as 'door.protocol.status.ACTIVE')}</span>}
                        </div>
                        <p className="muted">
                          {m.choirs.length > 0 && <>{t('door.protocol.choirs', { names: m.choirs.join(', ') })} · </>}
                          {m.allowedServiceKinds.length > 0 && <>{t('door.protocol.limited', { kinds: m.allowedServiceKinds.map((k) => t(`door.music.kind.${k}` as 'door.music.kind.SS1')).join(', ') })} · </>}
                          {m.unavailableDates.length > 0 && <>{t('door.protocol.awayList', { days: dayList(m.unavailableDates) })} · </>}
                          {sc ? t('door.protocol.score', { points: sc.points, services: sc.services }) : t('door.protocol.noScore')}
                        </p>
                        {open === m.id && data.data!.canWrite && (
                          <MemberEditor m={m} onSave={(patch) => void run(() => patchProtocolMember(m.id, patch), () => setOpen(''))} />
                        )}
                      </div>
                      {data.data!.canWrite && (
                        <button type="button" className="btn ghost" onClick={() => setOpen(open === m.id ? '' : m.id)}>{open === m.id ? t('door.protocol.close') : t('door.protocol.edit')}</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
