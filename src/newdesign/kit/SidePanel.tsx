import type { ReactNode } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { useT } from '../../i18n/I18nContext';

/**
 * Create and edit happen here, beside the list, so the list never moves away.
 * One filled "save" button, one quiet "cancel"; both stop while saving.
 */
export function SidePanel({
  open,
  title,
  purpose,
  onClose,
  onSave,
  saveLabel,
  saving = false,
  canSave = true,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  purpose?: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  canSave?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  return (
    <Drawer
      open={open}
      title={title}
      subtitle={purpose}
      onClose={onClose}
      wide={wide}
      footer={
        onSave ? (
          <div className="panel-footer-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
              {t('kit.cancel')}
            </button>
            <button type="button" className="btn" onClick={onSave} disabled={saving || !canSave}>
              {saving ? t('kit.saving') : (saveLabel ?? t('kit.save'))}
            </button>
          </div>
        ) : undefined
      }
    >
      {children}
    </Drawer>
  );
}
