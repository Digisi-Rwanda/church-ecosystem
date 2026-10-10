import { lazy } from 'react';

/**
 * Each page is its own file that loads when it is first opened, so the first visit downloads
 * only the shell. `loaders` lets a menu warm a page before it is clicked.
 */
const loadAccessPage = () => import('./AccessPage').then((m) => ({ default: m.AccessPage }));
export const AccessPage = lazy(loadAccessPage);
const loadAddPersonPage = () => import('./AddPersonPage').then((m) => ({ default: m.AddPersonPage }));
export const AddPersonPage = lazy(loadAddPersonPage);
const loadAnnouncementsPage = () => import('./AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage }));
export const AnnouncementsPage = lazy(loadAnnouncementsPage);
const loadAppointmentsPage = () => import('./AppointmentsPage').then((m) => ({ default: m.AppointmentsPage }));
export const AppointmentsPage = lazy(loadAppointmentsPage);
const loadBaptismCohortPage = () => import('./BaptismCohortPage').then((m) => ({ default: m.BaptismCohortPage }));
export const BaptismCohortPage = lazy(loadBaptismCohortPage);
const loadCentralHomePage = () => import('./CentralHomePage').then((m) => ({ default: m.CentralHomePage }));
export const CentralHomePage = lazy(loadCentralHomePage);
const loadChoirPage = () => import('./ChoirPage').then((m) => ({ default: m.ChoirPage }));
export const ChoirPage = lazy(loadChoirPage);
const loadChoirsPage = () => import('./ChoirsPage').then((m) => ({ default: m.ChoirsPage }));
export const ChoirsPage = lazy(loadChoirsPage);
const loadCollectionsPage = () => import('./CollectionsPage').then((m) => ({ default: m.CollectionsPage }));
export const CollectionsPage = lazy(loadCollectionsPage);
const loadContactPage = () => import('./ContactPage').then((m) => ({ default: m.ContactPage }));
export const ContactPage = lazy(loadContactPage);
const loadContactsPage = () => import('./ContactsPage').then((m) => ({ default: m.ContactsPage }));
export const ContactsPage = lazy(loadContactsPage);
const loadContributionsPage = () => import('./ContributionsPage').then((m) => ({ default: m.ContributionsPage }));
export const ContributionsPage = lazy(loadContributionsPage);
const loadCouplesPage = () => import('./CouplesPage').then((m) => ({ default: m.CouplesPage }));
export const CouplesPage = lazy(loadCouplesPage);
const loadDecisionsPage = () => import('./DecisionsPage').then((m) => ({ default: m.DecisionsPage }));
export const DecisionsPage = lazy(loadDecisionsPage);
const loadDeletedWorkPage = () => import('./DeletedWorkPage').then((m) => ({ default: m.DeletedWorkPage }));
export const DeletedWorkPage = lazy(loadDeletedWorkPage);
const loadGroupPage = () => import('./GroupPage').then((m) => ({ default: m.GroupPage }));
export const GroupPage = lazy(loadGroupPage);
const loadGroupsPage = () => import('./GroupsPage').then((m) => ({ default: m.GroupsPage }));
export const GroupsPage = lazy(loadGroupsPage);
const loadLetterPage = () => import('./LetterPage').then((m) => ({ default: m.LetterPage }));
export const LetterPage = lazy(loadLetterPage);
const loadLettersPage = () => import('./LettersPage').then((m) => ({ default: m.LettersPage }));
export const LettersPage = lazy(loadLettersPage);
const loadMeetingPage = () => import('./MeetingPage').then((m) => ({ default: m.MeetingPage }));
export const MeetingPage = lazy(loadMeetingPage);
const loadMeetingsPage = () => import('./MeetingsPage').then((m) => ({ default: m.MeetingsPage }));
export const MeetingsPage = lazy(loadMeetingsPage);
const loadMoneyBudgetPage = () => import('./MoneyBudgetPage').then((m) => ({ default: m.MoneyBudgetPage }));
export const MoneyBudgetPage = lazy(loadMoneyBudgetPage);
const loadMoneyPage = () => import('./MoneyPage').then((m) => ({ default: m.MoneyPage }));
export const MoneyPage = lazy(loadMoneyPage);
const loadMoneyPlanPage = () => import('./MoneyPlanPage').then((m) => ({ default: m.MoneyPlanPage }));
export const MoneyPlanPage = lazy(loadMoneyPlanPage);
const loadMoneyReportsPage = () => import('./MoneyReportsPage').then((m) => ({ default: m.MoneyReportsPage }));
export const MoneyReportsPage = lazy(loadMoneyReportsPage);
const loadMonthPlanPage = () => import('./MonthPlanPage').then((m) => ({ default: m.MonthPlanPage }));
export const MonthPlanPage = lazy(loadMonthPlanPage);
const loadMovesPage = () => import('./MovesPage').then((m) => ({ default: m.MovesPage }));
export const MovesPage = lazy(loadMovesPage);
const loadMyContributionPage = () => import('./MyContributionPage').then((m) => ({ default: m.MyContributionPage }));
export const MyContributionPage = lazy(loadMyContributionPage);
const loadNotificationsPage = () => import('./NotificationsPage').then((m) => ({ default: m.NotificationsPage }));
export const NotificationsPage = lazy(loadNotificationsPage);
const loadOrgTreePage = () => import('./OrgTreePage').then((m) => ({ default: m.OrgTreePage }));
export const OrgTreePage = lazy(loadOrgTreePage);
const loadOversightPage = () => import('./OversightPage').then((m) => ({ default: m.OversightPage }));
export const OversightPage = lazy(loadOversightPage);
const loadPeopleDirectoryPage = () => import('./PeopleDirectoryPage').then((m) => ({ default: m.PeopleDirectoryPage }));
export const PeopleDirectoryPage = lazy(loadPeopleDirectoryPage);
const loadPerson360Page = () => import('./Person360Page').then((m) => ({ default: m.Person360Page }));
export const Person360Page = lazy(loadPerson360Page);
const loadPersonCardPage = () => import('./PersonCardPage').then((m) => ({ default: m.PersonCardPage }));
export const PersonCardPage = lazy(loadPersonCardPage);
const loadPlanPage = () => import('./PlanPage').then((m) => ({ default: m.PlanPage }));
export const PlanPage = lazy(loadPlanPage);
const loadPublicEventPage = () => import('./PublicEventPage').then((m) => ({ default: m.PublicEventPage }));
export const PublicEventPage = lazy(loadPublicEventPage);
const loadActionPlanCreate = () => import('./ActionPlanCreate').then((m) => ({ default: m.ActionPlanCreate }));
export const ActionPlanCreate = lazy(loadActionPlanCreate);
const loadPlansPage = () => import('./PlansPage').then((m) => ({ default: m.PlansPage }));
export const PlansPage = lazy(loadPlansPage);
const loadPortalBlockPage = () => import('./PortalBlockPage').then((m) => ({ default: m.PortalBlockPage }));
export const PortalBlockPage = lazy(loadPortalBlockPage);
const loadPortalPage = () => import('./PortalPage').then((m) => ({ default: m.PortalPage }));
export const PortalPage = lazy(loadPortalPage);
const loadPortalWorkPage = () => import('./PortalWorkPage').then((m) => ({ default: m.PortalWorkPage }));
export const PortalWorkPage = lazy(loadPortalWorkPage);
const loadPreferencesPage = () => import('./PreferencesPage').then((m) => ({ default: m.PreferencesPage }));
export const PreferencesPage = lazy(loadPreferencesPage);
const loadProtocolMinePage = () => import('./ProtocolMinePage').then((m) => ({ default: m.ProtocolMinePage }));
export const ProtocolMinePage = lazy(loadProtocolMinePage);
const loadProtocolReportsPage = () => import('./ProtocolReportsPage').then((m) => ({ default: m.ProtocolReportsPage }));
export const ProtocolReportsPage = lazy(loadProtocolReportsPage);
const loadProtocolRosterPage = () => import('./ProtocolRosterPage').then((m) => ({ default: m.ProtocolRosterPage }));
export const ProtocolRosterPage = lazy(loadProtocolRosterPage);
const loadProtocolTeamsPage = () => import('./ProtocolTeamsPage').then((m) => ({ default: m.ProtocolTeamsPage }));
export const ProtocolTeamsPage = lazy(loadProtocolTeamsPage);
const loadPulpitPage = () => import('./PulpitPage').then((m) => ({ default: m.PulpitPage }));
export const PulpitPage = lazy(loadPulpitPage);
const loadRehearsalsPage = () => import('./RehearsalsPage').then((m) => ({ default: m.RehearsalsPage }));
export const RehearsalsPage = lazy(loadRehearsalsPage);
const loadRepertoirePage = () => import('./RepertoirePage').then((m) => ({ default: m.RepertoirePage }));
export const RepertoirePage = lazy(loadRepertoirePage);
const loadReportPage = () => import('./ReportPage').then((m) => ({ default: m.ReportPage }));
export const ReportPage = lazy(loadReportPage);
const loadReportsPage = () => import('./ReportsPage').then((m) => ({ default: m.ReportsPage }));
export const ReportsPage = lazy(loadReportsPage);
const loadAdminPage = () => import('./AdminPage').then((m) => ({ default: m.AdminPage }));
export const AdminPage = lazy(loadAdminPage);
const loadImportPage = () => import('./imports/ImportPage').then((m) => ({ default: m.ImportPage }));
export const ImportPage = lazy(loadImportPage);
const loadPeopleImportPage = () => import('./PeopleImportPage').then((m) => ({ default: m.PeopleImportPage }));
export const PeopleImportPage = lazy(loadPeopleImportPage);
const loadPeopleDuplicatesPage = () => import('./PeopleDuplicatesPage').then((m) => ({ default: m.PeopleDuplicatesPage }));
export const PeopleDuplicatesPage = lazy(loadPeopleDuplicatesPage);
const loadMyAssignmentsPage = () => import('./MyAssignmentsPage').then((m) => ({ default: m.MyAssignmentsPage }));
export const MyAssignmentsPage = lazy(loadMyAssignmentsPage);
const loadSchedulePage = () => import('./SchedulePage').then((m) => ({ default: m.SchedulePage }));
export const SchedulePage = lazy(loadSchedulePage);
const loadSettingsPage = () => import('./SettingsPage').then((m) => ({ default: m.SettingsPage }));
export const SettingsPage = lazy(loadSettingsPage);
const loadSponsorshipPage = () => import('./SponsorshipPage').then((m) => ({ default: m.SponsorshipPage }));
export const SponsorshipPage = lazy(loadSponsorshipPage);
const loadSystemBlockPage = () => import('./SystemBlockPage').then((m) => ({ default: m.SystemBlockPage }));
export const SystemBlockPage = lazy(loadSystemBlockPage);
const loadSystemSettingsPage = () => import('./SystemSettingsPage').then((m) => ({ default: m.SystemSettingsPage }));
export const SystemSettingsPage = lazy(loadSystemSettingsPage);
const loadUnitPage = () => import('./UnitPage').then((m) => ({ default: m.UnitPage }));
export const UnitPage = lazy(loadUnitPage);
const loadVisitsPage = () => import('./VisitsPage').then((m) => ({ default: m.VisitsPage }));
export const VisitsPage = lazy(loadVisitsPage);
const loadWatchesPage = () => import('./WatchesPage').then((m) => ({ default: m.WatchesPage }));
export const WatchesPage = lazy(loadWatchesPage);
const loadWorkPage = () => import('./WorkPage').then((m) => ({ default: m.WorkPage }));
export const WorkPage = lazy(loadWorkPage);

/** Page loaders by name, for warming. */
export const pageLoaders: Record<string, () => Promise<unknown>> = {
  AccessPage: loadAccessPage,
  AddPersonPage: loadAddPersonPage,
  AnnouncementsPage: loadAnnouncementsPage,
  AppointmentsPage: loadAppointmentsPage,
  BaptismCohortPage: loadBaptismCohortPage,
  CentralHomePage: loadCentralHomePage,
  ChoirPage: loadChoirPage,
  ChoirsPage: loadChoirsPage,
  CollectionsPage: loadCollectionsPage,
  ContactPage: loadContactPage,
  ContactsPage: loadContactsPage,
  ContributionsPage: loadContributionsPage,
  CouplesPage: loadCouplesPage,
  DecisionsPage: loadDecisionsPage,
  DeletedWorkPage: loadDeletedWorkPage,
  GroupPage: loadGroupPage,
  GroupsPage: loadGroupsPage,
  LetterPage: loadLetterPage,
  LettersPage: loadLettersPage,
  MeetingPage: loadMeetingPage,
  MeetingsPage: loadMeetingsPage,
  MoneyBudgetPage: loadMoneyBudgetPage,
  MoneyPage: loadMoneyPage,
  MoneyPlanPage: loadMoneyPlanPage,
  MoneyReportsPage: loadMoneyReportsPage,
  MonthPlanPage: loadMonthPlanPage,
  MovesPage: loadMovesPage,
  MyContributionPage: loadMyContributionPage,
  NotificationsPage: loadNotificationsPage,
  OrgTreePage: loadOrgTreePage,
  OversightPage: loadOversightPage,
  PeopleDirectoryPage: loadPeopleDirectoryPage,
  Person360Page: loadPerson360Page,
  PersonCardPage: loadPersonCardPage,
  PlanPage: loadPlanPage,
  PublicEventPage: loadPublicEventPage,
  ActionPlanCreate: loadActionPlanCreate,
  PlansPage: loadPlansPage,
  PortalBlockPage: loadPortalBlockPage,
  PortalPage: loadPortalPage,
  PortalWorkPage: loadPortalWorkPage,
  PreferencesPage: loadPreferencesPage,
  ProtocolMinePage: loadProtocolMinePage,
  ProtocolReportsPage: loadProtocolReportsPage,
  ProtocolRosterPage: loadProtocolRosterPage,
  ProtocolTeamsPage: loadProtocolTeamsPage,
  PulpitPage: loadPulpitPage,
  RehearsalsPage: loadRehearsalsPage,
  RepertoirePage: loadRepertoirePage,
  ReportPage: loadReportPage,
  ReportsPage: loadReportsPage,
  AdminPage: loadAdminPage,
  ImportPage: loadImportPage,
  PeopleImportPage: loadPeopleImportPage,
  PeopleDuplicatesPage: loadPeopleDuplicatesPage,
  MyAssignmentsPage: loadMyAssignmentsPage,
  SchedulePage: loadSchedulePage,
  SettingsPage: loadSettingsPage,
  SponsorshipPage: loadSponsorshipPage,
  SystemBlockPage: loadSystemBlockPage,
  SystemSettingsPage: loadSystemSettingsPage,
  UnitPage: loadUnitPage,
  VisitsPage: loadVisitsPage,
  WatchesPage: loadWatchesPage,
  WorkPage: loadWorkPage,
};
