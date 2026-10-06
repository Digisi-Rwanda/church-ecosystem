import { Route } from 'react-router-dom';
import { NewDesignLayout, RequireSignedIn } from './NewDesignGuards';
import { NewSignInPage } from './NewSignInPage';
import { PortalPage } from './PortalPage';
import { SystemBlockPage } from './SystemBlockPage';
import { SystemFrame } from './SystemFrame';

/**
 * The new routes, to be placed inside <Routes>. Only added when the new-design
 * switch is on (see lib/newDesign.ts); the old app's routes are untouched.
 */
export function newDesignRoutes() {
  return (
    <Route element={<NewDesignLayout />}>
      <Route path="/signin" element={<NewSignInPage />} />
      <Route element={<RequireSignedIn />}>
        <Route path="/portal" element={<PortalPage />} />
        <Route path="/s/:systemId" element={<SystemFrame />}>
          <Route index element={<SystemBlockPage />} />
          <Route path=":block" element={<SystemBlockPage />} />
        </Route>
      </Route>
    </Route>
  );
}
