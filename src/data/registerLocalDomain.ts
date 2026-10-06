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
  PROTOCOL_ABSENCE_REQUESTS,
  PROTOCOL_ACTIVITY,
  PROTOCOL_ATTENDANCE,
  PROTOCOL_FILL_IN_OFFERS,
  PROTOCOL_HISTORY,
  PROTOCOL_MONTH_PLANS,
  PROTOCOL_NOTIFICATIONS,
  PROTOCOL_ROSTER,
  PROTOCOL_SERVICE_REPORTS,
  PROTOCOL_SERVICES,
  PROTOCOL_SWAP_PROPOSALS,
  PROTOCOL_TEAM_SLOTS,
} from './protocolSeed';
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


  // Fund vault (kept until mission money moves to Money module)

  // Protocol
  regReplace('protocolRoster', () => PROTOCOL_ROSTER);
  regReplace('protocolServices', () => PROTOCOL_SERVICES);
  regReplace('protocolMonthPlans', () => PROTOCOL_MONTH_PLANS);
  regReplace('protocolTeamSlots', () => PROTOCOL_TEAM_SLOTS);
  regReplace('protocolHistory', () => PROTOCOL_HISTORY);
  regReplace('protocolAttendance', () => PROTOCOL_ATTENDANCE);
  regReplace('protocolAbsenceRequests', () => PROTOCOL_ABSENCE_REQUESTS);
  regReplace('protocolFillInOffers', () => PROTOCOL_FILL_IN_OFFERS);
  regReplace('protocolSwapProposals', () => PROTOCOL_SWAP_PROPOSALS);
  regReplace('protocolServiceReports', () => PROTOCOL_SERVICE_REPORTS);
  regReplace('protocolNotifications', () => PROTOCOL_NOTIFICATIONS);
  regReplace('protocolActivity', () => PROTOCOL_ACTIVITY);

  // Youth
  regReplace('youthGroups', () => YOUTH_GROUPS);
  regReplace('youthMembers', () => YOUTH_MEMBERS);
  regReplace('youthMeetings', () => YOUTH_MEETINGS);

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
