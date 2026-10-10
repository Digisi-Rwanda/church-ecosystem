import { useRef, useState, type FormEvent } from 'react';
import { deleteP360Document, fetchP360DocumentFile, fetchP360Documents, updatePerson, uploadP360Document, type P360Person } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx';
const MAX = 1_500_000;
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const size = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** The basic details of a person: name, contact, birthday, gender, address, National ID, joined date. */
export function BasicsForm({ person, onSaved }: { person: P360Person; onSaved: () => void }) {
  const t = useT();
  const [v, setV] = useState({
    fullName: person.fullName, phone: person.phone ?? '', email: person.email ?? '', dateOfBirth: person.dateOfBirth ?? '', gender: person.gender ?? '',
    address: person.address ?? '', nationalId: person.nationalId ?? '', joinedChurchOn: person.joinedChurchOn ?? '',
  });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.fullName.trim()) return setError(t('door.p360.edit.nameRequired'));
    setBusy(true);
    setError('');
    setNote('');
    try {
      const blank = (x: string) => (x.trim() === '' ? null : x.trim());
      await updatePerson(person.id, {
        fullName: v.fullName.trim(), phone: blank(v.phone), email: blank(v.email), dateOfBirth: blank(v.dateOfBirth), gender: blank(v.gender), address: blank(v.address),
        // The National ID is shown only to the Church Leader; leave it alone when it was not shown.
        ...(person.nationalId !== null ? { nationalId: blank(v.nationalId) } : {}), joinedChurchOn: blank(v.joinedChurchOn),
      });
      setNote(t('door.p360.edit.saved'));
      onSaved();
    } catch {
      setError(t('door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.p360.edit.basics')}</h3>
      <TextField label={t('door.p360.edit.fullName')} name="e-name" value={v.fullName} maxLength={120} onChange={set('fullName')} />
      <div className="ap-grid">
        <TextField label={t('door.p360.f.phone')} name="e-phone" inputMode="tel" value={v.phone} onChange={set('phone')} />
        <TextField label={t('door.p360.f.email')} name="e-email" type="email" value={v.email} onChange={set('email')} />
        <TextField label={t('door.p360.f.dateOfBirth')} name="e-dob" type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} />
        <SelectField label={t('door.p360.f.gender')} name="e-gender" value={v.gender} onChange={set('gender')}>
          <option value="">—</option>
          {[...new Set(['Female', 'Male', v.gender].filter(Boolean))].map((g) => (<option key={g} value={g}>{g}</option>))}
        </SelectField>
        <TextField label={t('door.p360.f.address')} name="e-address" value={v.address} onChange={set('address')} />
        {person.nationalId !== null && <TextField label={t('door.p360.f.nationalId')} name="e-nid" value={v.nationalId} maxLength={30} onChange={set('nationalId')} />}
        <TextField label={t('door.p360.f.joinedChurchOn')} name="e-joined" type="date" value={v.joinedChurchOn} onChange={set('joinedChurchOn')} />
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      {note && <p className="muted" role="status">{note}</p>}
      <div className="door-row"><button type="submit" className="btn" disabled={busy}>{t('door.work.form.save')}</button></div>
    </form>
  );
}

/** Files and documents kept on the profile: certificates, letters, ID copies. Add, download and remove. */
export function Documents({ personId }: { personId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const load = useLoad(() => fetchP360Documents(personId), `p360-docs|${personId}`);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME[ext];
    if (!mime) return setError(t('door.p360.docs.type'));
    if (file.size > MAX) return setError(t('door.p360.docs.tooBig'));
    setBusy(true);
    try {
      await uploadP360Document(personId, { name: file.name, mime, data: await toBase64(file) });
      load.reload();
    } catch {
      setError(t('door.people.actionFailed'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const download = async (id: string) => {
    setError('');
    try {
      const f = await fetchP360DocumentFile(id);
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setError(t('door.people.actionFailed'));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteP360Document(id);
      setConfirm(null);
      load.reload();
    } catch {
      setError(t('door.people.actionFailed'));
    }
  };
  const d = load.data;
  return (
    <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
      <div className="p360-docs">
        {d?.canWrite && (
          <div className="door-row">
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => void pick(e.target.files?.[0])} aria-label={t('door.p360.docs.add')} />
            <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{t('door.p360.docs.add')}</button>
            <span className="muted">{t('door.p360.docs.hint')}</span>
          </div>
        )}
        {error && <p className="door-error" role="alert">{error}</p>}
        {d && d.items.length === 0 ? <p className="muted">{t('door.p360.docs.none')}</p> : (
          <ul className="p360-files">
            {(d?.items ?? []).map((f) => (
              <li key={f.id} className="p360-file p360-doc">
                <span className="doc" aria-hidden="true">{(f.name.split('.').pop() ?? '').slice(0, 4).toUpperCase()}</span>
                <span className="p360-doc-main"><strong>{f.name}</strong><small>{[size(f.size), t('door.p360.docs.by', { name: f.uploadedByName }), day(f.uploadedAt)].join(' · ')}</small></span>
                <button type="button" className="btn ghost sm" onClick={() => void download(f.id)}>{t('door.p360.docs.download')}</button>
                {d?.canWrite && (confirm === f.id ? (
                  <>
                    <button type="button" className="btn sm danger" onClick={() => void remove(f.id)}>{t('door.p360.docs.confirm')}</button>
                    <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>{t('door.settings.cancel')}</button>
                  </>
                ) : (
                  <button type="button" className="btn ghost sm" onClick={() => setConfirm(f.id)}>{t('door.p360.docs.remove')}</button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </LoadState>
  );
}
