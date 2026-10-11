import { Suspense, lazy } from 'react';
import { ThemeProvider } from './theme/theme';

// One app. Old addresses (/people, /programs, ...) are sent to the Portal by NewApp's catch-all.
const NewApp = lazy(() => import('./NewApp'));

export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<div className="route-loading" role="status" aria-busy="true" />}>
        <NewApp />
      </Suspense>
    </ThemeProvider>
  );
}
