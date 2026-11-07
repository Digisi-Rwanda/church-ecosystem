import { useEffect, useId, useRef } from 'react';
import { useT } from '../../i18n/I18nContext';

/**
 * Asks before something that cannot be taken back easily. Says plainly what will happen;
 * the safe answer is the default focus and Escape.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelNow = useRef(onCancel);
  useEffect(() => {
    cancelNow.current = onCancel;
  });
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelNow.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="confirm-root" role="presentation">
      <button type="button" className="confirm-backdrop" aria-label={t('kit.cancel')} tabIndex={-1} onClick={onCancel} />
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId}>{title}</h3>
        <p>{body}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            {t('kit.cancel')}
          </button>
          <button type="button" className={danger ? 'btn danger' : 'btn'} onClick={onConfirm} disabled={busy}>
            {busy ? t('kit.working') : (confirmLabel ?? t('kit.confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
