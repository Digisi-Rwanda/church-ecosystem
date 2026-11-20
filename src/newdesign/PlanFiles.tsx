import { useRef, useState } from 'react';
import { deletePlanFile, fetchPlanFile, fetchPlanFiles, uploadPlanFile } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { FILE_ACCEPT, FILE_MAX, extOf, fileSize, mimeOf, saveBase64, toBase64 } from './fileKit';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

/** The files attached to an activity: a proposal, a letter, a budget sheet, a picture. Add, download and remove. */
export function PlanFiles({ planId, onChange }: { planId: string; onChange?: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const load = useLoad(() => fetchPlanFiles(planId), `plan-files|${planId}`);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const changed = () => { load.reload(); onChange?.(); };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    const mime = mimeOf(file.name);
    if (!mime) return setError(t('door.p360.docs.type'));
    if (file.size > FILE_MAX) return setError(t('door.p360.docs.tooBig'));
    setBusy(true);
    try {
      await uploadPlanFile(planId, { name: file.name, mime, data: await toBase64(file) });
      changed();
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
      saveBase64(await fetchPlanFile(planId, id));
    } catch {
      setError(t('door.people.actionFailed'));
    }
  };
  const remove = async (id: string) => {
    try {
      await deletePlanFile(planId, id);
      setConfirm(null);
      changed();
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
            <input ref={input} type="file" accept={FILE_ACCEPT} hidden onChange={(e) => void pick(e.target.files?.[0])} aria-label={t('door.plan.files.add')} />
            <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{t('door.plan.files.add')}</button>
            <span className="muted">{t('door.p360.docs.hint')}</span>
          </div>
        )}
        {error && <p className="door-error" role="alert">{error}</p>}
        {d && d.items.length === 0 ? <p className="muted">{t('door.plan.files.none')}</p> : (
          <ul className="p360-files">
            {(d?.items ?? []).map((f) => (
              <li key={f.id} className="p360-file p360-doc">
                <span className="doc" aria-hidden="true">{extOf(f.name)}</span>
                <span className="p360-doc-main"><strong>{f.name}</strong><small>{[fileSize(f.size), t('door.p360.docs.by', { name: f.uploadedByName }), day(f.uploadedAt)].join(' · ')}</small></span>
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
