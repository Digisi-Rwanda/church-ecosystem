import { Suspense, type ReactNode } from 'react';
import { PageSkeleton } from './Skeletons';

/** Holds the page area while a page's code arrives, showing the page's shape and keeping the frame in place. */
export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}
