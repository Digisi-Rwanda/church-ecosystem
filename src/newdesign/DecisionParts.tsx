import { useState, type FormEvent } from 'react';
import {
  approveDecision,
  draftDecision,
  rejectDecision,
  withdrawDecision,
  type DecisionItem,
  type GovernanceOptions,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { decisionPayload, decisionProblem, decisionStatusKey, errorCode, govErrorKey } from './governance';
import { dayLabel } from './notices';
import { PersonPicker } from './PersonPicker';

/** Draft a decision, against a meeting (its unit follows) or against a unit. Work needs an owner and a date. */
export function DecisionForm({
  meetingId,
  units,
  limits,
  onDone,
  onCancel,
}: {
  meetingId?: string;
  units: GovernanceOptions['units'];
  limits: GovernanceOptions['limits'];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [work, setWork] = useState(false);
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = { title, detail, work, ownerId: owner?.id ?? '', due, meetingId, unitId };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = decisionProblem(form);
    if (problem) return setError(t(`door.gov.decision.incomplete.${problem}` as const));
    setBusy(true);
    setError('');
    try {
      await draftDecision(decisionPayload(form));
      onDone();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.gov.decision.add')}</h3>
      <TextField label={t('door.gov.decision.title')} name="d-title" value={title} maxLength={limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label={t('door.gov.decision.detail')} name="d-detail" rows={3} value={detail} maxLength={limits.textMax} onChange={(e) => setDetail(e.target.value)} />
      {!meetingId && (
        <SelectField label={t('door.gov.decision.unit')} name="d-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <label className="door-check">
        <input type="checkbox" checked={work} onChange={(e) => setWork(e.target.checked)} />
        <span>
          {t('door.gov.decision.work')}
          <span className="muted"> — {t('door.gov.decision.workHint')}</span>
        </span>
      </label>
      {work && (
        <>
          {owner ? (
            <p>
              <strong>{t('door.gov.decision.owner')}:</strong> {owner.name}{' '}
              <button type="button" className="btn ghost sm" aria-label={t('door.gov.pick.remove', { name: owner.name })} onClick={() => setOwner(null)}>
                ×
              </button>
            </p>
          ) : (
            <PersonPicker label={t('door.gov.decision.owner')} name="d-owner" onPick={(p) => setOwner({ id: p.id, name: p.fullName })} />
          )}
          <TextField label={t('door.gov.decision.due')} name="d-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </>
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.gov.decision.submit')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** One decision in the register, with the actions the server says this reader may take. */
export function DecisionCard({ item, onChanged, notify }: { item: DecisionItem; onChanged: () => void; notify: (m: string) => void }) {
  const t = useT();
  const [asking, setAsking] = useState<'reject' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const when = item.createdAt ? dayLabel(item.createdAt).date : '';

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      notify(done);
      onChanged();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  const approve = () =>
    run(async () => {
      await approveDecision(item.id);
    }, item.owner ? t('door.gov.decision.approvedTask', { name: item.owner.name }) : t('door.gov.decision.approved'));
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(t('door.gov.decision.reasonRequired'));
    if (asking === 'reject') await run(() => rejectDecision(item.id, reason.trim()), t('door.gov.decision.rejectedDone'));
    else await run(() => withdrawDecision(item.id, reason.trim()), t('door.gov.decision.withdrawnDone'));
  };

  return (
    <div className="panel door-decision">
      <div className="door-row">
        <strong>{item.title}</strong>
        <span className={`door-chip${item.status === 'DRAFT' ? ' warn' : ''}`}>{t(decisionStatusKey(item.status))}</span>
      </div>
      {item.detail && <p className="door-announce-body">{item.detail}</p>}
      <p className="muted door-notice-meta">
        {item.unitName} · {t('door.gov.decision.by', { name: item.authorName || '—' })} · {when}
        {item.meetingTitle && ` · ${t('door.gov.decision.fromMeeting', { meeting: item.meetingTitle })}`}
      </p>
      {item.owner && item.dueDate && (
        <p className="muted door-notice-meta">
          {t('door.gov.decision.owner.line', { name: item.owner.name, date: item.dueDate })}
          {item.taskId && ` · ${t('door.gov.decision.becameTask')}`}
        </p>
      )}
      {item.status === 'APPROVED' && item.decidedByName && item.decidedAt && (
        <p className="muted door-notice-meta">{t('door.gov.decision.decidedBy', { name: item.decidedByName, date: dayLabel(item.decidedAt).date })}</p>
      )}
      {item.status === 'REJECTED' && item.rejectReason && <p className="muted door-notice-meta">{t('door.gov.decision.rejectedBecause', { reason: item.rejectReason })}</p>}
      {(item.canApprove || item.canWithdraw) && !asking && (
        <div className="door-row">
          {item.canApprove && (
            <>
              <button type="button" className="btn sm" disabled={busy} onClick={() => void approve()}>
                {t('door.gov.decision.approve')}
              </button>
              <button type="button" className="btn secondary sm" disabled={busy} onClick={() => setAsking('reject')}>
                {t('door.gov.decision.reject')}
              </button>
            </>
          )}
          {item.canWithdraw && (
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setAsking('withdraw')}>
              {t('door.gov.decision.withdraw')}
            </button>
          )}
        </div>
      )}
      {asking && (
        <form className="door-form door-end" onSubmit={ask} noValidate>
          <TextField label={t('door.gov.decision.reason')} name={`reason-${item.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="door-row">
            <button type="submit" className="btn danger" disabled={busy}>
              {asking === 'reject' ? t('door.gov.decision.confirmReject') : t('door.gov.decision.confirmWithdraw')}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setAsking(null); setError(''); }}>
              {t('door.settings.cancel')}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
