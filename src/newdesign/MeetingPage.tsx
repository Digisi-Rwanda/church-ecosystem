import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelMeeting, fetchGovernanceOptions, fetchMeeting, markMeetingHeld } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { DecisionCard, DecisionForm } from './DecisionParts';
import { errorCode, govErrorKey, isOverdue, meetingStatusKey } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

/** One meeting: agenda, minutes, who came, and the decisions taken in it. */
export function MeetingPage() {
  const t = useT();
  const { systemId = '', meetingId = '' } = useParams();
  const { data, loading, failed, reload } = useLoad(() => fetchMeeting(meetingId), `meeting|${meetingId}`);
  const options = useLoad(fetchGovernanceOptions, 'gov-options');
  const [panel, setPanel] = useState<'held' | 'cancel' | 'decision' | null>(null);
  const [notice, setNotice] = useState('');
  const m = data?.meeting;
  const done = (message: string) => {
    setPanel(null);
    setNotice(message);
    reload();
  };

  return (
    <>
      <Link className="btn ghost sm door-back" to={`/s/${systemId}/governance`}>
        {t('door.gov.meeting.back')}
      </Link>
      <LoadState loading={loading} failed={failed && !data} retry={reload}>
        {!m ? (
          <EmptyState variant="no-results" title={t('door.gov.meeting.none')} />
        ) : (
          <>
            <div className="panel">
              <div className="door-row">
                <h3>{m.title}</h3>
                <span className={`door-chip${m.status === 'PLANNED' ? ' warn' : ''}`}>{t(meetingStatusKey(m.status))}</span>
              </div>
              <p className="muted door-notice-meta">
                {m.typeName} · {m.unitName}
                {m.scheduledAt && ` · ${new Date(m.scheduledAt).toLocaleString()}`}
                {m.location && ` · ${m.location}`}
              </p>
              {m.status === 'CANCELLED' && m.cancelledReason && <p className="door-error">{t('door.gov.meeting.cancelledWhy', { reason: m.cancelledReason })}</p>}
              {isOverdue(m) && m.canWrite && <p className="door-error">{t('door.gov.meeting.overdue')}</p>}
              <h4>{t('door.gov.meeting.agendaHeading')}</h4>
              <p className="door-announce-body">{m.agenda || t('door.gov.meeting.noAgenda')}</p>
              {m.status === 'HELD' && (
                <>
                  <h4>{t('door.gov.meeting.minutesHeading')}</h4>
                  <p className="door-announce-body">{m.minutes || t('door.gov.meeting.noMinutes')}</p>
                  <h4>{t('door.gov.meeting.attendeesHeading')}</h4>
                  <p>{m.attendees.length ? m.attendees.map((a) => a.name).join(', ') : t('door.gov.meeting.noAttendees')}</p>
                </>
              )}
            </div>
            {notice && (
              <p className="door-ok" role="status">
                {notice}
              </p>
            )}
            {m.canWrite && !panel && (
              <div className="door-row">
                {m.status === 'PLANNED' && (
                  <>
                    <button type="button" className="btn" onClick={() => { setPanel('held'); setNotice(''); }}>
                      {t('door.gov.meeting.markHeld')}
                    </button>
                    <button type="button" className="btn secondary" onClick={() => { setPanel('cancel'); setNotice(''); }}>
                      {t('door.gov.meeting.cancel')}
                    </button>
                  </>
                )}
                {m.status !== 'CANCELLED' && options.data && (
                  <button type="button" className="btn secondary" onClick={() => { setPanel('decision'); setNotice(''); }}>
                    {t('door.gov.decision.add')}
                  </button>
                )}
              </div>
            )}
            {panel === 'held' && <HeldForm id={m.id} onDone={() => done(t('door.gov.meeting.heldDone'))} onCancel={() => setPanel(null)} limit={options.data?.limits.textMax ?? 8000} />}
            {panel === 'cancel' && <CancelForm id={m.id} onDone={() => done(t('door.gov.meeting.cancelDone'))} onCancel={() => setPanel(null)} />}
            {panel === 'decision' && options.data && (
              <DecisionForm meetingId={m.id} units={[]} limits={options.data.limits} onCancel={() => setPanel(null)} onDone={() => done(t('door.gov.decision.drafted'))} />
            )}
            <h3>{t('door.gov.tab.decisions')}</h3>
            {data.decisions.length === 0 ? (
              <EmptyState title={t('door.gov.decision.none')} />
            ) : (
              <div className="door-decisions">
                {data.decisions.map((d) => (
                  <DecisionCard key={d.id} item={d} onChanged={reload} notify={setNotice} />
                ))}
              </div>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}

function HeldForm({ id, limit, onDone, onCancel }: { id: string; limit: number; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [minutes, setMinutes] = useState('');
  const [who, setWho] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await markMeetingHeld(id, { minutes: minutes.trim() || undefined, attendeeIds: who.map((w) => w.id) });
      onDone();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.gov.meeting.markHeld')}</h3>
      <TextAreaField label={t('door.gov.meeting.minutes')} name="minutes" rows={6} value={minutes} maxLength={limit} onChange={(e) => setMinutes(e.target.value)} />
      <PersonPicker label={t('door.gov.meeting.attendees')} name="attendee" onPick={(p) => setWho((w) => (w.some((x) => x.id === p.id) ? w : [...w, { id: p.id, name: p.fullName }]))} />
      {who.length > 0 && (
        <ul className="door-chips">
          {who.map((w) => (
            <li key={w.id} className="door-chip">
              {w.name}{' '}
              <button type="button" className="btn ghost sm" aria-label={t('door.gov.pick.remove', { name: w.name })} onClick={() => setWho(who.filter((x) => x.id !== w.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.gov.meeting.heldSubmit')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

function CancelForm({ id, onDone, onCancel }: { id: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(t('door.gov.meeting.cancelReasonRequired'));
    setBusy(true);
    setError('');
    try {
      await cancelMeeting(id, reason.trim());
      onDone();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <TextField label={t('door.gov.meeting.cancelReason')} name="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn danger" disabled={busy}>
          {t('door.gov.meeting.cancelConfirm')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}
