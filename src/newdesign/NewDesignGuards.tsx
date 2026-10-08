import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShellSkeleton } from './kit';
import { warmCommon } from './warm';
import { FrontDoorProvider, useFrontDoor } from './FrontDoorContext';

export function NewDesignLayout() {
  return (
    <FrontDoorProvider>
      <Suspense fallback={<ShellSkeleton />}>
        <Outlet />
      </Suspense>
    </FrontDoorProvider>
  );
}

/** Everything behind sign-in: a person who is not signed in goes to the new sign-in page. */
export function RequireSignedIn() {
  const { status } = useFrontDoor();
  const location = useLocation();
  useEffect(() => {
    if (status === 'in') warmCommon();
  }, [status]);
  if (status === 'checking' || status === 'loading') {
    return <ShellSkeleton />;
  }
  if (status === 'out') return <Navigate to="/signin" replace state={{ from: location }} />;
  return <Outlet />;
}
