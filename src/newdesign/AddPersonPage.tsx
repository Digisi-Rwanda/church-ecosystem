import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPerson, type NewPerson } from '../api/frontDoorApi';
import { ApiError } from '../api/client';
import { TextField } from '../components/ui/Field';
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
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', dateOfBirth: '', nationalId: '' });
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
    const body: NewPerson = { fullName: form.fullName.trim(), confirmDuplicate };
    for (const k of ['phone', 'email', 'dateOfBirth', 'nationalId'] as const) {
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
        <TextField label={t('door.people.form.phone')} name="phone" type="tel" value={form.phone} onChange={set('phone')} />
        <TextField label={t('door.people.form.email')} name="email" type="email" value={form.email} onChange={set('email')} />
        <TextField label={t('door.people.form.dateOfBirth')} name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
        <TextField label={t('door.people.form.nationalId')} name="nationalId" value={form.nationalId} onChange={set('nationalId')} />
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={busy}>
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
