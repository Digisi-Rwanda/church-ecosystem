import { useState, type FormEvent } from 'react';
import {
  deliverLetter,
  draftLetter,
  editLetter,
  withdrawLetter,
  type DeliveryMethod,
  type LetterDetail,
  type LetterOptions,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode, govErrorKey } from './governance';

/** Draft a new letter, or (with `existing`) change a draft that is not printed yet. */
export function LetterForm({
  options,
  existing,
  onDone,
  onCancel,
}: {
  options: LetterOptions;
  existing?: LetterDetail;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [unitId, setUnitId] = useState(existing?.orgUnitId ?? (options.units.length === 1 ? options.units[0].id : ''));
  const [typeCode, setTypeCode] = useState(existing?.typeCode ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [recipient, setRecipient] = useState(existing?.recipientName ?? '');
  const [note, setNote] = useState(existing?.recipientNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!existing && (!unitId || !typeCode)) return setError(t('door.letters.form.incomplete'));
    if (subject.trim().length < 3 || body.trim().length < 3 || recipient.trim().length < 2) return setError(t('door.letters.form.incomplete'));
    setBusy(true);
    setError('');
    try {
      if (existing) {
        await editLetter(existing.id, { subject: subject.trim(), body: body.trim(), recipientName: recipient.trim(), recipientNote: note.trim() });
        onDone(existing.id);
      } else {
        const id = await draftLetter({ orgUnitId: unitId, typeCode, subject: subject.trim(), body: body.trim(), recipientName: recipient.trim(), recipientNote: note.trim() || undefined });
        onDone(id);
      }
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{existing ? t('door.letters.form.edit') : t('door.letters.form.new')}</h3>
      {!existing && (
        <>
          <SelectField label={t('door.letters.form.unit')} name="l-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {options.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('door.letters.form.type')} name="l-type" value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {options.letterTypes.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </SelectField>
        </>
      )}
      <TextField label={t('door.letters.form.recipient')} name="l-recipient" value={recipient} maxLength={160} onChange={(e) => setRecipient(e.target.value)} />
      <TextField label={t('door.letters.form.recipientNote')} name="l-note" hint={t('door.letters.form.recipientNoteHint')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <TextField label={t('door.letters.form.subject')} name="l-subject" value={subject} maxLength={options.limits.subjectMax} onChange={(e) => setSubject(e.target.value)} />
      <TextAreaField label={t('door.letters.form.body')} name="l-body" rows={10} value={body} maxLength={options.limits.bodyMax} onChange={(e) => setBody(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {existing ? t('door.letters.form.save') : t('door.letters.form.create')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Record how and when a printed, signed letter reached its recipient. */
export function DeliverForm({ letter, methods, onDone, onCancel }: { letter: LetterDetail; methods: DeliveryMethod[]; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [method, setMethod] = useState<DeliveryMethod | ''>('');
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!method || !on) return setError(t('door.letters.deliver.incomplete'));
    setBusy(true);
    setError('');
    try {
      await deliverLetter(letter.id, { method, deliveredOn: on, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.letters.deliver.title')}</h3>
      <p className="muted">{t('door.letters.deliver.hint')}</p>
      <SelectField label={t('door.letters.deliver.method')} name="d-method" value={method} onChange={(e) => setMethod(e.target.value as DeliveryMethod | '')}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {methods.map((m) => (
          <option key={m} value={m}>
            {t(`door.letters.method.${m}` as const)}
          </option>
        ))}
      </SelectField>
      <TextField label={t('door.letters.deliver.on')} name="d-on" type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} />
      <TextField label={t('door.letters.deliver.note')} name="d-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.letters.deliver.submit')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

export function WithdrawForm({ id, onDone, onCancel }: { id: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(t('door.letters.withdraw.reasonRequired'));
    setBusy(true);
    setError('');
    try {
      await withdrawLetter(id, reason.trim());
      onDone();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <TextField label={t('door.letters.withdraw.reason')} name="w-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn danger" disabled={busy}>
          {t('door.letters.withdraw.confirm')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}
