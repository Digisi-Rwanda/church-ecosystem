import { useState } from 'react';
import {
  answerProtocolFillIn, answerProtocolSwap, decideProtocolAbsence, fetchProtocolMine, fetchProtocolServiceReport, markProtocolAttendance, offerProtocolFillIn, proposeProtocolSwap,
  requestProtocolAbsence, saveProtocolServiceReport, type ProtocolAttendanceStatus, type ProtocolLeading, type ProtocolMine, type ProtocolReportParts,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { ATTENDANCE, canAsk, canMark, protocolErrorKey } from './protocol';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

type Act = (job: () => Promise<unknown>) => void;
const EMPTY: ProtocolReportParts = { challenges: '', solutions: '', issues: '', recommendations: '' };
const PARTS = ['challenges', 'solutions', 'issues', 'recommendations'] as const;

/** The leader's report for one service: what was hard, what was done, what still needs someone, what to try next. */
function ReportForm({ serviceId, onDone }: { serviceId: string; onDone: (e?: unknown) => void }) {
  const t = useT();
  const loaded = useLoad(() => fetchProtocolServiceReport(serviceId), `protocol-report|${serviceId}`);
  const [draft, setDraft] = useState<ProtocolReportParts | null>(null);
  const [saved, setSaved] = useState(false);
  const current = draft ?? (loaded.data?.report ? { challenges: loaded.data.report.challenges, solutions: loaded.data.report.solutions, issues: loaded.data.report.issues, recommendations: loaded.data.report.recommendations } : EMPTY);
  return (
    <LoadState loading={loaded.loading} failed={loaded.failed} retry={loaded.reload}>
      <div className="panel door-form">
        {PARTS.map((p) => (
          <TextAreaField key={p} label={t(`door.protocol.report.${p}` as 'door.protocol.report.challenges')} name={`rep-${serviceId}-${p}`} value={current[p]} maxLength={2000} onChange={(e) => { setSaved(false); setDraft({ ...current, [p]: e.target.value }); }} />
        ))}
        <div className="door-row">
          <button type="button" className="btn" onClick={() => saveProtocolServiceReport(serviceId, current).then(() => { setSaved(true); loaded.reload(); }).catch(onDone)}>{t('door.protocol.report.save')}</button>
          {saved && <span className="muted" role="status">{t('door.protocol.report.saved')}</span>}
        </div>
      </div>
    </LoadState>
  );
}

/** One service this person leads: excuses to decide, fill-ins, attendance and the report. */
function LeadingCard({ s, data, today, act, fail }: { s: ProtocolLeading; data: ProtocolMine; today: string; act: Act; fail: (e: unknown) => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [reportOpen, setReportOpen] = useState(false);
  const [excused, setExcused] = useState('');
  const [candidate, setCandidate] = useState('');
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${s.date}T00:00:00Z`));
  const excusedList = s.team.filter((m) => m.absence?.status === 'EXCUSED');
  const pending = data.absencesToDecide.filter((a) => a.serviceId === s.serviceId);
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row"><strong>{day}</strong><span className="door-chip">{t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}</span></div>
        {pending.map((a) => (
          <div key={a.id} className="door-row">
            <span>{t('door.protocol.asksExcuse', { name: a.person, reason: a.reason })}</span>
            <button type="button" className="btn" onClick={() => act(() => decideProtocolAbsence(a.id, 'EXCUSE'))}>{t('door.protocol.excuse')}</button>
            <button type="button" className="btn ghost" onClick={() => act(() => decideProtocolAbsence(a.id, 'DENY'))}>{t('door.protocol.deny')}</button>
          </div>
        ))}
        <ul className="door-list">
          {s.team.map((m) => (
            <li key={m.personId} className="door-row">
              <span>
                {m.name} {m.role !== 'MEMBER' && <span className="door-chip">{t(`door.protocol.role.${m.role}` as 'door.protocol.role.MEMBER')}</span>}
                {m.slotKind === 'FILL_IN' && <> <span className="door-chip">{t('door.protocol.slot.FILL_IN')}</span></>}
                {m.attendance && <> <span className="door-chip">{t(`door.protocol.att.${m.attendance}` as 'door.protocol.att.PRESENT')}</span></>}
              </span>
              {canMark(s.date, today) && (
                <SelectField label={t('door.protocol.markAs')} name={`att-${s.serviceId}-${m.personId}`} value={m.attendance ?? ''} onChange={(e) => e.target.value && act(() => markProtocolAttendance(s.serviceId, m.personId, e.target.value as ProtocolAttendanceStatus))}>
                  <option value="">{t('door.gov.meeting.choose')}</option>
                  {ATTENDANCE.map((a) => <option key={a} value={a}>{t(`door.protocol.att.${a}` as 'door.protocol.att.PRESENT')}</option>)}
                </SelectField>
              )}
            </li>
          ))}
        </ul>
        {excusedList.length > 0 && canAsk(s.date, today) && (
          <div className="door-row">
            <SelectField label={t('door.protocol.fillIn.excused')} name={`fx-${s.serviceId}`} value={excused} onChange={(e) => setExcused(e.target.value)}>
              <option value="">{t('door.gov.meeting.choose')}</option>
              {excusedList.map((m) => <option key={m.personId} value={m.personId}>{m.name}</option>)}
            </SelectField>
            <SelectField label={t('door.protocol.fillIn.candidate')} name={`fc-${s.serviceId}`} value={candidate} onChange={(e) => setCandidate(e.target.value)}>
              <option value="">{t('door.gov.meeting.choose')}</option>
              {data.pool.filter((p) => !s.team.some((m) => m.personId === p.personId)).map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
            </SelectField>
            <button type="button" className="btn ghost" disabled={!excused || !candidate} onClick={() => act(() => offerProtocolFillIn(s.serviceId, excused, candidate))}>{t('door.protocol.fillIn.offer')}</button>
          </div>
        )}
        {s.fillIns.length > 0 && (
          <ul className="door-list">
            {s.fillIns.map((f) => <li key={f.id} className="muted">{t('door.protocol.fillIn.row', { excused: f.excused, candidate: f.candidate, status: t(`door.protocol.offer.${f.status}` as 'door.protocol.offer.PENDING') })}</li>)}
          </ul>
        )}
        {canMark(s.date, today) && (
          <>
            <button type="button" className="btn ghost" onClick={() => setReportOpen(!reportOpen)}>{reportOpen ? t('door.protocol.close') : t('door.protocol.report.open')}</button>
            {reportOpen && <ReportForm serviceId={s.serviceId} onDone={fail} />}
          </>
        )}
      </div>
    </li>
  );
}

/** My duties, the offers waiting for me, and — for a team leader — the services I lead. */
export function ProtocolMinePage() {
  const t = useT();
  const { locale } = useI18n();
  const data = useLoad(fetchProtocolMine, 'protocol-mine');
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState('');
  const [swapService, setSwapService] = useState('');
  const [swapTarget, setSwapTarget] = useState('');
  const fail = (err: unknown) => setError(t(protocolErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  const act: Act = (job) => {
    setError('');
    job().then(() => data.reload()).catch(fail);
  };
  const today = new Date().toISOString().slice(0, 10);
  const dayName = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const m = data.data;
  const other = m?.others.find((o) => o.serviceId === swapService);
  return (
    <section className="door-block" aria-labelledby="door-mine-title">
      <div>
        <PageHeader id="door-mine-title" title={t('door.own.mine')} />
        <p className="muted">{t('door.protocol.mine.intro')}</p>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {m && (
          <>
            {(m.fillInOffers.length > 0 || m.duties.some((d) => d.swapOffers.length > 0)) && (
              <div className="panel">
                <h3>{t('door.protocol.offers')}</h3>
                <ul className="door-list">
                  {m.fillInOffers.map((o) => (
                    <li key={o.id} className="door-row">
                      <span>{t('door.protocol.offer.fillIn', { name: o.excused })}</span>
                      <button type="button" className="btn" onClick={() => act(() => answerProtocolFillIn(o.id, true))}>{t('door.protocol.accept')}</button>
                      <button type="button" className="btn ghost" onClick={() => act(() => answerProtocolFillIn(o.id, false))}>{t('door.protocol.decline')}</button>
                    </li>
                  ))}
                  {m.duties.flatMap((d) => d.swapOffers.map((o) => (
                    <li key={o.id} className="door-row">
                      <span>{t('door.protocol.offer.swap', { name: o.from, day: dayName(d.date) })}</span>
                      <button type="button" className="btn" onClick={() => act(() => answerProtocolSwap(o.id, true))}>{t('door.protocol.accept')}</button>
                      <button type="button" className="btn ghost" onClick={() => act(() => answerProtocolSwap(o.id, false))}>{t('door.protocol.decline')}</button>
                    </li>
                  )))}
                </ul>
              </div>
            )}
            <h3>{t('door.protocol.duties')}</h3>
            {m.duties.length === 0 ? <EmptyState title={t('door.protocol.duties.none')} /> : (
              <ul className="door-list">
                {m.duties.map((d) => (
                  <li key={d.serviceId} className="panel door-notice">
                    <div className="door-notice-main">
                      <div className="door-row">
                        <strong>{dayName(d.date)}</strong>
                        <span className="door-chip">{t(`door.music.kind.${d.kind}` as 'door.music.kind.SS1')}</span>
                        {d.role !== 'MEMBER' && <span className="door-chip">{t(`door.protocol.role.${d.role}` as 'door.protocol.role.MEMBER')}</span>}
                        {d.attendance && <span className="door-chip">{t(`door.protocol.att.${d.attendance}` as 'door.protocol.att.PRESENT')}</span>}
                        {d.absence && <span className="door-chip">{t(`door.protocol.absence.${d.absence}` as 'door.protocol.absence.PENDING')}</span>}
                      </div>
                      {asking === d.serviceId && (
                        <div className="door-row">
                          <TextField label={t('door.protocol.reason')} name={`ab-${d.serviceId}`} value={reasons[d.serviceId] ?? ''} onChange={(e) => setReasons({ ...reasons, [d.serviceId]: e.target.value })} />
                          <button type="button" className="btn" onClick={() => act(() => requestProtocolAbsence(d.serviceId, reasons[d.serviceId] ?? '').then(() => setAsking('')))}>{t('door.protocol.sendRequest')}</button>
                        </div>
                      )}
                    </div>
                    {!d.absence && canAsk(d.date, today) && <button type="button" className="btn ghost" onClick={() => setAsking(asking === d.serviceId ? '' : d.serviceId)}>{t('door.protocol.askExcuse')}</button>}
                  </li>
                ))}
              </ul>
            )}
            {m.others.length > 0 && (
              <div className="panel door-form">
                <h3>{t('door.protocol.swap.title')}</h3>
                <p className="muted">{t('door.protocol.swap.hint')}</p>
                <SelectField label={t('door.protocol.swap.service')} name="sw-service" value={swapService} onChange={(e) => { setSwapService(e.target.value); setSwapTarget(''); }}>
                  <option value="">{t('door.gov.meeting.choose')}</option>
                  {m.others.map((o) => <option key={o.serviceId} value={o.serviceId}>{`${dayName(o.date)} · ${t(`door.music.kind.${o.kind}` as 'door.music.kind.SS1')}`}</option>)}
                </SelectField>
                {other && (
                  <SelectField label={t('door.protocol.swap.person')} name="sw-person" value={swapTarget} onChange={(e) => setSwapTarget(e.target.value)}>
                    <option value="">{t('door.gov.meeting.choose')}</option>
                    {other.team.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
                  </SelectField>
                )}
                <button type="button" className="btn" disabled={!swapService || !swapTarget} onClick={() => act(() => proposeProtocolSwap(swapService, swapTarget).then(() => { setSwapService(''); setSwapTarget(''); }))}>{t('door.protocol.swap.send')}</button>
              </div>
            )}
            {m.leading.length > 0 && (
              <>
                <h3>{t('door.protocol.leading')}</h3>
                <ul className="door-list">
                  {m.leading.map((s) => <LeadingCard key={s.serviceId} s={s} data={m} today={today} act={act} fail={fail} />)}
                </ul>
              </>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
