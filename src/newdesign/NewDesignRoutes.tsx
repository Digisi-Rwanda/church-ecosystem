import { RehearsalsPage } from './RehearsalsPage';
import { RepertoirePage } from './RepertoirePage';
import { SponsorshipPage } from './SponsorshipPage';
import { ProtocolMinePage } from './ProtocolMinePage';
import { ProtocolReportsPage } from './ProtocolReportsPage';
import { ProtocolRosterPage } from './ProtocolRosterPage';
import { ProtocolTeamsPage } from './ProtocolTeamsPage';
import { ChoirPage } from './ChoirPage';
import { ChoirsPage } from './ChoirsPage';
import { MonthPlanPage } from './MonthPlanPage';
import { OversightPage } from './OversightPage';
import { ContactPage } from './ContactPage';
import { ContactsPage } from './ContactsPage';
import { PulpitPage } from './PulpitPage';
import { CouplesPage } from './CouplesPage';
import { VisitsPage } from './VisitsPage';
import { WatchesPage } from './WatchesPage';
import { GroupPage } from './GroupPage';
import { GroupsPage } from './GroupsPage';
import { BaptismCohortPage } from './BaptismCohortPage';
import { Person360Page } from './Person360Page';
import { ReportPage } from './ReportPage';
import { ReportsPage } from './ReportsPage';
import { CollectionsPage } from './CollectionsPage';
import { MoneyPage } from './MoneyPage';
import { MyContributionPage } from './MyContributionPage';
import { ContributionsPage } from './ContributionsPage';
import { MoneyReportsPage } from './MoneyReportsPage';
import { MoneyPlanPage } from './MoneyPlanPage';
import { MoneyBudgetPage } from './MoneyBudgetPage';
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
import { PlansPage } from './PlansPage';
import { PortalWorkPage } from './PortalWorkPage';
import { PlanPage } from './PlanPage';
import { PortalBlockPage } from './PortalBlockPage';
import { PortalLayout } from './PortalLayout';
import { PortalPage } from './PortalPage';
import { SystemBlockPage } from './SystemBlockPage';
import { SystemFrame } from './SystemFrame';
import { SystemSettingsPage } from './SystemSettingsPage';
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
          <Route path="work" element={<PortalWorkPage />} />
          <Route path="notifications/preferences" element={<PreferencesPage />} />
          <Route path=":block" element={<PortalBlockPage />} />
        </Route>
        <Route path="/s/:systemId" element={<SystemFrame />}>
          <Route index element={<SystemBlockPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="people" element={<PeopleLayout />}>
            <Route index element={<PeopleDirectoryPage />} />
            <Route path="new" element={<AddPersonPage />} />
            <Route path="units" element={<OrgTreePage />} />
            <Route path="units/:unitId" element={<UnitPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="access" element={<AccessPage />} />
            <Route path="baptism" element={<BaptismCohortPage />} />
            <Route path=":personId/360" element={<Person360Page />} />
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
          <Route path="preferences" element={<SystemSettingsPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="work" element={<WorkPage />} />
          <Route path="programs" element={<PlansPage planType="PROGRAM" />} />
          <Route path="events" element={<PlansPage planType="EVENT" />} />
          <Route path="projects" element={<PlansPage planType="PROJECT" />} />
          <Route path="work/plans/:planId" element={<PlanPage />} />
          <Route path="money" element={<MoneyPage />} />
          <Route path="money/plan" element={<MoneyPlanPage />} />
          <Route path="money/budget" element={<MoneyBudgetPage />} />
          <Route path="money/contributions" element={<ContributionsPage />} />
          <Route path="money/reports" element={<MoneyReportsPage />} />
          <Route path="money/mine" element={<MyContributionPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:reportId" element={<ReportPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupPage />} />
          <Route path="couples" element={<CouplesPage />} />
          <Route path="visits" element={<VisitsPage />} />
          <Route path="watches" element={<WatchesPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="contacts/:contactId" element={<ContactPage />} />
          <Route path="pulpit" element={<PulpitPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="choirs" element={<ChoirsPage />} />
          <Route path="choirs/:choirId" element={<ChoirPage />} />
          <Route path="monthplan" element={<MonthPlanPage />} />
          <Route path="oversight" element={<OversightPage />} />
          <Route path="rehearsals" element={<RehearsalsPage />} />
          <Route path="repertoire" element={<RepertoirePage />} />
          <Route path="sponsorship" element={<SponsorshipPage />} />
          <Route path="roster" element={<ProtocolRosterPage />} />
          <Route path="teams" element={<ProtocolTeamsPage />} />
          <Route path="mine" element={<ProtocolMinePage />} />
          <Route path="deaconreports" element={<ProtocolReportsPage />} />
          <Route path="deleted-work" element={<DeletedWorkPage />} />
          <Route path=":block" element={<SystemBlockPage />} />
        </Route>
      </Route>
    </Route>
  );
}
