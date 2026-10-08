import { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { belongsToNewApp, isNewDesign } from './lib/newDesign';
import { ThemeProvider } from './theme/theme';

// Two apps in two files. The new one is what people see; the old one downloads only when an old address is opened.
const NewApp = lazy(() => import('./NewApp'));
const LegacyApp = lazy(() => import('./LegacyApp'));

export default function App() {
  const { pathname } = useLocation();
  const fresh = belongsToNewApp(pathname, isNewDesign());
  return (
    <ThemeProvider>
      <Suspense fallback={<div className="route-loading" role="status" aria-busy="true" />}>
        {fresh ? <NewApp /> : <LegacyApp />}
      </Suspense>
    </ThemeProvider>
  );
}
