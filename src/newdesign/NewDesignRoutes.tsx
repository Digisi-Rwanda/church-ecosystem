import { CollectionsPage } from './CollectionsPage';
import { MoneyPage } from './MoneyPage';
import { Route } from 'react-router-dom';
import { AccessPage } from './AccessPage';
import { AddPersonPage } from './AddPersonPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { AppointmentsPage } from './AppointmentsPage';
import { CentralHomePage } from './CentralHomePage';
import { DecisionsPage } from './DecisionsPage';
import { DeletedWorkPage } from './DeletedWorkPage';
import { LetterPage } from './LetterPage';
import { LettersPage } from './LettersPage';
import { GovernanceLayout } from './GovernanceLayout';
import { MeetingPage } from './MeetingPage';
import { MeetingsPage } from './MeetingsPage';
import { NewDesignLayout, RequireSignedIn } from './NewDesignGuards';
import { NewSignInPage } from './NewSignInPage';
import { NotificationsPage } from './NotificationsPage';
import { OrgTreePage } from './OrgTreePage';
import { PeopleDirectoryPage } from './PeopleDirectoryPage';
import { PeopleLayout } from './PeopleLayout';
import { PersonCardPage } from './PersonCardPage';
import { PreferencesPage } from './PreferencesPage';
import { SchedulePage } from './SchedulePage';
import { SettingsPage } from './SettingsPage';
import { PlanPage } from './PlanPage';
import { PortalBlockPage } from './PortalBlockPage';
import { PortalLayout } from './PortalLayout';
import { PortalPage } from './PortalPage';
import { SystemBlockPage } from './SystemBlockPage';
import { SystemFrame } from './SystemFrame';
import { UnitPage } from './UnitPage';
import { WorkPage } from './WorkPage';

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
          <Route path="governance" element={<GovernanceLayout />}>
            <Route index element={<MeetingsPage />} />
            <Route path="meetings/:meetingId" element={<MeetingPage />} />
            <Route path="decisions" element={<DecisionsPage />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="letters" element={<LettersPage />} />
            <Route path="letters/:letterId" element={<LetterPage />} />
          </Route>
          <Route path="central" element={<CentralHomePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="work" element={<WorkPage />} />
          <Route path="work/plans/:planId" element={<PlanPage />} />
          <Route path="money" element={<MoneyPage />} />
          <Route path="deleted-work" element={<DeletedWorkPage />} />
          <Route path=":block" element={<SystemBlockPage />} />
        </Route>
      </Route>
    </Route>
  );
}
