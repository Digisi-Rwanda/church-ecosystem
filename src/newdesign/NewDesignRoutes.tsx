import { Route } from 'react-router-dom';
import { AccessPage } from './AccessPage';
import { AddPersonPage } from './AddPersonPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { AppointmentsPage } from './AppointmentsPage';
import { NewDesignLayout, RequireSignedIn } from './NewDesignGuards';
import { NewSignInPage } from './NewSignInPage';
import { NotificationsPage } from './NotificationsPage';
import { OrgTreePage } from './OrgTreePage';
import { PeopleDirectoryPage } from './PeopleDirectoryPage';
import { PeopleLayout } from './PeopleLayout';
import { PersonCardPage } from './PersonCardPage';
import { PreferencesPage } from './PreferencesPage';
import { PortalBlockPage } from './PortalBlockPage';
import { PortalLayout } from './PortalLayout';
import { PortalPage } from './PortalPage';
import { SystemBlockPage } from './SystemBlockPage';
import { SystemFrame } from './SystemFrame';
import { UnitPage } from './UnitPage';

/**
 * The new routes, to be placed inside <Routes>. Only added when the new-design
 * switch is on (see lib/newDesign.ts); the old app's routes are untouched.
 */
export function newDesignRoutes() {
  return (
    <Route element={<NewDesignLayout />}>
      <Route path="/signin" element={<NewSignInPage />} />
      <Route element={<RequireSignedIn />}>
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="notifications/preferences" element={<PreferencesPage />} />
          <Route path=":block" element={<PortalBlockPage />} />
        </Route>
        <Route path="/s/:systemId" element={<SystemFrame />}>
          <Route index element={<SystemBlockPage />} />
          <Route path="people" element={<PeopleLayout />}>
            <Route index element={<PeopleDirectoryPage />} />
            <Route path="new" element={<AddPersonPage />} />
            <Route path="units" element={<OrgTreePage />} />
            <Route path="units/:unitId" element={<UnitPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="access" element={<AccessPage />} />
            <Route path=":personId" element={<PersonCardPage />} />
          </Route>
          <Route path=":block" element={<SystemBlockPage />} />
        </Route>
      </Route>
    </Route>
  );
}
