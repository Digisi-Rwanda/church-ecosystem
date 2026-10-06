import type { ReactNode } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { useT } from '../i18n/I18nContext';

/** The same three states on every screen that loads from the server: loading, failed, or the content. */
export function LoadState({
  loading,
  failed,
  retry,
  children,
}: {
  loading: boolean;
  failed: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  const t = useT();
  if (loading) {
    return (
      <div className="door-center" role="status">
        <Spinner size="lg" label={t('door.people.loading')} />
      </div>
    );
  }
  if (failed) {
    return (
      <EmptyState
        variant="error"
        title={t('door.people.error')}
        action={
          <button type="button" className="btn" onClick={retry}>
            {t('door.people.retry')}
          </button>
        }
      />
    );
  }
  return <>{children}</>;
}
