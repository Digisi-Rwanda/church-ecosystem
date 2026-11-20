import type { ReactNode } from 'react';
import type { ApiErrorKind } from '../api/client';
import { LoadErrorState } from './LoadErrorState';
import { PageSkeleton } from './kit';

/** The same three states on every screen that loads from the server: loading, failed, or the content. */
export function LoadState({
  loading,
  failed,
  retry,
  children,
}: {
  loading: boolean;
  /** False, or what went wrong (`true` is read as an unexpected failure). */
  failed: boolean | ApiErrorKind;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return <PageSkeleton header={false} />;
  }
  if (failed) return <LoadErrorState kind={failed === true ? 'server' : failed} retry={retry} />;
  return <>{children}</>;
}
