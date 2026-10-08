import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { newDesignRoutes } from './newdesign/NewDesignRoutes';
import { ShellSkeleton } from './newdesign/kit';

/**
 * The app people use: sign-in, Portal and the systems. It carries none of the old app's
 * screens, stores or providers, so the first visit downloads only what it shows.
 */
export default function NewApp() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <Suspense fallback={<ShellSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to="/portal" replace />} />
            <Route path="/login" element={<Navigate to="/signin" replace />} />
            {newDesignRoutes()}
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </ToastProvider>
  );
}
