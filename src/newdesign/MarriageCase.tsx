import { useRef, useState } from 'react';
import {
  addMarriageItem, approveMarriage, changeMarriageItem, confirmMarriageChange, decideMarriageChange, fetchCase, fetchPlanFile, registerMarriage, requestMarriageChange,
  sendMarriageBack, verifyMarriage, closeCase,
  type CaseDetail, type MarriageItem, type PlanDetail,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { FILE_ACCEPT, FILE_MAX, fileSize, mimeOf, saveBase64, toBase64 } from './fileKit';
import { errorCode } from './governance';
import { SidePanel, StatusChip, type ChipTone } from './kit';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';

const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const ITEM_TONE: Record<string, ChipTone> = { SCHEDULED: 'info', DONE: 'success', CANCELLED: 'neutral' };

/** The Youth Leader (or any unit leader) registers a couple: partner 1 from the unit, partner 2 from any church. */
export function MarriageRegister({ p, units, money, onClose, onDone }: { p: PlanDetail; units: Array<{ id: string; name: string }>; money: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ unitId: units.length === 1 ? units[0]!.id : '', p1Name: '', p1Contact: '', p2Name: '', p2Church: '', p2Contact: '', date: '', time: '', place: '', capacity: '', need: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pick = (list: FileList | null) => {
    const x = list?.[0];
    if (!x) return;
    if (!mimeOf(x.name)) return setError(t('door.p360.docs.type'));
    if (x.size > FILE_MAX) return setError(t('door.p360.docs.tooBig'));
    setError('');
    setFile(x);
  };
  const save = async () => {
    setError('');
    try {
      await registerMarriage(p.id, {
        unitId: f.unitId, p1Name: f.p1Name.trim(), p1Contact: f.p1Contact.trim(), p2Name: f.p2Name.trim(), p2Church: f.p2Church.trim(), p2Contact: f.p2Contact.trim(),
        date: f.date, time: f.time || null, place: f.place.trim(), capacity: num(f.capacity), need: num(f.need),
        certificate: file ? { name: file.name, mime: mimeOf(file.name) ?? 'application/octet-stream', data: await toBase64(file) } : null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <SidePanel open title={t('door.mr.register')} purpose={t('door.mr.registerPurpose')} onClose={onClose} saveLabel={t('door.mr.registerSave')} canSave={!!f.unitId && !!f.p1Name.trim() && !!f.p2Name.trim() && !!f.date} onSave={() => void save()}>
      <div className="door-form">
        {units.length > 1 && (
          <SelectField label={`${t('door.ap.unit')} *`} name="mr-unit" value={f.unitId} onChange={set('unitId')}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectField>
        )}
        <h4>{t('door.mr.partner1')}</h4>
        <TextField label={`${t('door.cs.name')} *`} name="mr-p1" value={f.p1Name} onChange={set('p1Name')} />
        <TextField label={t('door.cs.contact')} name="mr-p1c" value={f.p1Contact} onChange={set('p1Contact')} />
        <h4>{t('door.mr.partner2')}</h4>
        <TextField label={`${t('door.cs.name')} *`} name="mr-p2" value={f.p2Name} onChange={set('p2Name')} />
        <TextField label={t('door.mr.externalChurch')} name="mr-p2ch" value={f.p2Church} onChange={set('p2Church')} />
        <TextField label={t('door.cs.contact')} name="mr-p2c" value={f.p2Contact} onChange={set('p2Contact')} />
        <h4>{t('door.mr.wedding')}</h4>
        <TextField label={`${t('door.cs.date')} *`} name="mr-date" type="date" value={f.date} onChange={set('date')} />
        <TextField label={t('door.mr.time')} name="mr-time" type="time" value={f.time} onChange={set('time')} />
        <TextField label={t('door.mr.place')} name="mr-place" value={f.place} onChange={set('place')} />
        <div>
          <input ref={input} type="file" accept={FILE_ACCEPT} hidden onChange={(e) => { pick(e.target.files); if (input.current) input.current.value = ''; }} aria-label={t('door.mr.certificate')} />
          <button type="button" className="btn secondary" onClick={() => input.current?.click()}>{t('door.mr.certificate')}</button>{' '}
          <span className="muted">{file ? `${file.name} · ${fileSize(file.size)}` : t('door.mr.certificateHint')}</span>
        </div>
        {money && (
          <>
            <TextField label={t('door.cs.capacity')} name="mr-cap" inputMode="numeric" value={f.capacity} onChange={set('capacity')} />
            <TextField label={t('door.cs.need')} name="mr-need" inputMode="numeric" value={f.need} onChange={set('need')} />
            <p className="muted">{t('door.cs.gapIs', { amount: formatRwf(Math.max(0, num(f.need) - num(f.capacity))) })}</p>
          </>
        )}
        {error && <p className="door-error" role="alert">{error}</p>}
      </div>
    </SidePanel>
  );
}

/** Announcements or preparation meetings: a small table with Add, move and mark done. */
function Items({ kind, rows, canEdit, onAdd, onChange }: {
  kind: 'ANNOUNCEMENT' | 'MEETING'; rows: MarriageItem[]; canEdit: boolean;
  onAdd: (b: { onDate: string; atTime: string | null; place: string }) => Promise<void>;
  onChange: (id: string, b: { onDate?: string; status?: 'SCHEDULED' | 'DONE' | 'CANCELLED' }) => Promise<void>;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [moving, setMoving] = useState<{ id: string; date: string } | null>(null);
  const ann = kind === 'ANNOUNCEMENT';
  return (
    <div className="panel-inset">
      <h4>{t(ann ? 'door.mr.announcements' : 'door.mr.meetings')}</h4>
      {rows.length === 0 ? <p className="muted">{t(ann ? 'door.mr.noAnnouncements' : 'door.mr.noMeetings')}</p> : (
        <div className="door-table-wrap">
          <table className="door-table door-stack">
            <thead><tr><th scope="col">#</th><th scope="col">{t('door.cs.date')}</th><th scope="col">{t('door.mr.time')}</th>{!ann && <th scope="col">{t('door.mr.place')}</th>}<th scope="col">{t('door.cs.col.status')}</th>{canEdit && <th scope="col"><span className="visually-hidden">{t('door.cs.col.action')}</span></th>}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <th scope="row">{i + 1}</th>
                  <td data-label={t('door.cs.date')}>{moving?.id === r.id ? <input type="date" aria-label={t('door.cs.date')} value={moving.date} onChange={(e) => setMoving({ id: r.id, date: e.target.value })} /> : r.date}</td>
                  <td data-label={t('door.mr.time')}>{r.time || '—'}</td>
                  {!ann && <td data-label={t('door.mr.place')}>{r.place || '—'}</td>}
                  <td data-label={t('door.cs.col.status')}><StatusChip tone={ITEM_TONE[r.status] ?? 'neutral'}>{t(`door.mr.item.${r.status}` as 'door.mr.item.SCHEDULED')}</StatusChip></td>
                  {canEdit && (
                    <td>
                      {r.status === 'SCHEDULED' && (moving?.id === r.id
                        ? <><button type="button" className="btn sm" disabled={!moving.date} onClick={() => void onChange(r.id, { onDate: moving.date }).then(() => setMoving(null))}>{t('door.mr.saveDate')}</button>{' '}<button type="button" className="btn ghost sm" onClick={() => setMoving(null)}>{t('door.settings.cancel')}</button></>
                        : <>
                          <button type="button" className="btn ghost sm" onClick={() => setMoving({ id: r.id, date: r.date })}>{t('door.mr.move')}</button>{' '}
                          <button type="button" className="btn ghost sm" onClick={() => void onChange(r.id, { status: 'DONE' })}>{t(ann ? 'door.mr.markMade' : 'door.mr.markAttended')}</button>{' '}
                          <button type="button" className="btn ghost sm" onClick={() => void onChange(r.id, { status: 'CANCELLED' })}>{t('door.mr.dropItem')}</button>
                        </>)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && !adding && <button type="button" className="btn secondary" onClick={() => { setDate(''); setTime(''); setPlace(''); setAdding(true); }}>{t(ann ? 'door.mr.addDate' : 'door.mr.addMeeting')}</button>}
      {canEdit && adding && (
        <div className="door-form">
          <TextField label={`${t('door.cs.date')} *`} name={`mr-${kind}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label={t('door.mr.time')} name={`mr-${kind}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          {!ann && <TextField label={t('door.mr.place')} name={`mr-${kind}-place`} value={place} onChange={(e) => setPlace(e.target.value)} />}
          <div className="door-row">
            <button type="button" className="btn" disabled={!date} onClick={() => void onAdd({ onDate: date, atTime: time || null, place: place.trim() }).then(() => setAdding(false))}>{t('door.mr.addSave')}</button>
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>{t('door.settings.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One marriage: the details, announcements, preparation meetings, and the approvals each role gives. */
export function MarriageDetail({ p, caseId, onClose, onChange }: { p: PlanDetail; caseId: string; onClose: () => void; onChange: () => void }) {
  const t = useT();
  const load = useLoad(() => fetchCase(p.id, caseId), `marriage|${caseId}`);
  const [view, setView] = useState<CaseDetail | null>(null);
  const c = view ?? load.data;
  const m = c?.marriage ?? null;
  const [error, setError] = useState('');
  const [support, setSupport] = useState('');
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState<null | 'POSTPONE' | 'CANCEL' | 'BACK' | 'DECLINE'>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const go = async (job: () => Promise<CaseDetail>, after?: () => void) => {
    setError('');
    try {
      setView(await job());
      after?.();
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const done = () => { setAsking(null); setReason(''); setNewDate(''); setNewTime(''); };
  const certificate = async () => {
    if (!m?.certificateFileId) return;
    try { saveBase64(await fetchPlanFile(p.id, m.certificateFileId)); } catch { setError(t('door.people.actionFailed')); }
  };
  return (
    <SidePanel open title={c?.name ?? t('door.cs.view')} purpose={m ? `${m.p1Unit} · ${m.date}${m.time ? ` ${m.time}` : ''}` : ''} onClose={onClose} wide="xl">
      <LoadState loading={load.loading && !c} failed={load.failed} retry={load.reload}>
        {c && m && (
          <div className="door-form">
            <p><StatusChip tone={c.status === 'CLOSED' ? 'done' : c.status === 'APPROVED' ? 'success' : 'warn'}>{t(`door.cs.status.${c.status}` as 'door.cs.status.PENDING')}</StatusChip>
              {m.awaiting && <span className="muted"> · {t(`door.mr.awaiting.${m.awaiting}` as 'door.mr.awaiting.CATECHIST')}</span>}</p>
            <dl className="door-facts">
              <div><dt className="muted">{t('door.mr.partner1')}</dt><dd>{m.p1Name}{m.p1Contact ? ` · ${m.p1Contact}` : ''} ({m.p1Unit})</dd></div>
              <div><dt className="muted">{t('door.mr.partner2')}</dt><dd>{m.p2Name}{m.p2Church ? ` · ${m.p2Church}` : ''}{m.p2Contact ? ` · ${m.p2Contact}` : ''}</dd></div>
              <div><dt className="muted">{t('door.mr.wedding')}</dt><dd>{m.date}{m.time ? ` ${m.time}` : ''}{m.place ? ` · ${m.place}` : ''}</dd></div>
              <div><dt className="muted">{t('door.mr.certificate')}</dt><dd>{m.certificateFileId ? <button type="button" className="btn ghost sm" onClick={() => void certificate()}>{t('door.mr.certificateOpen')}</button> : '—'}</dd></div>
              {m.hasMoney && <div><dt className="muted">{t('door.cs.col.gap')}</dt><dd>{formatRwf(c.gap)}</dd></div>}
              {m.hasMoney && <div><dt className="muted">{t('door.cs.churchCovered')}</dt><dd>{formatRwf(c.disbursed)}{c.approved > c.disbursed ? ` (${t('door.cs.approvedWaiting', { amount: formatRwf(c.approved - c.disbursed) })})` : ''}</dd></div>}
              {c.outcome && <div><dt className="muted">{t('door.cs.outcome')}</dt><dd>{t(`door.cs.outcome.${c.outcome}` as 'door.cs.outcome.RESOLVED')}</dd></div>}
            </dl>

            {m.change && (
              <p role="status"><strong>{t(m.change.kind === 'POSTPONE' ? 'door.mr.change.POSTPONE' : 'door.mr.change.CANCEL')}</strong>
                {m.change.newDate ? ` → ${m.change.newDate}` : ''} · {m.change.reason} · <em>{t(m.change.status === 'REQUESTED' ? 'door.mr.change.waitCatechist' : 'door.mr.change.waitLeader')}</em></p>
            )}

            <div className="door-row">
              {m.canVerify && <button type="button" className="btn" onClick={() => void go(() => verifyMarriage(p.id, caseId))}>{t('door.mr.verify')}</button>}
              {m.canSendBack && <button type="button" className="btn ghost" onClick={() => { setAsking('BACK'); setReason(''); }}>{t('door.mr.sendBack')}</button>}
              {m.canConfirmChange && <button type="button" className="btn" onClick={() => void go(() => confirmMarriageChange(p.id, caseId))}>{t('door.mr.change.confirm')}</button>}
              {m.canDecideChange && <button type="button" className="btn" onClick={() => void go(() => decideMarriageChange(p.id, caseId, { approve: true, note: null }))}>{t('door.mr.change.approve')}</button>}
              {m.canDecideChange && <button type="button" className="btn ghost" onClick={() => { setAsking('DECLINE'); setReason(''); }}>{t('door.mr.change.decline')}</button>}
            </div>

            {m.canApprove && (
              <div className="panel-inset">
                {m.hasMoney && m.maxSupport > 0 && (
                  <>
                    <TextField label={t('door.mr.support', { max: formatRwf(Math.min(m.maxSupport, m.remaining)) })} name="mr-support" inputMode="numeric" value={support} onChange={(e) => setSupport(String(Math.min(m.maxSupport, num(e.target.value))))} />
                    <p className="muted">{t('door.cs.wanted', { wanted: formatRwf(num(support)), remaining: formatRwf(m.remaining) })}</p>
                  </>
                )}
                <button type="button" className="btn" disabled={num(support) > m.remaining} onClick={() => void go(() => approveMarriage(p.id, caseId, num(support)))}>{t('door.mr.approve')}</button>
              </div>
            )}

            {(asking === 'BACK' || asking === 'DECLINE' || asking === 'POSTPONE' || asking === 'CANCEL') && (
              <div className="panel-inset">
                {asking === 'POSTPONE' && (
                  <>
                    <TextField label={`${t('door.mr.newDate')} *`} name="mr-new-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                    <TextField label={t('door.mr.time')} name="mr-new-time" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                  </>
                )}
                <TextAreaField label={`${t('door.mr.reason')}${asking === 'DECLINE' ? '' : ' *'}`} name="mr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="door-row">
                  <button type="button" className="btn" disabled={asking === 'DECLINE' ? false : !reason.trim() || (asking === 'POSTPONE' && !newDate)} onClick={() => void go(() => {
                    if (asking === 'BACK') return sendMarriageBack(p.id, caseId, reason.trim());
                    if (asking === 'DECLINE') return decideMarriageChange(p.id, caseId, { approve: false, note: reason.trim() || null });
                    return requestMarriageChange(p.id, caseId, { kind: asking, reason: reason.trim(), newDate: asking === 'POSTPONE' ? newDate : null, newTime: asking === 'POSTPONE' ? newTime || null : null });
                  }, done)}>{t('door.mr.send')}</button>
                  <button type="button" className="btn ghost" onClick={done}>{t('door.settings.cancel')}</button>
                </div>
              </div>
            )}

            <Items kind="ANNOUNCEMENT" rows={m.announcements} canEdit={m.canArrangeAnnouncements}
              onAdd={(b) => go(() => addMarriageItem(p.id, caseId, { kind: 'ANNOUNCEMENT', ...b }))}
              onChange={(id, b) => go(() => changeMarriageItem(p.id, caseId, id, b))} />
            <Items kind="MEETING" rows={m.meetings} canEdit={m.canArrangeMeetings}
              onAdd={(b) => go(() => addMarriageItem(p.id, caseId, { kind: 'MEETING', ...b }))}
              onChange={(id, b) => go(() => changeMarriageItem(p.id, caseId, id, b))} />

            <div className="door-row">
              {m.canRequestChange && <button type="button" className="btn secondary" onClick={() => { setAsking('POSTPONE'); setReason(''); }}>{t('door.mr.requestPostpone')}</button>}
              {m.canRequestChange && <button type="button" className="btn secondary" onClick={() => { setAsking('CANCEL'); setReason(''); }}>{t('door.mr.requestCancel')}</button>}
              {c.canClose && c.status === 'APPROVED' && !m.change && <button type="button" className="btn" onClick={() => void go(() => closeCase(p.id, caseId, { outcome: 'MARRIED', note: null }))}>{t('door.mr.markMarried')}</button>}
              {c.canClose && c.status !== 'APPROVED' && c.status !== 'CLOSED' && <button type="button" className="btn ghost" onClick={() => void go(() => closeCase(p.id, caseId, { outcome: 'CANCELLED', note: null }))}>{t('door.mr.dropCase')}</button>}
            </div>

            <h4>{t('door.cs.timeline')}</h4>
            <ol className="door-list">{c.events.map((e) => <li key={e.id}>{(e.at ?? '').slice(0, 10)} · {e.text}</li>)}</ol>
            {error && <p className="door-error" role="alert">{error}</p>}
          </div>
        )}
      </LoadState>
    </SidePanel>
  );
}
