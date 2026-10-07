/**
 * Protocol (slice 3.16): the old team engine on the server.
 * The Coordinator builds and edits the month's teams, the President reviews and publishes, a team leader
 * runs the service (attendance, excuses, fill-ins, the report) and a member sees only their own published duties.
 */
import { lettersInSystem, liveHoldings, type AccessData } from '../capabilities/engine.js';
import type { ProtocolSchedulingRules } from './types.js';

export const PROTOCOL = 'sys-protocol';
export const DEACON = 'sys-deacon';
export const OFFICES = ['PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MEMBER'] as const;
export const SERVE_DAYS = ['SUNDAY', 'TUESDAY', 'BOTH'] as const;
export const ROSTER_STATUS = ['ACTIVE', 'INACTIVE', 'LEAVE'] as const;
export const KINDS = ['SS1', 'SS2', 'TUESDAY', 'IGABURO'] as const;
export const ATTENDANCE = ['PRESENT', 'HALF_PRESENT', 'EXCUSED', 'ABSENT'] as const;
export const REASON_MIN = 5;
export const REASON_MAX = 300;
export const TEXT_MAX = 2000;

/** The old defaults. Only the Tuesday relaxation changes, per month, and always with a reason. */
export const BASE_RULES: ProtocolSchedulingRules = {
  preferTarget: 3, softMax: 3, hardMax: 4, defaultTeamSize: 10, requireChoirOnService: true, requireWorshipOnService: true,
};
export const rulesFor = (relaxTuesday: boolean): ProtocolSchedulingRules => ({ ...BASE_RULES, relaxChoirOnKinds: relaxTuesday ? ['TUESDAY'] : [] });

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const monthOf = (day: string) => day.slice(0, 7);

const held = (me: string, mod: 'PEOPLE' | 'SCHEDULING', d: AccessData, now: Date) => lettersInSystem(me, PROTOCOL, d, now)[mod] as string[];
export const canReadRoster = (me: string, d: AccessData, now = new Date()) => held(me, 'PEOPLE', d, now).includes('R');
/** Only Protocol's offices see every team; a plain member sees their own duties through /mine. */
export const canReadPlan = (me: string, d: AccessData, now = new Date()) => held(me, 'PEOPLE', d, now).includes('R');
export const canWritePlan = (me: string, d: AccessData, now = new Date()) => held(me, 'SCHEDULING', d, now).includes('W');
export const hasOffice = (me: string, office: string, d: AccessData, now = new Date()) =>
  liveHoldings(me, d, now).some((h) => h.via === 'OFFICE' && h.systemId === PROTOCOL && h.office === office);
/** The roster is kept by the officers with People W (President, Vice President, Secretary) and by the Coordinator, who knows who can serve. */
export const canWriteRoster = (me: string, d: AccessData, now = new Date()) => held(me, 'PEOPLE', d, now).includes('W') || isCoordinator(me, d, now);
/** The Coordinator builds the teams; only they (or the President in their absence from the office) edit them. */
export const isCoordinator = (me: string, d: AccessData, now = new Date()) => hasOffice(me, 'COORDINATOR', d, now) && canWritePlan(me, d, now);
/** The reviewer is the President, or the Vice President only when no President is active; never the submitter. */
export const mayReview = (me: string, d: AccessData, presidentActive: boolean, now = new Date()) =>
  hasOffice(me, 'PRESIDENT', d, now) || (!presidentActive && hasOffice(me, 'VICE_PRESIDENT', d, now));
/** Protocol's people officers and Deacon's own officers read the service reports. */
export const canReadReports = (me: string, d: AccessData, now = new Date()) =>
  canReadRoster(me, d, now) || (lettersInSystem(me, DEACON, d, now).PEOPLE as string[]).includes('R');
