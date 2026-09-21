import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { RequireAdminTools } from './components/RequireAdminTools';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider } from './theme/theme';
import { SystemScopeGuard } from './navigation/SystemScopeGuard';
import { AccessEnginePage } from './pages/AccessEnginePage';
import { ActivitySessionPage } from './pages/ActivitySessionPage';
import { CalendarPage } from './pages/CalendarPage';
import { CheckInPage } from './pages/CheckInPage';
import { DashboardPage } from './pages/DashboardPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsPage } from './pages/EventsPage';
import { BoardPage } from './pages/BoardPage';
import { BoardFollowUpPage } from './pages/BoardFollowUpPage';
import { BoardMeetingPage } from './pages/BoardMeetingPage';
import { PastoralDeskPage } from './pages/PastoralDeskPage';
import {
  CorrespondenceDetailPage,
  CorrespondencePage,
} from './pages/CorrespondencePage';
import { SystemAdminPage } from './pages/SystemAdminPage';
import { InboxPage } from './pages/InboxPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsHubPage } from './pages/reports/ReportsHubPage';
import {
  ChoirHomePage,
  ChoirRehearsalsPage,
  ChoirRepertoirePage,
  ChoirRosterPage,
  ChoirSectionsPage,
} from './pages/ministry/ChoirPages';
import {
  ChoirFinancePage,
  ChoirMyContributionsPage,
  ChoirPeoplePage,
  ChoirTeamsPage,
} from './pages/ministry/ChoirFinancePages';
import {
  ChoirAccountingPage,
  ChoirAssetsPage,
  ChoirDonationsPage,
  ChoirFundraisingPage,
  ChoirReportsPage,
  ChoirSponsorsPage,
} from './pages/ministry/ChoirOpsPages';
import {
  WorshipHomePage,
  WorshipRehearsalsPage,
  WorshipRepertoirePage,
  WorshipRosterPage,
  WorshipSectionsPage,
} from './pages/ministry/WorshipPages';
import {
  WorshipFinancePage,
  WorshipMyContributionsPage,
  WorshipPeoplePage,
  WorshipTeamsPage,
} from './pages/ministry/WorshipFinancePages';
import {
  WorshipAccountingPage,
  WorshipAssetsPage,
  WorshipDonationsPage,
  WorshipFundraisingPage,
  WorshipReportsPage,
  WorshipSponsorsPage,
} from './pages/ministry/WorshipOpsPages';
import {
  DeaconCasesPage,
  DeaconFinancePage,
  DeaconHomePage,
  DeaconMyContributionsPage,
  DeaconRosterPage,
  DeaconVisitsPage,
} from './pages/ministry/DeaconPages';
import { ChoirShell } from './pages/ministry/ChoirShell';
import { MinistryMissionBoard } from './pages/ministry/MinistryMissionBoard';
import { MinistryShell, RequireMinistryModule } from './pages/ministry/MinistryShell';
import { RequireChoirNav } from './pages/ministry/RequireChoirNav';
import { useActiveChoir } from './pages/ministry/useActiveChoir';
import {
  FinanceFundLedgerPage,
  FinanceHomePage,
  FinanceSystemRedirect,
  MinistryFundLedgerPage,
} from './pages/ministry/FinancePages';
import {
  ChurchBalanceSheetPage,
  ChurchBudgetsPage,
  ChurchCollectionsPage,
  ChurchReportsPage,
} from './pages/ministry/ChurchFinancePages';
import {
  ProtocolAttendancePage,
  ProtocolCalendarPage,
  ProtocolHistoryPage,
  ProtocolHomePage,
  ProtocolMembersPage,
  ProtocolMySchedulePage,
  ProtocolReviewPage,
} from './pages/ministry/ProtocolPages';
import {
  ProtocolFaithfulPage,
  ProtocolTeamsPage,
} from './pages/ministry/ProtocolSchedulingPages';
import {
  ProtocolExportPage,
  ProtocolFinancePage,
  ProtocolNotificationsPage,
  ProtocolReportsPage,
} from './pages/ministry/ProtocolOpsPages';
import {
  YouthHomePage,
  YouthMissionPage,
} from './pages/ministry/YouthPages';
import {
  MusicHomePage,
  MusicMissionPage,
  MusicScheduleDraftsPage,
  MusicScheduleInboxPage,
  MusicSchedulePublishedPage,
  MusicScheduleWorkspacePage,
} from './pages/ministry/MusicSchedulePages';
import {
  PeerMinistryHomePage,
  PeerMinistryMissionPage,
} from './pages/ministry/PeerMinistryPages';
import {
  PeerEventsPage,
  PeerProgramsPage,
  PeerProjectsPage,
  PeerTasksPage,
} from './pages/ministry/PeerMissionPages';
import {
  MinistryAccountingPage,
  MinistryAssetsPage,
  MinistryDonationsPage,
  MinistryFinanceOverviewPage,
  MinistryFinanceReportsPage,
  MinistryFundraisingPage,
  MinistryMyContributionsPage,
  MinistrySponsorsPage,
} from './pages/ministry/MinistryFinanceKitPages';
import { PEER_CORE_SYSTEMS, peerCoreNav } from './ministry/peerCoreSystems';
import { OrganizationDetailPage } from './pages/OrganizationDetailPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { ParticipationPage } from './pages/ParticipationPage';
import { PeoplePage } from './pages/PeoplePage';
import { PersonFormPage } from './pages/PersonFormPage';
import { PersonProfilePage } from './pages/PersonProfilePage';
import { ProgramsPage } from './pages/ProgramsPage';
import { ProgramDetailPage } from './pages/ProgramDetailPage';
import { SsoHandoffPage } from './pages/SsoHandoffPage';
import { SystemsPage } from './pages/SystemsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TasksPage } from './pages/TasksPage';

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
  { to: '/systems/protocol/calendar', label: 'Calendar' },
  { to: '/systems/protocol/teams', label: 'Service teams' },
  { to: '/systems/protocol/review', label: 'Review' },
  { to: '/systems/protocol/attendance', label: 'Attendance' },
  { to: '/systems/protocol/faithful', label: 'Faithful Servant' },
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
      </SystemScopeGuard>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
