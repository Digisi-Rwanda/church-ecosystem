import { Route } from 'react-router-dom';
import {
  AccessPage,
  AddPersonPage,
  AnnouncementsPage,
  AppointmentsPage,
  BaptismCohortPage,
  CentralHomePage,
  ChoirPage,
  ChoirsPage,
  CollectionsPage,
  ContactPage,
  ContactsPage,
  ContributionsPage,
  CouplesPage,
  DecisionsPage,
  DeletedWorkPage,
  GroupPage,
  GroupsPage,
  LetterPage,
  LettersPage,
  MeetingPage,
  MeetingsPage,
  MoneyBudgetPage,
  MoneyPage,
  MoneyPlanPage,
  MoneyReportsPage,
  MonthPlanPage,
  MovesPage,
  MyContributionPage,
  NotificationsPage,
  OrgTreePage,
  OversightPage,
  PeopleDirectoryPage,
  Person360Page,
  PersonCardPage,
  PlanPage,
  PublicEventPage,
  PlansPage,
  PortalBlockPage,
  PortalPage,
  PortalWorkPage,
  PreferencesPage,
  ProtocolMinePage,
  ProtocolReportsPage,
  ProtocolRosterPage,
  ProtocolTeamsPage,
  PulpitPage,
  RehearsalsPage,
  RepertoirePage,
  ReportPage,
  ReportsPage,
  AdminPage,
  ImportPage,
  PeopleImportPage,
  PeopleDuplicatesPage,
  MyAssignmentsPage,
  SchedulePage,
  SettingsPage,
  SponsorshipPage,
  SystemBlockPage,
  SystemSettingsPage,
  UnitPage,
  VisitsPage,
  WatchesPage,
  WorkPage,
} from './pages';
import { GovernanceLayout } from './GovernanceLayout';
import { NewDesignLayout, RequireSignedIn } from './NewDesignGuards';
import { NewSignInPage } from './NewSignInPage';
import { PeopleLayout } from './PeopleLayout';
import { PortalLayout } from './PortalLayout';
import { SystemFrame } from './SystemFrame';


/**
 * The new routes, to be placed inside <Routes>. Only added when the new-design
 * switch is on (see lib/newDesign.ts); the old app's routes are untouched.
 */
export function newDesignRoutes() {
  return (
    <Route element={<NewDesignLayout />}>
      <Route path="/signin" element={<NewSignInPage />} />
      <Route path="/e/:token" element={<PublicEventPage />} />
      <Route element={<RequireSignedIn />}>
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="work" element={<PortalWorkPage part="tasks" />} />
          <Route path="work/plans" element={<PortalWorkPage part="plans" />} />
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
            <Route path="admin" element={<AdminPage />} />
            <Route path="import" element={<PeopleImportPage />} />
            <Route path="duplicates" element={<PeopleDuplicatesPage />} />
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
          <Route path="schedule/mine" element={<MyAssignmentsPage />} />
          <Route path="import/:target" element={<ImportPage />} />
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
          <Route path="moves" element={<MovesPage />} />
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
