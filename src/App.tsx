import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ScheduleSyncGate } from './components/ScheduleSyncGate';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { RequireAdminTools } from './components/RequireAdminTools';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider } from './theme/theme';
import { SystemScopeGuard } from './navigation/SystemScopeGuard';
import { LoginPage } from './pages/LoginPage';
import { useActiveChoir } from './pages/ministry/useActiveChoir';
import { PEER_CORE_SYSTEMS, peerCoreNav } from './ministry/peerCoreSystems';

// Each page loads on first visit, so the first screen downloads only what it needs.
const AccessEnginePage = lazy(() =>
  import('./pages/AccessEnginePage').then((m) => ({ default: m.AccessEnginePage })),
);
const ActivitySessionPage = lazy(() =>
  import('./pages/ActivitySessionPage').then((m) => ({ default: m.ActivitySessionPage })),
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const CheckInPage = lazy(() =>
  import('./pages/CheckInPage').then((m) => ({ default: m.CheckInPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const EventDetailPage = lazy(() =>
  import('./pages/EventDetailPage').then((m) => ({ default: m.EventDetailPage })),
);
const EventsPage = lazy(() =>
  import('./pages/EventsPage').then((m) => ({ default: m.EventsPage })),
);
const BoardPage = lazy(() =>
  import('./pages/BoardPage').then((m) => ({ default: m.BoardPage })),
);
const BoardFollowUpPage = lazy(() =>
  import('./pages/BoardFollowUpPage').then((m) => ({ default: m.BoardFollowUpPage })),
);
const BoardMeetingPage = lazy(() =>
  import('./pages/BoardMeetingPage').then((m) => ({ default: m.BoardMeetingPage })),
);
const PastoralDeskPage = lazy(() =>
  import('./pages/PastoralDeskPage').then((m) => ({ default: m.PastoralDeskPage })),
);
const CorrespondenceDetailPage = lazy(() =>
  import('./pages/CorrespondencePage').then((m) => ({ default: m.CorrespondenceDetailPage })),
);
const CorrespondencePage = lazy(() =>
  import('./pages/CorrespondencePage').then((m) => ({ default: m.CorrespondencePage })),
);
const SystemAdminPage = lazy(() =>
  import('./pages/SystemAdminPage').then((m) => ({ default: m.SystemAdminPage })),
);
const InboxPage = lazy(() =>
  import('./pages/InboxPage').then((m) => ({ default: m.InboxPage })),
);
const ReportsHubPage = lazy(() =>
  import('./pages/reports/ReportsHubPage').then((m) => ({ default: m.ReportsHubPage })),
);
const ChoirHomePage = lazy(() =>
  import('./pages/ministry/ChoirPages').then((m) => ({ default: m.ChoirHomePage })),
);
const ChoirRehearsalsPage = lazy(() =>
  import('./pages/ministry/ChoirPages').then((m) => ({ default: m.ChoirRehearsalsPage })),
);
const ChoirRepertoirePage = lazy(() =>
  import('./pages/ministry/ChoirPages').then((m) => ({ default: m.ChoirRepertoirePage })),
);
const ChoirRosterPage = lazy(() =>
  import('./pages/ministry/ChoirPages').then((m) => ({ default: m.ChoirRosterPage })),
);
const ChoirSectionsPage = lazy(() =>
  import('./pages/ministry/ChoirPages').then((m) => ({ default: m.ChoirSectionsPage })),
);
const ChoirFinancePage = lazy(() =>
  import('./pages/ministry/ChoirFinancePages').then((m) => ({ default: m.ChoirFinancePage })),
);
const ChoirMyContributionsPage = lazy(() =>
  import('./pages/ministry/ChoirFinancePages').then((m) => ({ default: m.ChoirMyContributionsPage })),
);
const ChoirPeoplePage = lazy(() =>
  import('./pages/ministry/ChoirFinancePages').then((m) => ({ default: m.ChoirPeoplePage })),
);
const ChoirTeamsPage = lazy(() =>
  import('./pages/ministry/ChoirFinancePages').then((m) => ({ default: m.ChoirTeamsPage })),
);
const ChoirAccountingPage = lazy(() =>
  import('./pages/ministry/ChoirOpsPages').then((m) => ({ default: m.ChoirAccountingPage })),
);
const ChoirAssetsPage = lazy(() =>
  import('./pages/ministry/ChoirOpsPages').then((m) => ({ default: m.ChoirAssetsPage })),
);
const ChoirDonationsPage = lazy(() =>
  import('./pages/ministry/ChoirOpsPages').then((m) => ({ default: m.ChoirDonationsPage })),
);
const ChoirFundraisingPage = lazy(() =>
  import('./pages/ministry/ChoirOpsPages').then((m) => ({ default: m.ChoirFundraisingPage })),
);
const ChoirReportsPage = lazy(() =>
  import('./pages/ministry/ChoirOpsPages').then((m) => ({ default: m.ChoirReportsPage })),
);
const ChoirSponsorsPage = lazy(() =>
  import('./pages/ministry/ChoirOpsPages').then((m) => ({ default: m.ChoirSponsorsPage })),
);
const WorshipHomePage = lazy(() =>
  import('./pages/ministry/WorshipPages').then((m) => ({ default: m.WorshipHomePage })),
);
const WorshipRehearsalsPage = lazy(() =>
  import('./pages/ministry/WorshipPages').then((m) => ({ default: m.WorshipRehearsalsPage })),
);
const WorshipRepertoirePage = lazy(() =>
  import('./pages/ministry/WorshipPages').then((m) => ({ default: m.WorshipRepertoirePage })),
);
const WorshipRosterPage = lazy(() =>
  import('./pages/ministry/WorshipPages').then((m) => ({ default: m.WorshipRosterPage })),
);
const WorshipSectionsPage = lazy(() =>
  import('./pages/ministry/WorshipPages').then((m) => ({ default: m.WorshipSectionsPage })),
);
const WorshipFinancePage = lazy(() =>
  import('./pages/ministry/WorshipFinancePages').then((m) => ({ default: m.WorshipFinancePage })),
);
const WorshipMyContributionsPage = lazy(() =>
  import('./pages/ministry/WorshipFinancePages').then((m) => ({ default: m.WorshipMyContributionsPage })),
);
const WorshipPeoplePage = lazy(() =>
  import('./pages/ministry/WorshipFinancePages').then((m) => ({ default: m.WorshipPeoplePage })),
);
const WorshipTeamsPage = lazy(() =>
  import('./pages/ministry/WorshipFinancePages').then((m) => ({ default: m.WorshipTeamsPage })),
);
const WorshipAccountingPage = lazy(() =>
  import('./pages/ministry/WorshipOpsPages').then((m) => ({ default: m.WorshipAccountingPage })),
);
const WorshipAssetsPage = lazy(() =>
  import('./pages/ministry/WorshipOpsPages').then((m) => ({ default: m.WorshipAssetsPage })),
);
const WorshipDonationsPage = lazy(() =>
  import('./pages/ministry/WorshipOpsPages').then((m) => ({ default: m.WorshipDonationsPage })),
);
const WorshipFundraisingPage = lazy(() =>
  import('./pages/ministry/WorshipOpsPages').then((m) => ({ default: m.WorshipFundraisingPage })),
);
const WorshipReportsPage = lazy(() =>
  import('./pages/ministry/WorshipOpsPages').then((m) => ({ default: m.WorshipReportsPage })),
);
const WorshipSponsorsPage = lazy(() =>
  import('./pages/ministry/WorshipOpsPages').then((m) => ({ default: m.WorshipSponsorsPage })),
);
const DeaconCasesPage = lazy(() =>
  import('./pages/ministry/DeaconPages').then((m) => ({ default: m.DeaconCasesPage })),
);
const DeaconFinancePage = lazy(() =>
  import('./pages/ministry/DeaconPages').then((m) => ({ default: m.DeaconFinancePage })),
);
const DeaconHomePage = lazy(() =>
  import('./pages/ministry/DeaconPages').then((m) => ({ default: m.DeaconHomePage })),
);
const DeaconMyContributionsPage = lazy(() =>
  import('./pages/ministry/DeaconPages').then((m) => ({ default: m.DeaconMyContributionsPage })),
);
const DeaconRosterPage = lazy(() =>
  import('./pages/ministry/DeaconPages').then((m) => ({ default: m.DeaconRosterPage })),
);
const DeaconVisitsPage = lazy(() =>
  import('./pages/ministry/DeaconPages').then((m) => ({ default: m.DeaconVisitsPage })),
);
const ChoirShell = lazy(() =>
  import('./pages/ministry/ChoirShell').then((m) => ({ default: m.ChoirShell })),
);
const MinistryMissionBoard = lazy(() =>
  import('./pages/ministry/MinistryMissionBoard').then((m) => ({ default: m.MinistryMissionBoard })),
);
const MinistryShell = lazy(() =>
  import('./pages/ministry/MinistryShell').then((m) => ({ default: m.MinistryShell })),
);
const RequireMinistryModule = lazy(() =>
  import('./pages/ministry/MinistryShell').then((m) => ({ default: m.RequireMinistryModule })),
);
const RequireChoirNav = lazy(() =>
  import('./pages/ministry/RequireChoirNav').then((m) => ({ default: m.RequireChoirNav })),
);
const FinanceFundLedgerPage = lazy(() =>
  import('./pages/ministry/FinancePages').then((m) => ({ default: m.FinanceFundLedgerPage })),
);
const FinanceHomePage = lazy(() =>
  import('./pages/ministry/FinancePages').then((m) => ({ default: m.FinanceHomePage })),
);
const FinanceSystemRedirect = lazy(() =>
  import('./pages/ministry/FinancePages').then((m) => ({ default: m.FinanceSystemRedirect })),
);
const MinistryFundLedgerPage = lazy(() =>
  import('./pages/ministry/FinancePages').then((m) => ({ default: m.MinistryFundLedgerPage })),
);
const ChurchBalanceSheetPage = lazy(() =>
  import('./pages/ministry/ChurchFinancePages').then((m) => ({ default: m.ChurchBalanceSheetPage })),
);
const ChurchBudgetsPage = lazy(() =>
  import('./pages/ministry/ChurchFinancePages').then((m) => ({ default: m.ChurchBudgetsPage })),
);
const ChurchCollectionsPage = lazy(() =>
  import('./pages/ministry/ChurchFinancePages').then((m) => ({ default: m.ChurchCollectionsPage })),
);
const ChurchReportsPage = lazy(() =>
  import('./pages/ministry/ChurchFinancePages').then((m) => ({ default: m.ChurchReportsPage })),
);
const ProtocolAttendancePage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolAttendancePage })),
);
const ProtocolCalendarPage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolCalendarPage })),
);
const ProtocolHistoryPage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolHistoryPage })),
);
const ProtocolHomePage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolHomePage })),
);
const ProtocolMembersPage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolMembersPage })),
);
const ProtocolMySchedulePage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolMySchedulePage })),
);
const ProtocolReviewPage = lazy(() =>
  import('./pages/ministry/ProtocolPages').then((m) => ({ default: m.ProtocolReviewPage })),
);
const ProtocolFaithfulPage = lazy(() =>
  import('./pages/ministry/ProtocolSchedulingPages').then((m) => ({ default: m.ProtocolFaithfulPage })),
);
const ProtocolTeamsPage = lazy(() =>
  import('./pages/ministry/ProtocolSchedulingPages').then((m) => ({ default: m.ProtocolTeamsPage })),
);
const ProtocolMusicFeedPage = lazy(() =>
  import('./pages/ministry/ProtocolMusicFeedPage').then((m) => ({ default: m.ProtocolMusicFeedPage })),
);
const ProtocolAvailabilityPage = lazy(() =>
  import('./pages/ministry/ProtocolAvailabilityPage').then((m) => ({ default: m.ProtocolAvailabilityPage })),
);
const ProtocolExportPage = lazy(() =>
  import('./pages/ministry/ProtocolOpsPages').then((m) => ({ default: m.ProtocolExportPage })),
);
const ProtocolFinancePage = lazy(() =>
  import('./pages/ministry/ProtocolOpsPages').then((m) => ({ default: m.ProtocolFinancePage })),
);
const ProtocolNotificationsPage = lazy(() =>
  import('./pages/ministry/ProtocolOpsPages').then((m) => ({ default: m.ProtocolNotificationsPage })),
);
const ProtocolReportsPage = lazy(() =>
  import('./pages/ministry/ProtocolOpsPages').then((m) => ({ default: m.ProtocolReportsPage })),
);
const YouthHomePage = lazy(() =>
  import('./pages/ministry/YouthPages').then((m) => ({ default: m.YouthHomePage })),
);
const YouthMissionPage = lazy(() =>
  import('./pages/ministry/YouthPages').then((m) => ({ default: m.YouthMissionPage })),
);
const MusicHomePage = lazy(() =>
  import('./pages/ministry/MusicSchedulePages').then((m) => ({ default: m.MusicHomePage })),
);
const MusicMissionPage = lazy(() =>
  import('./pages/ministry/MusicSchedulePages').then((m) => ({ default: m.MusicMissionPage })),
);
const MusicScheduleDraftsPage = lazy(() =>
  import('./pages/ministry/MusicSchedulePages').then((m) => ({ default: m.MusicScheduleDraftsPage })),
);
const MusicScheduleInboxPage = lazy(() =>
  import('./pages/ministry/MusicSchedulePages').then((m) => ({ default: m.MusicScheduleInboxPage })),
);
const MusicSchedulePublishedPage = lazy(() =>
  import('./pages/ministry/MusicSchedulePages').then((m) => ({ default: m.MusicSchedulePublishedPage })),
);
const MusicScheduleWorkspacePage = lazy(() =>
  import('./pages/ministry/MusicSchedulePages').then((m) => ({ default: m.MusicScheduleWorkspacePage })),
);
const PeerMinistryHomePage = lazy(() =>
  import('./pages/ministry/PeerMinistryPages').then((m) => ({ default: m.PeerMinistryHomePage })),
);
const PeerMinistryMissionPage = lazy(() =>
  import('./pages/ministry/PeerMinistryPages').then((m) => ({ default: m.PeerMinistryMissionPage })),
);
const PeerEventsPage = lazy(() =>
  import('./pages/ministry/PeerMissionPages').then((m) => ({ default: m.PeerEventsPage })),
);
const PeerProgramsPage = lazy(() =>
  import('./pages/ministry/PeerMissionPages').then((m) => ({ default: m.PeerProgramsPage })),
);
const PeerProjectsPage = lazy(() =>
  import('./pages/ministry/PeerMissionPages').then((m) => ({ default: m.PeerProjectsPage })),
);
const PeerTasksPage = lazy(() =>
  import('./pages/ministry/PeerMissionPages').then((m) => ({ default: m.PeerTasksPage })),
);
const MinistryAccountingPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryAccountingPage })),
);
const MinistryAssetsPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryAssetsPage })),
);
const MinistryDonationsPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryDonationsPage })),
);
const MinistryFinanceOverviewPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryFinanceOverviewPage })),
);
const MinistryFinanceReportsPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryFinanceReportsPage })),
);
const MinistryFundraisingPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryFundraisingPage })),
);
const MinistryMyContributionsPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistryMyContributionsPage })),
);
const MinistrySponsorsPage = lazy(() =>
  import('./pages/ministry/MinistryFinanceKitPages').then((m) => ({ default: m.MinistrySponsorsPage })),
);
const OrganizationDetailPage = lazy(() =>
  import('./pages/OrganizationDetailPage').then((m) => ({ default: m.OrganizationDetailPage })),
);
const OrganizationPage = lazy(() =>
  import('./pages/OrganizationPage').then((m) => ({ default: m.OrganizationPage })),
);
const ParticipationPage = lazy(() =>
  import('./pages/ParticipationPage').then((m) => ({ default: m.ParticipationPage })),
);
const PeoplePage = lazy(() =>
  import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage })),
);
const PeopleTablePage = lazy(() =>
  import('./pages/PeopleTablePage').then((m) => ({ default: m.PeopleTablePage })),
);
const PersonFormPage = lazy(() =>
  import('./pages/PersonFormPage').then((m) => ({ default: m.PersonFormPage })),
);
const PersonProfilePage = lazy(() =>
  import('./pages/PersonProfilePage').then((m) => ({ default: m.PersonProfilePage })),
);
const ProgramsPage = lazy(() =>
  import('./pages/ProgramsPage').then((m) => ({ default: m.ProgramsPage })),
);
const ProgramDetailPage = lazy(() =>
  import('./pages/ProgramDetailPage').then((m) => ({ default: m.ProgramDetailPage })),
);
const SsoHandoffPage = lazy(() =>
  import('./pages/SsoHandoffPage').then((m) => ({ default: m.SsoHandoffPage })),
);
const SystemsPage = lazy(() =>
  import('./pages/SystemsPage').then((m) => ({ default: m.SystemsPage })),
);
const ProjectDetailPage = lazy(() =>
  import('./pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const TaskDetailPage = lazy(() =>
  import('./pages/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })),
);
const TasksPage = lazy(() =>
  import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })),
);

function RequireAuth() {
  const { account } = useAuth();
  const location = useLocation();
  if (!account) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function ShellWithTitle() {
  const location = useLocation();
  let title = 'Home';
  let subtitle = 'This week at ADEPR Kacyiru — what needs you, and what’s coming.';

  if (location.pathname.startsWith('/inbox')) {
    title = 'Inbox';
    subtitle = 'Approvals, handoffs, and work that needs you.';
  } else if (location.pathname.startsWith('/board/meetings')) {
    title = 'Board meeting';
    subtitle =
      'Agenda detail, attendees, and Leader actions (Freeze for Board or Decide now).';
  } else if (location.pathname.startsWith('/board/follow-ups')) {
    title = 'Follow-up report';
    subtitle = 'Progress and results for a Board decision — review before Mark done.';
  } else if (location.pathname.startsWith('/board')) {
    title = 'Board';
    subtitle = 'Meetings, decisions, and follow-ups for church leadership.';
  } else if (location.pathname.startsWith('/pastoral')) {
    title = 'Pastoral desk';
    subtitle =
      'Pathways, baptism names, discipline, transfer letters, and pulpit.';
  } else if (location.pathname.startsWith('/correspondence/')) {
    title = 'Letter';
    subtitle = 'Draft, sign, deliver, and archive official correspondence.';
  } else if (location.pathname.startsWith('/correspondence')) {
    title = 'Correspondence';
    subtitle =
      'Transfer, membership confirmation, and recommendation letters.';
  } else if (location.pathname.startsWith('/system-admin')) {
    title = 'System admin';
    subtitle = 'Configure tools for systems you are appointed to — not church ledgers.';
  } else if (location.pathname.startsWith('/people/tables')) {
    title = 'People tables';
    subtitle = 'Personal, church and other details for everyone.';
  } else if (location.pathname.startsWith('/people/new')) {
    title = 'Add person';
    subtitle = 'Register someone in the church directory.';
  } else if (location.pathname.includes('/edit')) {
    title = 'Edit person';
    subtitle = 'Update directory details.';
  } else if (
    location.pathname.startsWith('/people/') &&
    location.pathname !== '/people'
  ) {
    title = 'Person';
    subtitle = 'Profile, family, and participation.';
  } else if (location.pathname.startsWith('/people')) {
    title = 'People';
    subtitle = 'Search and care for the church directory.';
  } else if (
    location.pathname.startsWith('/organization/') &&
    location.pathname !== '/organization'
  ) {
    title = 'Organisation unit';
    subtitle = 'Leaders, members, and structure.';
  } else if (location.pathname.startsWith('/organization')) {
    title = 'Organisation';
    subtitle = 'Ministries, teams, and choirs.';
  } else if (location.pathname.startsWith('/mission')) {
    title = 'Mission';
    subtitle = 'Programs, events, tasks, and shared work across the church.';
  } else if (location.pathname.startsWith('/participation')) {
    title = 'Participation';
    subtitle = 'Memberships, offices, and who serves where.';
  } else if (location.pathname.startsWith('/access')) {
    title = 'Access';
    subtitle = 'See what someone can do right now.';
  } else if (location.pathname.startsWith('/programs/') && location.pathname !== '/programs') {
    title = 'Program';
    subtitle = 'Roster, sessions, and progress.';
  } else if (location.pathname.startsWith('/programs')) {
    title = 'Programs';
    subtitle = 'Ongoing church programs and cohorts.';
  } else if (
    location.pathname.startsWith('/events/') &&
    location.pathname !== '/events'
  ) {
    title = 'Event';
    subtitle = 'Plan, register, and follow up.';
  } else if (location.pathname.startsWith('/events')) {
    title = 'Events';
    subtitle = 'Services, conferences, baptisms, and gatherings.';
  } else if (
    location.pathname.startsWith('/tasks/') &&
    location.pathname !== '/tasks'
  ) {
    title = 'Task';
    subtitle = 'Assignment, helpers, and due date.';
  } else if (location.pathname.startsWith('/tasks')) {
    title = 'Tasks';
    subtitle = 'Assignments for Main Church — with helpers when needed.';
  } else if (
    location.pathname.startsWith('/projects/') &&
    location.pathname !== '/projects'
  ) {
    title = 'Project';
    subtitle = 'Initiative details, people, and close-out.';
  } else if (location.pathname.startsWith('/projects')) {
    title = 'Projects';
    subtitle = 'Time-bound initiatives with clear owners.';
  } else if (location.pathname.startsWith('/calendar')) {
    title = 'Calendar';
    subtitle = 'What’s happening across the church.';
  } else if (location.pathname.startsWith('/finance')) {
    title = 'Treasury';
    subtitle = 'Collections, budgets, and church fund reports.';
  } else if (location.pathname.startsWith('/systems')) {
    title = 'Systems';
    subtitle = 'Open a ministry or peer system you may enter.';
  } else if (location.pathname.startsWith('/reports')) {
    title = 'Reports';
    subtitle = 'Leadership packs and oversight summaries.';
  }

  return <AppShell title={title} subtitle={subtitle} />;
}

const WORSHIP_NAV = [
  { to: '/systems/worship', label: 'Home', end: true },
  { to: '/systems/worship/mission', label: 'Mission' },
  { to: '/systems/worship/people', label: 'People' },
  { to: '/systems/worship/families', label: 'Families' },
  { to: '/systems/worship/repertoire', label: 'Setlists' },
  { to: '/systems/worship/sections', label: 'Sections' },
  { to: '/systems/worship/rehearsals', label: 'Rehearsals' },
  { to: '/systems/worship/roster', label: 'Duty roster' },
  { to: '/systems/worship/my-contributions', label: 'My contributions' },
  { to: '/systems/worship/finance', label: 'Finance' },
  { to: '/systems/worship/assets', label: 'Assets' },
  { to: '/systems/worship/reports', label: 'Reports' },
];

const YOUTH_NAV = [
  { to: '/systems/youth', label: 'Home', end: true },
  { to: '/systems/youth/mission', label: 'Mission' },
  { to: '/systems/youth/programs', label: 'Programs' },
  { to: '/systems/youth/events', label: 'Events' },
  { to: '/systems/youth/tasks', label: 'Tasks' },
  { to: '/systems/youth/projects', label: 'Projects' },
  { to: '/systems/youth/calendar', label: 'Calendar' },
  { to: '/systems/youth/my-contributions', label: 'My contributions' },
  { to: '/systems/youth/finance', label: 'Finance' },
  { to: '/systems/youth/assets', label: 'Assets' },
  { to: '/systems/youth/reports', label: 'Reports' },
];

const MUSIC_NAV = [
  { to: '/systems/music', label: 'Home', end: true },
  { to: '/systems/music/mission', label: 'Mission' },
  { to: '/systems/music/schedule', label: 'Schedule' },
  { to: '/systems/music/schedule-inbox', label: 'Inbox' },
  { to: '/systems/music/programs', label: 'Programs' },
  { to: '/systems/music/events', label: 'Events' },
  { to: '/systems/music/tasks', label: 'Tasks' },
  { to: '/systems/music/projects', label: 'Projects' },
  { to: '/systems/music/calendar', label: 'Calendar' },
  { to: '/systems/music/my-contributions', label: 'My contributions' },
  { to: '/systems/music/finance', label: 'Finance' },
  { to: '/systems/music/assets', label: 'Assets' },
  { to: '/systems/music/reports', label: 'Reports' },
];

const PROTOCOL_NAV = [
  { to: '/systems/protocol', label: 'Home', end: true },
  { to: '/systems/protocol/mission', label: 'Mission' },
  { to: '/systems/protocol/members', label: 'Members' },
  { to: '/systems/protocol/availability', label: 'Availability' },
  { to: '/systems/protocol/music', label: 'Music schedule' },
  { to: '/systems/protocol/calendar', label: 'Calendar' },
  { to: '/systems/protocol/teams', label: 'Service teams' },
  { to: '/systems/protocol/review', label: 'Review' },
  { to: '/systems/protocol/attendance', label: 'Attendance' },
  { to: '/systems/protocol/faithful', label: 'Member performance' },
  { to: '/systems/protocol/mine', label: 'My schedule' },
  { to: '/systems/protocol/finance', label: 'Finance' },
  { to: '/systems/protocol/inbox', label: 'Inbox' },
  { to: '/systems/protocol/reports', label: 'Reports' },
];

const DEACON_NAV = [
  { to: '/systems/deacon', label: 'Home', end: true },
  { to: '/systems/deacon/mission', label: 'Mission' },
  { to: '/systems/deacon/roster', label: 'Roster' },
  { to: '/systems/deacon/cases', label: 'Care cases' },
  { to: '/systems/deacon/visits', label: 'Visits' },
  { to: '/systems/deacon/my-contributions', label: 'My contributions' },
  { to: '/systems/deacon/finance', label: 'Finance' },
];

function ChoirMissionPage() {
  const { activeChoirOrgUnitId } = useActiveChoir();
  return (
    <MinistryMissionBoard
      systemId="sys-choir"
      title="Choir mission board"
      orgUnitId={activeChoirOrgUnitId ?? undefined}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
      <SystemScopeGuard>
      <ScheduleSyncGate>
      <ErrorBoundary>
      <Suspense fallback={<div className="route-loading" role="status">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sso/handoff" element={<SsoHandoffPage />} />

        <Route
          path="/systems/choir"
          element={<ChoirShell basePath="/systems/choir" />}
        >
          <Route index element={<ChoirHomePage />} />
          <Route
            path="mission"
            element={
              <RequireChoirNav navKey="mission">
                <ChoirMissionPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="people"
            element={
              <RequireChoirNav navKey="people">
                <ChoirPeoplePage />
              </RequireChoirNav>
            }
          />
          <Route
            path="families"
            element={
              <RequireChoirNav navKey="families">
                <ChoirTeamsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="repertoire"
            element={
              <RequireChoirNav navKey="repertoire">
                <ChoirRepertoirePage />
              </RequireChoirNav>
            }
          />
          <Route
            path="sections"
            element={
              <RequireChoirNav navKey="sections">
                <ChoirSectionsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="rehearsals"
            element={
              <RequireChoirNav navKey="rehearsals">
                <ChoirRehearsalsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="roster"
            element={
              <RequireChoirNav navKey="roster">
                <ChoirRosterPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="my-contributions"
            element={
              <RequireChoirNav navKey="my-contributions">
                <ChoirMyContributionsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="finance"
            element={
              <RequireChoirNav navKey="finance">
                <ChoirFinancePage />
              </RequireChoirNav>
            }
          />
          <Route
            path="donations"
            element={
              <RequireChoirNav navKey="donations">
                <ChoirDonationsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="sponsors"
            element={
              <RequireChoirNav navKey="sponsors">
                <ChoirSponsorsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="fundraising"
            element={
              <RequireChoirNav navKey="fundraising">
                <ChoirFundraisingPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="accounting"
            element={
              <RequireChoirNav navKey="accounting">
                <ChoirAccountingPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="assets"
            element={
              <RequireChoirNav navKey="assets">
                <ChoirAssetsPage />
              </RequireChoirNav>
            }
          />
          <Route
            path="reports"
            element={
              <RequireChoirNav navKey="reports">
                <ChoirReportsPage />
              </RequireChoirNav>
            }
          />
        </Route>

        <Route
          path="/systems/worship"
          element={
            <MinistryShell
              systemId="sys-worship"
              basePath="/systems/worship"
              nav={WORSHIP_NAV}
            />
          }
        >
          <Route
            element={
              <RequireMinistryModule
                systemId="sys-worship"
                basePath="/systems/worship"
              />
            }
          >
            <Route index element={<WorshipHomePage />} />
            <Route
              path="mission"
              element={
                <MinistryMissionBoard
                  systemId="sys-worship"
                  title="Worship mission board"
                />
              }
            />
            <Route path="people" element={<WorshipPeoplePage />} />
            <Route path="families" element={<WorshipTeamsPage />} />
            <Route path="repertoire" element={<WorshipRepertoirePage />} />
            <Route path="sections" element={<WorshipSectionsPage />} />
            <Route path="rehearsals" element={<WorshipRehearsalsPage />} />
            <Route path="roster" element={<WorshipRosterPage />} />
            <Route
              path="my-contributions"
              element={<WorshipMyContributionsPage />}
            />
            <Route path="finance" element={<WorshipFinancePage />} />
            <Route path="donations" element={<WorshipDonationsPage />} />
            <Route path="sponsors" element={<WorshipSponsorsPage />} />
            <Route path="fundraising" element={<WorshipFundraisingPage />} />
            <Route path="accounting" element={<WorshipAccountingPage />} />
            <Route path="assets" element={<WorshipAssetsPage />} />
            <Route path="reports" element={<WorshipReportsPage />} />
          </Route>
        </Route>

        <Route
          path="/systems/youth"
          element={
            <MinistryShell
              systemId="sys-youth"
              basePath="/systems/youth"
              nav={YOUTH_NAV}
            />
          }
        >
          <Route
            element={
              <RequireMinistryModule
                systemId="sys-youth"
                basePath="/systems/youth"
              />
            }
          >
            <Route index element={<YouthHomePage />} />
            <Route path="mission" element={<YouthMissionPage />} />
            <Route
              path="programs"
              element={
                <PeerProgramsPage
                  systemId="sys-youth"
                  basePath="/systems/youth"
                />
              }
            />
            <Route
              path="programs/:id"
              element={<ProgramDetailPage />}
            />
            <Route
              path="events"
              element={
                <PeerEventsPage systemId="sys-youth" basePath="/systems/youth" />
              }
            />
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route
              path="tasks"
              element={
                <PeerTasksPage systemId="sys-youth" basePath="/systems/youth" />
              }
            />
            <Route path="tasks/:id" element={<TaskDetailPage />} />
            <Route
              path="projects"
              element={
                <PeerProjectsPage
                  systemId="sys-youth"
                  basePath="/systems/youth"
                />
              }
            />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route
              path="calendar"
              element={
                <CalendarPage
                  systemId="sys-youth"
                  basePath="/systems/youth"
                  title="Youth calendar"
                />
              }
            />
            <Route
              path="my-contributions"
              element={<MinistryMyContributionsPage systemId="sys-youth" />}
            />
            <Route
              path="finance"
              element={<MinistryFinanceOverviewPage systemId="sys-youth" />}
            />
            <Route
              path="donations"
              element={<MinistryDonationsPage systemId="sys-youth" />}
            />
            <Route
              path="sponsors"
              element={<MinistrySponsorsPage systemId="sys-youth" />}
            />
            <Route
              path="fundraising"
              element={<MinistryFundraisingPage systemId="sys-youth" />}
            />
            <Route
              path="accounting"
              element={<MinistryAccountingPage systemId="sys-youth" />}
            />
            <Route
              path="assets"
              element={<MinistryAssetsPage systemId="sys-youth" />}
            />
            <Route
              path="reports"
              element={<MinistryFinanceReportsPage systemId="sys-youth" />}
            />
            <Route
              path="ledger"
              element={<MinistryFundLedgerPage systemId="sys-youth" />}
            />
          </Route>
        </Route>

        <Route
          path="/systems/music"
          element={
            <MinistryShell
              systemId="sys-music"
              basePath="/systems/music"
              nav={MUSIC_NAV}
            />
          }
        >
          <Route
            element={
              <RequireMinistryModule
                systemId="sys-music"
                basePath="/systems/music"
              />
            }
          >
            <Route index element={<MusicHomePage />} />
            <Route path="mission" element={<MusicMissionPage />} />
            <Route path="schedule" element={<MusicScheduleWorkspacePage />} />
            <Route
              path="schedule-drafts"
              element={<MusicScheduleDraftsPage />}
            />
            <Route
              path="schedule-published"
              element={<MusicSchedulePublishedPage />}
            />
            <Route
              path="schedule-inbox"
              element={<MusicScheduleInboxPage />}
            />
            <Route
              path="programs"
              element={
                <PeerProgramsPage
                  systemId="sys-music"
                  basePath="/systems/music"
                />
              }
            />
            <Route path="programs/:id" element={<ProgramDetailPage />} />
            <Route
              path="events"
              element={
                <PeerEventsPage
                  systemId="sys-music"
                  basePath="/systems/music"
                />
              }
            />
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route
              path="tasks"
              element={
                <PeerTasksPage
                  systemId="sys-music"
                  basePath="/systems/music"
                />
              }
            />
            <Route path="tasks/:id" element={<TaskDetailPage />} />
            <Route
              path="projects"
              element={
                <PeerProjectsPage
                  systemId="sys-music"
                  basePath="/systems/music"
                />
              }
            />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route
              path="calendar"
              element={
                <CalendarPage
                  systemId="sys-music"
                  basePath="/systems/music"
                  title="Music calendar"
                />
              }
            />
            <Route
              path="my-contributions"
              element={<MinistryMyContributionsPage systemId="sys-music" />}
            />
            <Route
              path="finance"
              element={<MinistryFinanceOverviewPage systemId="sys-music" />}
            />
            <Route
              path="donations"
              element={<MinistryDonationsPage systemId="sys-music" />}
            />
            <Route
              path="sponsors"
              element={<MinistrySponsorsPage systemId="sys-music" />}
            />
            <Route
              path="fundraising"
              element={<MinistryFundraisingPage systemId="sys-music" />}
            />
            <Route
              path="accounting"
              element={<MinistryAccountingPage systemId="sys-music" />}
            />
            <Route
              path="assets"
              element={<MinistryAssetsPage systemId="sys-music" />}
            />
            <Route
              path="reports"
              element={<MinistryFinanceReportsPage systemId="sys-music" />}
            />
            <Route
              path="ledger"
              element={<MinistryFundLedgerPage systemId="sys-music" />}
            />
          </Route>
        </Route>

        {PEER_CORE_SYSTEMS.map((peer) => (
          <Route
            key={peer.systemId}
            path={`/systems/${peer.slug}`}
            element={
              <MinistryShell
                systemId={peer.systemId}
                basePath={`/systems/${peer.slug}`}
                nav={peerCoreNav(peer.slug)}
              />
            }
          >
            <Route
              element={
                <RequireMinistryModule
                  systemId={peer.systemId}
                  basePath={`/systems/${peer.slug}`}
                />
              }
            >
              <Route
                index
                element={<PeerMinistryHomePage systemId={peer.systemId} />}
              />
              <Route
                path="mission"
                element={<PeerMinistryMissionPage systemId={peer.systemId} />}
              />
              <Route
                path="programs"
                element={
                  <PeerProgramsPage
                    systemId={peer.systemId}
                    basePath={`/systems/${peer.slug}`}
                  />
                }
              />
              <Route path="programs/:id" element={<ProgramDetailPage />} />
              <Route
                path="events"
                element={
                  <PeerEventsPage
                    systemId={peer.systemId}
                    basePath={`/systems/${peer.slug}`}
                  />
                }
              />
              <Route path="events/:id" element={<EventDetailPage />} />
              <Route
                path="tasks"
                element={
                  <PeerTasksPage
                    systemId={peer.systemId}
                    basePath={`/systems/${peer.slug}`}
                  />
                }
              />
              <Route path="tasks/:id" element={<TaskDetailPage />} />
              <Route
                path="projects"
                element={
                  <PeerProjectsPage
                    systemId={peer.systemId}
                    basePath={`/systems/${peer.slug}`}
                  />
                }
              />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route
                path="calendar"
                element={
                  <CalendarPage
                    systemId={peer.systemId}
                    basePath={`/systems/${peer.slug}`}
                    title={`${peer.title.replace(/ System$/, '')} calendar`}
                  />
                }
              />
              <Route
                path="my-contributions"
                element={
                  <MinistryMyContributionsPage systemId={peer.systemId} />
                }
              />
              <Route
                path="finance"
                element={
                  <MinistryFinanceOverviewPage systemId={peer.systemId} />
                }
              />
              <Route
                path="donations"
                element={<MinistryDonationsPage systemId={peer.systemId} />}
              />
              <Route
                path="sponsors"
                element={<MinistrySponsorsPage systemId={peer.systemId} />}
              />
              <Route
                path="fundraising"
                element={<MinistryFundraisingPage systemId={peer.systemId} />}
              />
              <Route
                path="accounting"
                element={<MinistryAccountingPage systemId={peer.systemId} />}
              />
              <Route
                path="assets"
                element={<MinistryAssetsPage systemId={peer.systemId} />}
              />
              <Route
                path="reports"
                element={
                  <MinistryFinanceReportsPage systemId={peer.systemId} />
                }
              />
              <Route
                path="ledger"
                element={
                  <MinistryFundLedgerPage systemId={peer.systemId} />
                }
              />
            </Route>
          </Route>
        ))}

        <Route
          path="/systems/protocol"
          element={
            <MinistryShell
              systemId="sys-protocol"
              basePath="/systems/protocol"
              nav={PROTOCOL_NAV}
            />
          }
        >
          <Route
            element={
              <RequireMinistryModule
                systemId="sys-protocol"
                basePath="/systems/protocol"
              />
            }
          >
            <Route index element={<ProtocolHomePage />} />
            <Route
              path="mission"
              element={
                <MinistryMissionBoard
                  systemId="sys-protocol"
                  title="Protocol mission board"
                />
              }
            />
            <Route path="members" element={<ProtocolMembersPage />} />
            <Route path="availability" element={<ProtocolAvailabilityPage />} />
            <Route path="music" element={<ProtocolMusicFeedPage />} />
            <Route path="calendar" element={<ProtocolCalendarPage />} />
            <Route path="teams" element={<ProtocolTeamsPage />} />
            <Route path="review" element={<ProtocolReviewPage />} />
            <Route path="attendance" element={<ProtocolAttendancePage />} />
            <Route path="faithful" element={<ProtocolFaithfulPage />} />
            <Route path="mine" element={<ProtocolMySchedulePage />} />
            <Route path="finance" element={<ProtocolFinancePage />} />
            <Route path="reports" element={<ProtocolReportsPage />} />
            <Route path="inbox" element={<ProtocolNotificationsPage />} />
            <Route path="export" element={<ProtocolExportPage />} />
            <Route path="history" element={<ProtocolHistoryPage />} />
          </Route>
        </Route>

        <Route
          path="/systems/deacon"
          element={
            <MinistryShell
              systemId="sys-deacon"
              basePath="/systems/deacon"
              nav={DEACON_NAV}
            />
          }
        >
          <Route
            element={
              <RequireMinistryModule
                systemId="sys-deacon"
                basePath="/systems/deacon"
              />
            }
          >
            <Route index element={<DeaconHomePage />} />
            <Route
              path="mission"
              element={
                <MinistryMissionBoard
                  systemId="sys-deacon"
                  title="Deacon mission board"
                />
              }
            />
            <Route path="roster" element={<DeaconRosterPage />} />
            <Route path="cases" element={<DeaconCasesPage />} />
            <Route path="visits" element={<DeaconVisitsPage />} />
            <Route
              path="my-contributions"
              element={<DeaconMyContributionsPage />}
            />
            <Route path="finance" element={<DeaconFinancePage />} />
          </Route>
        </Route>

        <Route
          path="/systems/finance/*"
          element={<FinanceSystemRedirect />}
        />

        <Route element={<RequireAuth />}>
          <Route element={<ShellWithTitle />}>
            <Route index element={<DashboardPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="board" element={<BoardPage />} />
            <Route
              path="board/meetings/:meetingId"
              element={<BoardMeetingPage />}
            />
            <Route
              path="board/follow-ups/:decisionId"
              element={<BoardFollowUpPage />}
            />
            <Route path="pastoral" element={<PastoralDeskPage />} />
            <Route path="correspondence" element={<CorrespondencePage />} />
            <Route
              path="correspondence/:id"
              element={<CorrespondenceDetailPage />}
            />
            <Route path="system-admin" element={<SystemAdminPage />} />
            <Route path="finance" element={<FinanceHomePage />} />
            <Route
              path="finance/collections"
              element={<ChurchCollectionsPage />}
            />
            <Route path="finance/budgets" element={<ChurchBudgetsPage />} />
            <Route
              path="finance/balance-sheet"
              element={<ChurchBalanceSheetPage />}
            />
            <Route path="finance/reports" element={<ChurchReportsPage />} />
            <Route
              path="finance/funds/:fundId"
              element={<FinanceFundLedgerPage />}
            />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/tables/:table" element={<PeopleTablePage />} />
            <Route path="people/new" element={<PersonFormPage />} />
            <Route path="people/:id" element={<PersonProfilePage />} />
            <Route path="people/:id/edit" element={<PersonFormPage />} />
            <Route path="organization" element={<OrganizationPage />} />
            <Route
              path="organization/:id"
              element={<OrganizationDetailPage />}
            />
            <Route
              path="mission"
              element={
                <MinistryMissionBoard
                  systemId="sys-main"
                  title="Main Church mission board"
                />
              }
            />
            <Route path="participation" element={<ParticipationPage />} />
            <Route
              path="access"
              element={
                <RequireAdminTools>
                  <AccessEnginePage />
                </RequireAdminTools>
              }
            />
            <Route path="programs" element={<ProgramsPage />} />
            <Route path="programs/:id" element={<ProgramDetailPage />} />
            <Route
              path="programs/:programId/sessions/:activityId"
              element={<ActivitySessionPage />}
            />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:id" element={<TaskDetailPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="check-in" element={<CheckInPage />} />
            <Route path="reports" element={<Navigate to="/reports/leadership" replace />} />
            <Route path="reports/:section" element={<ReportsHubPage />} />
            <Route
              path="systems"
              element={
                <RequireAdminTools>
                  <SystemsPage />
                </RequireAdminTools>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </ScheduleSyncGate>
      </SystemScopeGuard>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
