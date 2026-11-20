import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPerson, type NewPerson } from '../api/frontDoorApi';
import { fetchRegistrationOptions } from '../api/personRegistrationApi';
import { ApiError } from '../api/client';
import { SelectField, TextField } from '../components/ui/Field';
import { PersonRegistrationSections, type RegistrationRecord } from './PersonRegistrationSections';
import { formData, sectionKey } from './person360';
import { useLoad } from './useLoad';
import { LoadState } from './LoadState';
import { useT } from '../i18n/I18nContext';
import { useCanWritePeople } from './usePeopleAccess';
import { PageHeader } from './kit';

type Candidate = { id: string; fullName: string; memberCode: string | null };

export function AddPersonPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const navigate = useNavigate();
  const canWrite = useCanWritePeople();
  const base = `/s/${systemId}/people`;
  const [form, setForm] = useState({ fullName: '', preferredName:'', phone: '', email: '', dateOfBirth: '', nationalId: '', gender:'', address:'', joinedChurchOn:'' });
  const [status,setStatus] = useState<NonNullable<NewPerson['status']>>('ACTIVE');
  const [records,setRecords] = useState<RegistrationRecord[]>([]);
  const options = useLoad(()=>canWrite ? fetchRegistrationOptions(systemId) : Promise.resolve({write:[]}), 'registration-options|'+systemId+'|'+canWrite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!canWrite) return <Link to={base}>{t('door.people.back')}</Link>;

  const submit = async (confirmDuplicate: boolean) => {
    if (!form.fullName.trim()) {
      setError(t('door.people.form.nameRequired'));
      return;
    }
    setBusy(true);
    setError('');
    const body: NewPerson = { fullName: form.fullName.trim(), status, confirmDuplicate, records:[], ...(systemId && systemId !== 'sys-main' ? { systemId } : {}) };
    for (const record of records) {
      const data = formData(record.section,record.values);
      if (!data) { setBusy(false); return setError(`${t(sectionKey(record.section))}: ${t('door.p360.err.input')}`); }
      body.records!.push({section:record.section,data});
    }
    for (const k of ['preferredName','phone', 'email', 'dateOfBirth', 'nationalId','gender','address','joinedChurchOn'] as const) {
      if (form[k].trim()) body[k] = form[k].trim();
    }
    try {
      const person = await createPerson(body);
      navigate(`${base}/${person.id}`);
    } catch (e) {
      const b = e instanceof ApiError ? (e.body as { code?: string; candidates?: Candidate[] } | undefined) : undefined;
      if (b?.code === 'POSSIBLE_DUPLICATE') setCandidates(b.candidates ?? []);
      else if (b?.code === 'DUPLICATE_NATIONAL_ID') setError(t('door.people.dup.nationalId'));
      else setError(t('door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCandidates([]);
    void submit(false);
  };

  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={base}>
        {t('door.people.back')}
      </Link>
      <PageHeader title={t('door.people.form.title')} />
      <form className="panel door-form" onSubmit={onSubmit} noValidate>
        <TextField label={t('door.people.form.fullName')} name="fullName" value={form.fullName} onChange={set('fullName')} required />
        <TextField label={t('door.people.form.preferredName')} name="preferredName" value={form.preferredName} onChange={set('preferredName')} />
        <TextField label={t('door.people.form.phone')} name="phone" type="tel" value={form.phone} onChange={set('phone')} />
        <TextField label={t('door.people.form.email')} name="email" type="email" value={form.email} onChange={set('email')} />
        <TextField label={t('door.people.form.dateOfBirth')} name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
        <TextField label={t('door.people.form.nationalId')} name="nationalId" value={form.nationalId} onChange={set('nationalId')} />
        <SelectField label={t('door.p360.f.gender')} name="gender" value={form.gender} onChange={set('gender')}><option value="">{t('door.gov.meeting.choose')}</option>{['MALE','FEMALE'].map(value=><option key={value} value={value}>{t(`door.p360.v.${value}` as 'door.p360.v.MALE')}</option>)}</SelectField>
        <TextField label={t('door.p360.f.address')} name="address" value={form.address} onChange={set('address')} />
        <TextField label={t('door.p360.f.joinedChurchOn')} name="joinedChurchOn" type="date" value={form.joinedChurchOn} onChange={set('joinedChurchOn')} />
        <SelectField label={t('door.people.statusFilter')} name="status" value={status} onChange={event=>setStatus(event.target.value as typeof status)}>{(['ACTIVE','INACTIVE','VISITOR'] as const).map(value=><option key={value} value={value}>{t(`door.status.${value}` as 'door.status.ACTIVE')}</option>)}</SelectField>
        <LoadState loading={options.loading} failed={options.failed} retry={options.reload}>
          <PersonRegistrationSections write={options.data?.write ?? []} records={records} onChange={setRecords} />
        </LoadState>
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={busy || options.loading || !!options.failed}>
          {busy ? t('door.people.form.saving') : t('door.people.form.save')}
        </button>
      </form>
      {candidates.length > 0 && (
        <div className="panel door-dup" role="alert">
          <h3>{t('door.people.dup.title')}</h3>
          <p className="muted">{t('door.people.dup.detail')}</p>
          <ul className="door-list">
            {candidates.map((c) => (
              <li key={c.id}>
                <Link to={`${base}/${c.id}`}>{c.fullName}</Link>
                <span className="muted"> {c.memberCode ?? ''}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void submit(true)}>
            {t('door.people.dup.addAnyway')}
          </button>
        </div>
      )}
    </div>
  );
}
