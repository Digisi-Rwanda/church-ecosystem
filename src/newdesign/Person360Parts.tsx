import { useState, type FormEvent } from 'react';
import {
  addP360Record, changeP360Record, fetchP360History, fetchPeopleFilterOptions, voidP360Record,
  type DirectoryPerson, type P360Record, type P360Section,
} from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { fieldsFor, formData, labelKey, p360ErrorKey, sectionKey, valueKey, valueText } from './person360';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

/** Add a record to a section, or (with `existing`) change it: the old one stays in history. */
export function RecordForm({ personId, section, existing, preset, onDone, onCancel }: { personId: string; section: P360Section; existing?: P360Record; preset?: Record<string, string>; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...preset, ...Object.fromEntries(Object.entries(existing?.data ?? {}).map(([k, v]) => [k, String(v)])) }));
  const units = useLoad(() => (section === 'CALLING' ? fetchPeopleFilterOptions() : Promise.resolve(null)), `rf-units|${section}`);
  const [saved, setSaved] = useState(0);
  const again = !existing && section === 'FAMILY' && values.relation === 'CHILD';
  const [pickedName, setPickedName] = useState(existing?.relatedName ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const submit = async (e: FormEvent, more = false) => {
    e.preventDefault();
    if (saved > 0 && !more && !values.name && !values.relatedPersonId) return onDone();
    const data = formData(section, values);
    if (!data) return setError(t('door.p360.err.input'));
    setBusy(true);
    setError('');
    try {
      if (existing) await changeP360Record(existing.id, data);
      else await addP360Record(personId, section, data);
      if (more) {
        // Another child: the form stays open and empty, keeping only that it is a child.
        setValues({ relation: 'CHILD' });
        setPickedName('');
        setSaved((n) => n + 1);
        setBusy(false);
        return;
      }
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
      {fieldsFor(section, values).map((f) =>
        f.type === 'unit' ? (
          <SelectField key={f.key} label={t('door.p360.f.orgUnitId')} name={`p-${f.key}`} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {(units.data?.units ?? []).map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </SelectField>
        ) : f.type === 'select' ? (
          <SelectField key={f.key} label={t(labelKey(section, f.key, values) as 'door.p360.f.status')} name={`p-${f.key}`} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
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
              <strong>{t(labelKey(section, f.key, values) as 'door.p360.f.relatedPersonId')}:</strong> {pickedName || <span className="muted">{t('door.p360.noMember')}</span>}
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
            label={t(labelKey(section, f.key, values) as 'door.p360.f.date')}
            name={`p-${f.key}`}
            type={f.type === 'date' ? 'date' : 'text'}
            inputMode={f.type === 'number' ? 'numeric' : undefined}
            maxLength={f.max}
            placeholder={f.key === 'business' ? t('door.p360.f.business.ph') : undefined}
            value={values[f.key] ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ),
      )}
      {saved > 0 && <p className="door-ok" role="status">{t('door.p360.childrenSaved', { count: saved })}</p>}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.p360.save')}
        </button>
        {again && (
          <button type="button" className="btn ghost" disabled={busy} onClick={(e) => void submit(e as unknown as FormEvent, true)}>
            {t('door.p360.saveAddChild')}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

export function Facts({ r }: { r: P360Record }) {
  const t = useT();
  const entries = Object.entries(r.data).filter(([k]) => k !== 'relatedPersonId' && k !== 'spousePersonId' && k !== 'orgUnitId');
  return (
    <dl className="door-facts">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{t(labelKey(r.section, k, r.data) as 'door.p360.f.date')}</dt>
          <dd>{valueText(t as never, v)}</dd>
        </div>
      ))}
      {r.unitName && (
        <div>
          <dt>{t('door.p360.f.orgUnitId')}</dt>
          <dd>{r.unitName}</dd>
        </div>
      )}
      {r.relatedName && (
        <div>
          <dt>{t((r.section === 'MARRIAGE' ? 'door.p360.f.spousePersonId' : 'door.p360.f.relatedPersonId') as 'door.p360.f.relatedPersonId')}</dt>
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
                <span className="door-chip">{t(`door.p360.status.${h.status}` as const)}</span> {Object.entries(h.data).filter(([k]) => !k.endsWith('PersonId')).map(([k, v]) => `${t(labelKey(h.section, k, h.data) as 'door.p360.f.date')}: ${valueText(t as never, v)}`).join(' · ')}
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
