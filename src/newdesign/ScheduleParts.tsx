import { useState, type FormEvent } from 'react';
import {
  addSlot,
  assignToSlot,
  declineAssignment,
  editSlot,
  removeAssignment,
  removeSlot,
  replaceAssignment,
  type PlanStatus,
  type ScheduleOptions,
  type ScheduleSlot,
  type SlotKind,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { PersonPicker } from './PersonPicker';
import { fromLocalInput, liveAssignments, scheduleErrorKey, timeRange, toLocalInput } from './schedule';

type Limits = ScheduleOptions['limits'];

/** Add a slot to a unit's month, or (with `existing`) change one while the plan is a draft. */
export function SlotForm({
  unitId,
  kinds,
  limits,
  month,
  existing,
  onDone,
  onCancel,
}: {
  unitId: string;
  kinds: SlotKind[];
  limits: Limits;
  month: string;
  existing?: ScheduleSlot;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<SlotKind>(existing?.kind ?? 'SERVICE');
  const [starts, setStarts] = useState(toLocalInput(existing?.startsAt ?? null) || `${month}-01T08:00`);
  const [ends, setEnds] = useState(toLocalInput(existing?.endsAt ?? null));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [wide, setWide] = useState(existing?.churchWide ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const startsAt = fromLocalInput(starts);
    const endsAt = ends ? fromLocalInput(ends) : null;
    if (!title.trim() || !startsAt || (ends && !endsAt)) return setError(t('door.sched.form.incomplete'));
    const input = { title: title.trim(), kind, startsAt, endsAt, location: location.trim() || null, notes: notes.trim() || null, churchWide: wide };
    setBusy(true);
    setError('');
    try {
      if (existing) await editSlot(existing.id, input);
      else await addSlot(unitId, input);
      onDone();
    } catch (err) {
      setError(t(scheduleErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h4>{existing ? t('door.sched.form.edit') : t('door.sched.form.new')}</h4>
      <TextField label={t('door.sched.form.title')} name="s-title" value={title} maxLength={limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      <SelectField label={t('door.sched.form.kind')} name="s-kind" value={kind} onChange={(e) => setKind(e.target.value as SlotKind)}>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {t(`door.sched.kind.${k}` as const)}
          </option>
        ))}
      </SelectField>
      <TextField label={t('door.sched.form.starts')} name="s-starts" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
      <TextField label={t('door.sched.form.ends')} name="s-ends" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
      <TextField label={t('door.sched.form.location')} name="s-loc" value={location} maxLength={limits.titleMax} onChange={(e) => setLocation(e.target.value)} />
      <TextAreaField label={t('door.sched.form.notes')} name="s-notes" rows={3} value={notes} maxLength={limits.noteMax} onChange={(e) => setNotes(e.target.value)} />
      <label className="door-check">
        <input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} /> {t('door.sched.form.churchWide')}
      </label>
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {existing ? t('door.sched.form.save') : t('door.sched.form.add')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** One slot with its team. `editable` is a draft plan the person may build; `published` lets assignees answer. */
export function SlotCard({
  slot,
  unitId,
  status,
  canWrite,
  kinds,
  limits,
  month,
  onChange,
}: {
  slot: ScheduleSlot;
  unitId: string;
  status: PlanStatus;
  canWrite: boolean;
  kinds: SlotKind[];
  limits: Limits;
  month: string;
  onChange: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState('');
  const [decline, setDecline] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [replacing, setReplacing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const draft = status === 'DRAFT';

  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setDecline(null);
      setReplacing(null);
      setReason('');
      onChange();
    } catch (err) {
      setError(t(scheduleErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };

  if (editing) {
    return (
      <SlotForm unitId={unitId} kinds={kinds} limits={limits} month={month} existing={slot} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} />
    );
  }

  return (
    <li className="panel door-slot">
      <div className="door-row">
        <strong>{slot.title}</strong>
        <span className="door-chip">{t(`door.sched.kind.${slot.kind}` as const)}</span>
        {slot.churchWide && <span className="door-chip">{t('door.sched.churchWideChip')}</span>}
      </div>
      <p className="muted">
        {timeRange(slot.startsAt, slot.endsAt, locale)}
        {slot.location ? ` · ${slot.location}` : ''}
      </p>
      {slot.notes && <p>{slot.notes}</p>}
      {liveAssignments(slot).length > 0 && (
        <ul className="door-list">
          {liveAssignments(slot).map((a) => (
            <li key={a.id}>
              <span>
                <strong>{a.personName}</strong> · {a.role}
              </span>
              {a.status === 'DECLINED' && (
                <span className="door-chip warn">{t('door.sched.declined', { reason: a.declineReason ?? '' })}</span>
              )}
              {draft && canWrite && (
                <button type="button" className="btn ghost sm" onClick={() => void run(() => removeAssignment(a.id))}>
                  {t('door.sched.unassign')}
                </button>
              )}
              {status === 'PUBLISHED' && a.mine && a.status === 'ASSIGNED' && decline !== a.id && (
                <button type="button" className="btn ghost sm" onClick={() => setDecline(a.id)}>
                  {t('door.sched.decline')}
                </button>
              )}
              {a.status === 'DECLINED' && canWrite && replacing !== a.id && (
                <button type="button" className="btn secondary sm" onClick={() => setReplacing(a.id)}>
                  {t('door.sched.replace')}
                </button>
              )}
              {decline === a.id && (
                <div className="door-form">
                  <TextAreaField label={t('door.sched.declineReason')} name={`d-${a.id}`} rows={2} value={reason} maxLength={limits.noteMax} onChange={(e) => setReason(e.target.value)} />
                  <div className="door-row">
                    <button type="button" className="btn sm" disabled={!reason.trim()} onClick={() => void run(() => declineAssignment(a.id, reason.trim()))}>
                      {t('door.sched.declineConfirm')}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setDecline(null)}>
                      {t('door.settings.cancel')}
                    </button>
                  </div>
                </div>
              )}
              {replacing === a.id && (
                <PersonPicker label={t('door.sched.replaceWith')} name={`r-${a.id}`} onPick={(p) => void run(() => replaceAssignment(a.id, p.id))} />
              )}
            </li>
          ))}
        </ul>
      )}
      {draft && canWrite && (
        <>
          <TextField label={t('door.sched.role')} name={`role-${slot.id}`} value={role} maxLength={limits.titleMax} placeholder={t('door.sched.rolePlaceholder')} onChange={(e) => setRole(e.target.value)} />
          <PersonPicker
            label={t('door.sched.assign')}
            name={`who-${slot.id}`}
            onPick={(p) => {
              if (!role.trim()) return setError(t('door.sched.err.roleFirst'));
              void run(async () => {
                await assignToSlot(slot.id, p.id, role.trim());
                setRole('');
              });
            }}
          />
          <div className="door-row">
            <button type="button" className="btn secondary sm" onClick={() => setEditing(true)}>
              {t('door.sched.form.edit')}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => void run(() => removeSlot(slot.id))}>
              {t('door.sched.removeSlot')}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
