import { useState, type FormEvent } from 'react';
import {
  addP360Record, changeP360Record, fetchP360History, voidP360Record,
  type DirectoryPerson, type P360Record, type P360Section,
} from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { FIELDS, fieldKey, formData, p360ErrorKey, sectionKey, valueKey } from './person360';
import { PersonPicker } from './PersonPicker';

/** Add a record to a section, or (with `existing`) change it: the old one stays in history. */
export function RecordForm({ personId, section, existing, onDone, onCancel }: { personId: string; section: P360Section; existing?: P360Record; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(existing?.data ?? {}).map(([k, v]) => [k, String(v)])));
  const [pickedName, setPickedName] = useState(existing?.relatedName ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = formData(section, values);
    if (!data) return setError(t('door.p360.err.input'));
    setBusy(true);
    setError('');
    try {
      if (existing) await changeP360Record(existing.id, data);
      else await addP360Record(personId, section, data);
      onDone();
    } catch (err) {
      setError(t(p360ErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{existing ? t('door.p360.change', { section: t(sectionKey(section)) }) : t('door.p360.add', { section: t(sectionKey(section)) })}</h3>
      {existing && <p className="muted">{t('door.p360.historyKept')}</p>}
      {FIELDS[section].map((f) =>
        f.type === 'select' ? (
          <SelectField key={f.key} label={t(fieldKey(f.key) as 'door.p360.f.status')} name={`p-${f.key}`} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {t(valueKey(o) as 'door.p360.v.EMPLOYED')}
              </option>
            ))}
          </SelectField>
        ) : f.type === 'person' ? (
          <div key={f.key}>
            <p>
              <strong>{t(fieldKey(f.key) as 'door.p360.f.relatedPersonId')}:</strong> {pickedName || <span className="muted">{t('door.p360.noMember')}</span>}
            </p>
            <PersonPicker
              label={t('door.p360.pickMember')}
              name={`p-${f.key}`}
              onPick={(p: DirectoryPerson) => {
                set(f.key, p.id);
                setPickedName(p.fullName);
              }}
            />
          </div>
        ) : (
          <TextField
            key={f.key}
            label={t(fieldKey(f.key) as 'door.p360.f.date')}
            name={`p-${f.key}`}
            type={f.type === 'date' ? 'date' : 'text'}
            inputMode={f.type === 'number' ? 'numeric' : undefined}
            maxLength={f.max}
            value={values[f.key] ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ),
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.p360.save')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

function Facts({ r }: { r: P360Record }) {
  const t = useT();
  const entries = Object.entries(r.data).filter(([k]) => k !== 'relatedPersonId' && k !== 'spousePersonId');
  return (
    <dl className="door-facts">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{t(fieldKey(k) as 'door.p360.f.date')}</dt>
          <dd>{typeof v === 'string' && /^[A-Z_]+$/.test(v) ? t(valueKey(v) as 'door.p360.v.EMPLOYED') : String(v)}</dd>
        </div>
      ))}
      {r.relatedName && (
        <div>
          <dt>{t(fieldKey(r.section === 'MARRIAGE' ? 'spousePersonId' : 'relatedPersonId') as 'door.p360.f.relatedPersonId')}</dt>
          <dd>{r.relatedName}</dd>
        </div>
      )}
      {r.programName && (
        <div>
          <dt>{t('door.p360.cohort')}</dt>
          <dd>{r.programName}</dd>
        </div>
      )}
    </dl>
  );
}

/** One current record with change, void (reason) and its history. */
export function RecordCard({ record, personId, onChange }: { record: P360Record; personId: string; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [mode, setMode] = useState<'change' | 'void' | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<P360Record[] | null>(null);
  const [error, setError] = useState('');
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const doVoid = async () => {
    setError('');
    try {
      await voidP360Record(record.id, reason.trim());
      onChange();
    } catch (err) {
      setError(t(p360ErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const showHistory = async () => {
    try {
      setHistory(await fetchP360History(record.id));
    } catch {
      setError(t('door.people.actionFailed'));
    }
  };
  if (mode === 'change') return <RecordForm personId={personId} section={record.section} existing={record} onDone={onChange} onCancel={() => setMode(null)} />;
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <Facts r={record} />
        <p className="muted">{t('door.p360.recorded', { name: record.recordedByName, date: day(record.recordedAt) })}</p>
        {mode === 'void' ? (
          <div className="door-form">
            <TextField label={t('door.money.reason')} name={`v-${record.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="door-row">
              <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void doVoid()}>
                {t('door.p360.void')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setMode(null)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="door-row">
            {record.canChange && (
              <>
                <button type="button" className="btn ghost sm" onClick={() => setMode('change')}>
                  {t('door.p360.changeBtn')}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setMode('void')}>
                  {t('door.p360.void')}
                </button>
              </>
            )}
            <button type="button" className="btn ghost sm" onClick={() => void showHistory()}>
              {t('door.p360.history')}
            </button>
          </div>
        )}
        {history && (
          <ul className="door-list">
            {history.map((h) => (
              <li key={h.id}>
                <span className="door-chip">{t(`door.p360.status.${h.status}` as const)}</span> {Object.entries(h.data).filter(([k]) => !k.endsWith('PersonId')).map(([k, v]) => `${t(fieldKey(k) as 'door.p360.f.date')}: ${v}`).join(' · ')}
                <span className="muted"> — {h.recordedByName}, {day(h.recordedAt)}{h.voidReason ? ` — ${h.voidReason}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
