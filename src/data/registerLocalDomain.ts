/**
 * Registers every mutable in-memory collection for refresh-safe local persistence.
 * Import this once from main.tsx before render.
 */
import {
  hydrateLocalDomain,
  installLocalDomainAutoPersist,
  registerLocalArray,
  registerLocalBlob,
  scheduleLocalDomainPersist,
  flushLocalDomainPersist,
  persistLocalDomain,
  markLocalOverride,
} from './localDomainStore';

import {
  ACTIVITIES,
  ASSIGNMENTS,
  ATTENDANCE,
  EVENT_REGISTRATIONS,
  EVENTS,
  MEMBERSHIPS,
  MISSION_SHARES,
  ORG_UNITS,
  PEOPLE,
  POSITIONS,
  PROGRAM_ENROLLMENTS,
  PROGRAMS,
  PROJECTS,
  TASKS,
} from './seed';
import {
  PERSON_BAPTISMS,
  PERSON_DOCUMENTS,
  PERSON_EDUCATION,
  PERSON_EMPLOYMENT,
  PERSON_FAMILY_LINKS,
  PERSON_MARRIAGES,
  PERSON_SPIRITUAL_GIFTS,
  PERSON_TALENTS,
  PERSON_TIMELINE,
} from './personProfileSeed';
import {
  BOARD_MEETINGS,
} from './boardSeed';
import {
  BALANCE_SHEET_LINES,
  BUDGET_LINES,
  SERVICE_COLLECTIONS,
} from './churchFinanceSeed';
import {
  CHURCH_DOCUMENTS,
  DOCUMENT_REQUESTS,
  DOCUMENT_SIGNATURES,
  DOCUMENT_VERSIONS,
} from './correspondenceSeed';
import {
  DEACON_CASES,
  DEACON_CONTRIBUTIONS,
  DEACON_EXPENSES,
  DEACON_VISITS,
} from './deaconSeed';
import { FINANCE_TXNS } from './financeSeed';
import {
  MF_ASSETS,
  MF_BUDGET_LINES,
  MF_BUDGETS,
  MF_CAMPAIGN_GIFTS,
  MF_CAMPAIGNS,
  MF_CONTRIBUTIONS,
  MF_DONATIONS,
  MF_DRIVES,
  MF_EXPENSES,
  MF_FOLLOWUPS,
  MF_GOALS,
  MF_INCOME,
  MF_LIABILITIES,
  MF_METHODS,
  MF_SPONSORS,
  MF_SPONSORSHIPS,
  MF_TYPES,
} from './ministryFinanceSeed';
import {
  CHURCH_ASSISTANCE_REPORTS,
  SHARED_REPORT_PACKS,
} from './oversightReportsSeed';
import {
  CALENDAR_CONFLICTS,
  DISCIPLINE_CASES,
  PERSON_PATHWAYS,
  PULPIT_SLOTS,
  TRANSFER_LETTERS_OUT,
} from './pastoralOpsSeed';
import {
  PROTOCOL_ABSENCE_REQUESTS,
  PROTOCOL_ACTIVITY,
  PROTOCOL_ATTENDANCE,
  PROTOCOL_CONTRIBUTIONS,
  PROTOCOL_FILL_IN_OFFERS,
  PROTOCOL_HISTORY,
  PROTOCOL_MONTH_PLANS,
  PROTOCOL_NOTIFICATIONS,
  PROTOCOL_SERVICE_REPORTS,
  PROTOCOL_SERVICES,
  PROTOCOL_SWAP_PROPOSALS,
  PROTOCOL_TEAM_SLOTS,
} from './protocolSeed';
import {
  CHOIR_ASSETS,
  CHOIR_CAMPAIGN_GIFTS,
  CHOIR_CONTRIB_EVENTS,
  CHOIR_CONTRIB_NOTIFICATIONS,
  CHOIR_CONTRIBUTION_DRIVES,
  CHOIR_CONTRIBUTION_GOALS,
  CHOIR_CONTRIBUTIONS,
  CHOIR_DONATIONS,
  CHOIR_EXPENSES,
  CHOIR_FAMILY_RAILS,
  CHOIR_FOLLOW_UPS,
  CHOIR_HANDOFFS,
  CHOIR_INCOME,
  CHOIR_LIABILITIES,
  CHOIR_OFFICE_RAILS,
} from './choirSeed';
import {
  WORSHIP_ASSETS,
  WORSHIP_CAMPAIGN_GIFTS,
  WORSHIP_CONTRIBUTIONS,
  WORSHIP_DONATIONS,
  WORSHIP_EXPENSES,
  WORSHIP_FOLLOW_UPS,
  WORSHIP_INCOME,
  WORSHIP_LIABILITIES,
} from './worshipSeed';
import { YOUTH_GROUPS, YOUTH_MEETINGS, YOUTH_MEMBERS } from './youthSeed';
import { musicScheduleService } from '../services/musicScheduleService';

function regReplace<T>(name: string, get: () => T[]) {
  registerLocalArray({ name, mode: 'replace', get });
}

function regMerge<T>(name: string, get: () => T[], keyOf?: (item: T) => string) {
  registerLocalArray({ name, mode: 'merge', get, keyOf });
}

let registered = false;

export function registerAllLocalDomain() {
  if (registered) return;
  registered = true;

  // Core / mission
  regMerge('people', () => PEOPLE);
  regMerge('memberships', () => MEMBERSHIPS);
  regMerge('positions', () => POSITIONS);
  regMerge('orgUnits', () => ORG_UNITS);
  regReplace('assignments', () => ASSIGNMENTS);
  regReplace('programs', () => PROGRAMS);
  regReplace('programEnrollments', () => PROGRAM_ENROLLMENTS);
  regReplace('activities', () => ACTIVITIES);
  regReplace('attendance', () => ATTENDANCE);
  regReplace('events', () => EVENTS);
  regReplace('eventRegistrations', () => EVENT_REGISTRATIONS);
  regReplace('projects', () => PROJECTS);
  regReplace('tasks', () => TASKS);
  regReplace('missionShares', () => MISSION_SHARES);

  // Person 360
  regReplace('personFamilyLinks', () => PERSON_FAMILY_LINKS);
  regReplace('personBaptisms', () => PERSON_BAPTISMS);
  regReplace('personMarriages', () => PERSON_MARRIAGES);
  regReplace('personTimeline', () => PERSON_TIMELINE);
  regReplace('personDocuments', () => PERSON_DOCUMENTS);
  regReplace('personEmployment', () => PERSON_EMPLOYMENT);
  regReplace('personEducation', () => PERSON_EDUCATION);
  regReplace('personTalents', () => PERSON_TALENTS);
  regReplace('personSpiritualGifts', () => PERSON_SPIRITUAL_GIFTS);

  // Pastoral / board / correspondence / deacon
  regReplace('personPathways', () => PERSON_PATHWAYS);
  regReplace('disciplineCases', () => DISCIPLINE_CASES);
  regReplace('transferLettersOut', () => TRANSFER_LETTERS_OUT);
  regReplace('pulpitSlots', () => PULPIT_SLOTS);
  regReplace('calendarConflicts', () => CALENDAR_CONFLICTS);
  regReplace('boardMeetings', () => BOARD_MEETINGS);
  regReplace('documentRequests', () => DOCUMENT_REQUESTS);
  regReplace('churchDocuments', () => CHURCH_DOCUMENTS);
  regReplace('documentVersions', () => DOCUMENT_VERSIONS);
  regReplace('documentSignatures', () => DOCUMENT_SIGNATURES);
  regReplace('deaconCases', () => DEACON_CASES);
  regReplace('deaconVisits', () => DEACON_VISITS);
  regReplace('deaconContributions', () => DEACON_CONTRIBUTIONS);
  regReplace('deaconExpenses', () => DEACON_EXPENSES);

  // Church finance
  regReplace('serviceCollections', () => SERVICE_COLLECTIONS);
  regReplace('budgetLines', () => BUDGET_LINES);
  regReplace('balanceSheetLines', () => BALANCE_SHEET_LINES);
  regReplace('financeTxns', () => FINANCE_TXNS);
  regReplace('sharedReportPacks', () => SHARED_REPORT_PACKS);
  regReplace('churchAssistanceReports', () => CHURCH_ASSISTANCE_REPORTS);

  // Protocol
  regReplace('protocolServices', () => PROTOCOL_SERVICES);
  regReplace('protocolMonthPlans', () => PROTOCOL_MONTH_PLANS);
  regReplace('protocolTeamSlots', () => PROTOCOL_TEAM_SLOTS);
  regReplace('protocolHistory', () => PROTOCOL_HISTORY);
  regReplace('protocolAttendance', () => PROTOCOL_ATTENDANCE);
  regReplace('protocolAbsenceRequests', () => PROTOCOL_ABSENCE_REQUESTS);
  regReplace('protocolFillInOffers', () => PROTOCOL_FILL_IN_OFFERS);
  regReplace('protocolSwapProposals', () => PROTOCOL_SWAP_PROPOSALS);
  regReplace('protocolServiceReports', () => PROTOCOL_SERVICE_REPORTS);
  regReplace('protocolContributions', () => PROTOCOL_CONTRIBUTIONS);
  regReplace('protocolNotifications', () => PROTOCOL_NOTIFICATIONS);
  regReplace('protocolActivity', () => PROTOCOL_ACTIVITY);

  // Choir runtime money / ops
  regReplace('choirContributionDrives', () => CHOIR_CONTRIBUTION_DRIVES);
  regReplace('choirContributionGoals', () => CHOIR_CONTRIBUTION_GOALS);
  regReplace('choirContributions', () => CHOIR_CONTRIBUTIONS);
  regReplace('choirFollowUps', () => CHOIR_FOLLOW_UPS);
  regReplace('choirFamilyRails', () => CHOIR_FAMILY_RAILS);
  regReplace('choirOfficeRails', () => CHOIR_OFFICE_RAILS);
  regReplace('choirHandoffs', () => CHOIR_HANDOFFS);
  regReplace('choirContribEvents', () => CHOIR_CONTRIB_EVENTS);
  regReplace('choirContribNotifications', () => CHOIR_CONTRIB_NOTIFICATIONS);
  regReplace('choirDonations', () => CHOIR_DONATIONS);
  regReplace('choirCampaignGifts', () => CHOIR_CAMPAIGN_GIFTS);
  regReplace('choirIncome', () => CHOIR_INCOME);
  regReplace('choirExpenses', () => CHOIR_EXPENSES);
  regReplace('choirAssets', () => CHOIR_ASSETS);
  regReplace('choirLiabilities', () => CHOIR_LIABILITIES);

  // Worship runtime
  regReplace('worshipContributions', () => WORSHIP_CONTRIBUTIONS);
  regReplace('worshipFollowUps', () => WORSHIP_FOLLOW_UPS);
  regReplace('worshipDonations', () => WORSHIP_DONATIONS);
  regReplace('worshipCampaignGifts', () => WORSHIP_CAMPAIGN_GIFTS);
  regReplace('worshipIncome', () => WORSHIP_INCOME);
  regReplace('worshipExpenses', () => WORSHIP_EXPENSES);
  regReplace('worshipAssets', () => WORSHIP_ASSETS);
  regReplace('worshipLiabilities', () => WORSHIP_LIABILITIES);

  // Youth
  regReplace('youthGroups', () => YOUTH_GROUPS);
  regReplace('youthMembers', () => YOUTH_MEMBERS);
  regReplace('youthMeetings', () => YOUTH_MEETINGS);

  // Ministry finance kit
  regMerge(
    'mfTypes',
    () => MF_TYPES,
    (t) => `${t.systemId}::${t.id}`,
  );
  regMerge(
    'mfMethods',
    () => MF_METHODS,
    (m) => `${m.systemId}::${m.id}`,
  );
  regReplace('mfDrives', () => MF_DRIVES);
  regReplace('mfGoals', () => MF_GOALS);
  regReplace('mfContributions', () => MF_CONTRIBUTIONS);
  regReplace('mfFollowups', () => MF_FOLLOWUPS);
  regReplace('mfDonations', () => MF_DONATIONS);
  regReplace('mfSponsors', () => MF_SPONSORS);
  regReplace('mfSponsorships', () => MF_SPONSORSHIPS);
  regReplace('mfCampaigns', () => MF_CAMPAIGNS);
  regReplace('mfCampaignGifts', () => MF_CAMPAIGN_GIFTS);
  regReplace('mfBudgets', () => MF_BUDGETS);
  regReplace('mfBudgetLines', () => MF_BUDGET_LINES);
  regReplace('mfIncome', () => MF_INCOME);
  regReplace('mfExpenses', () => MF_EXPENSES);
  regReplace('mfAssets', () => MF_ASSETS);
  regReplace('mfLiabilities', () => MF_LIABILITIES);

  registerLocalBlob({
    name: 'musicSchedule',
    get: () => musicScheduleService.exportLocalState(),
    set: (v) => musicScheduleService.importLocalState(v),
  });
}

/** Boot: register → hydrate → auto-flush on refresh/hide. */
export function bootLocalDomainPersistence() {
  registerAllLocalDomain();
  hydrateLocalDomain();
  installLocalDomainAutoPersist();
}

export {
  scheduleLocalDomainPersist,
  flushLocalDomainPersist,
  persistLocalDomain,
  markLocalOverride,
};
