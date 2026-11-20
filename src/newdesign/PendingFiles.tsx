import { useRef, useState } from 'react';
import { uploadPlanFile } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { FILE_ACCEPT, FILE_MAX, extOf, fileSize, mimeOf, toBase64 } from './fileKit';

export const PENDING_MAX = 10;

/** Files chosen on a create form. They wait here until the plan exists, then `uploadPending` sends them. */
export function PendingFiles({ files, onChange, disabled }: { files: File[]; onChange: (next: File[]) => void; disabled?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const pick = (list: FileList | null) => {
    setError('');
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      if (!mimeOf(f.name)) { setError(t('door.p360.docs.type')); continue; }
      if (f.size > FILE_MAX) { setError(t('door.p360.docs.tooBig')); continue; }
      if (next.length >= PENDING_MAX) { setError(t('door.plan.files.many', { n: PENDING_MAX })); break; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    onChange(next);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="ap-files">
      <div className="door-row">
        <input ref={input} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => pick(e.target.files)} aria-label={t('door.plan.files.add')} />
        <button type="button" className="btn" disabled={disabled} onClick={() => input.current?.click()}>{t('door.plan.files.add')}</button>
        <span className="muted">{t('door.p360.docs.hint')}</span>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      {files.length > 0 && (
        <ul className="p360-files">
          {files.map((f, i) => (
            <li key={`${f.name}|${f.size}|${i}`} className="p360-file p360-doc">
              <span className="doc" aria-hidden="true">{extOf(f.name)}</span>
              <span className="p360-doc-main"><strong>{f.name}</strong><small>{fileSize(f.size)}</small></span>
              <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))}>{t('door.p360.docs.remove')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sends the waiting files to a plan one at a time. Returns the ones that did not go, so the form can keep them. */
export async function uploadPending(planId: string, files: File[]): Promise<File[]> {
  const failed: File[] = [];
  for (const f of files) {
    try {
      await uploadPlanFile(planId, { name: f.name, mime: mimeOf(f.name) ?? 'application/octet-stream', data: await toBase64(f) });
    } catch {
      failed.push(f);
    }
  }
  return failed;
}
