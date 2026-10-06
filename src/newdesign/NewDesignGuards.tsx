import { Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { FrontDoorProvider, useFrontDoor } from './FrontDoorContext';

export function NewDesignLayout() {
  return (
    <FrontDoorProvider>
      <Suspense fallback={<div className="route-loading" role="status">…</div>}>
        <Outlet />
      </Suspense>
    </FrontDoorProvider>
  );
}

/** Everything behind sign-in: a person who is not signed in goes to the new sign-in page. */
export function RequireSignedIn() {
  const { status } = useFrontDoor();
  const location = useLocation();
  if (status === 'checking') {
    return (
      <div className="door-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (status === 'out') return <Navigate to="/signin" replace state={{ from: location }} />;
  return <Outlet />;
}
