import type { ProtocolIssueView, ProtocolKind, ProtocolRole, ProtocolStep } from '../api/frontDoorApi';

export const KINDS: ProtocolKind[] = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'];
export const OFFICES = ['PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MEMBER'] as const;
export const SERVE_DAYS = ['SUNDAY', 'TUESDAY', 'BOTH'] as const;
export const ROSTER_STATUS = ['ACTIVE', 'INACTIVE', 'LEAVE'] as const;
export const ATTENDANCE = ['PRESENT', 'HALF_PRESENT', 'EXCUSED', 'ABSENT'] as const;
export const ROLES: ProtocolRole[] = ['MEMBER', 'TEAM_LEADER', 'VICE_LEADER'];
export const STEPS: ProtocolStep[] = ['WAIT_MUSIC', 'BUILD', 'SEND', 'WAIT_PRESIDENT', 'DONE'];

/** Server codes to the sentence the app shows; anything unknown falls back to the general failure. */
const ERROR_KEYS: Record<string, string> = {
  NO_MUSIC: 'door.protocol.err.noMusic', NO_ROSTER: 'door.protocol.err.noRoster', LOCKED: 'door.protocol.err.locked',
  UNKNOWN_PERSON: 'door.protocol.err.unknownPerson', NOT_ACTIVE: 'door.protocol.err.notActive', ALREADY: 'door.protocol.err.already',
  CANNOT_SERVE: 'door.protocol.err.cannotServe', DOUBLE_SUNDAY: 'door.protocol.err.doubleSunday', OVER_MAX: 'door.protocol.err.overMax',
  CHOIR_NOT_SCHEDULED: 'door.protocol.err.choir', WORSHIP_NOT_SCHEDULED: 'door.protocol.err.worship', NOT_OVERRIDABLE: 'door.protocol.err.notOverridable',
  REASON: 'door.protocol.err.reason', BLOCKING: 'door.protocol.err.blocking', NOT_DRAFT: 'door.protocol.err.notDraft', NOT_IN_REVIEW: 'door.protocol.err.notInReview',
  SAME_PERSON: 'door.protocol.err.samePerson', MUSIC_NOT_PUBLISHED: 'door.protocol.err.musicNotPublished', MUSIC_CHANGED: 'door.protocol.err.musicChanged',
  PAST: 'door.protocol.err.past', FUTURE: 'door.protocol.err.future', NOT_ON_TEAM: 'door.protocol.err.notOnTeam', DUPLICATE: 'door.protocol.err.duplicate',
  DECIDED: 'door.protocol.err.decided', NOT_EXCUSED: 'door.protocol.err.notExcused', SELF: 'door.protocol.err.self', NO_PERSON: 'door.gov.err.personNotActive',
  NO_SERVICE: 'door.work.err.gone', FORBIDDEN: 'door.gov.err.notAllowed', NOT_FOUND: 'door.work.err.gone', BAD_INPUT: 'door.caring.err.input', BAD_MONTH: 'door.caring.err.date',
};
export const protocolErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** The line that tells the Coordinator what is next, from the month's step. */
export const stepIndex = (step: ProtocolStep): number => STEPS.indexOf(step);

/** Open problems first: blocking before warnings, allowed ones last. */
export function sortIssues(issues: ProtocolIssueView[]): ProtocolIssueView[] {
  const rank = (i: ProtocolIssueView) => (i.overridden ? 2 : i.severity === 'BLOCKING' ? 0 : 1);
  return [...issues].sort((a, b) => rank(a) - rank(b) || a.message.localeCompare(b.message));
}
export const issuesOfService = (issues: ProtocolIssueView[], serviceId: string) => issues.filter((i) => i.serviceId === serviceId);
export const openBlocking = (issues: ProtocolIssueView[]) => issues.filter((i) => i.severity === 'BLOCKING' && !i.overridden).length;

/** ISO days kept sorted and without repeats. */
export const withDay = (days: string[], day: string): string[] => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? [...new Set([...days, day])].sort() : days);
export const withoutDay = (days: string[], day: string): string[] => days.filter((d) => d !== day);
export const toggleKind = <T extends string>(kinds: T[], kind: T): T[] => (kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind]);

/** Attendance is recorded from the service's own day. */
export const canMark = (date: string, today: string): boolean => date <= today;
/** An excuse or swap can only be asked before the service. */
export const canAsk = (date: string, today: string): boolean => date >= today;
export const monthOfDay = (day: string): string => day.slice(0, 7);
/** Who in the roster could be put on a service: not already on it. */
export const candidatesFor = (roster: Array<{ personId: string; name: string; load: number }>, team: Array<{ personId: string }>) =>
  roster.filter((r) => !team.some((t) => t.personId === r.personId));
