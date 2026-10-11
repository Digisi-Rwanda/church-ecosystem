/**
 * Full work (slice 3.3): a plan that is approved, set up, run, closed and reported. Pure rules.
 *
 *   Planning:  DRAFT -> PENDING_APPROVAL -> SETUP      (the planning record; frozen once approved)
 *   Execution: RUNNING -> CLOSING -> ENDED             (progress notes, a delivery checklist, then the report)
 *
 * The three kinds of work share this engine but live differently. Every kind is approved by the Church Leader
 * (and first by the President when someone else wrote it); approval leads straight to RUNNING (SETUP only remains for
 * older plans). A project or program can be put on hold (PAUSED) and resumed. A program has no fixed end: closing it is a review, after which it is renewed or concluded.
 *
 * Approval is by level: the unit's own approver (the President) and then always the Church Leader. Nobody approves their
 * own entry, except that the Church Leader decides their own activity at the church's level. The report is composed in Closing (letter W) and published (letter P), which freezes it.
 */
import { liveHoldings, lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { visibilityOf, type Visibility, type WorkRow } from './rules.js';

export const PLAN_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'RUNNING', 'PAUSED', 'CLOSING', 'ENDED', 'CANCELLED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const CHURCH_SYSTEM = 'sys-main';
export const TEAM_MAX = 40;
export const ROLE_MAX = 80;
export const CHECKS_MAX = 40;

export interface Level {
  levelKey: 'UNIT' | 'TREASURER' | 'CHURCH';
  label: string;
  systemId: string;
  status: 'PENDING' | 'APPROVED';
  byId: string | null;
  at: string | null;
  note: string | null;
}

export interface PlanRow {
  id: string;
  orgUnitId: string;
  systemId: string;
  title: string;
  leaderPersonId: string;
  teamJson?: string | null;
  beyondUnit: boolean;
  planType?: string | null;
  visibility: string;
  status: string;
  approvalsJson?: string | null;
  createdById: string;
  deletedAt?: Date | string | null;
  reportJson?: string | null;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    const v = JSON.parse(raw ?? '');
    return (Array.isArray(fallback) ? (Array.isArray(v) ? v : fallback) : v) as T;
  } catch {
    return fallback;
  }
}
export const teamOf = (p: Pick<PlanRow, 'teamJson'>): Array<{ personId: string; role: string }> => parseJson(p.teamJson, []);
export const levelsOf = (p: Pick<PlanRow, 'approvalsJson'>): Level[] => parseJson(p.approvalsJson, []);

/**
 * The levels a submission needs. The Church Leader approves every activity, last. The President (the unit's own
 * approver) goes first, unless the President wrote it, nobody holds that office, or the work is in Central itself.
 */
export function buildLevels(systemId: string, skipUnit = false, withTreasurer = false): Level[] {
  const blank = { status: 'PENDING' as const, byId: null, at: null, note: null };
  const out: Level[] = [];
  if (systemId !== CHURCH_SYSTEM && !skipUnit) out.push({ levelKey: 'UNIT', label: 'President', systemId, ...blank });
  // The Treasurer checks the figures when there is spending, after the President and before the Church Leader.
  if (withTreasurer) out.push({ levelKey: 'TREASURER', label: 'Treasurer', systemId, ...blank });
  out.push({ levelKey: 'CHURCH', label: 'Church Leader', systemId: CHURCH_SYSTEM, ...blank });
  return out;
}
export const currentLevel = (p: Pick<PlanRow, 'approvalsJson'>): Level | null => levelsOf(p).find((l) => l.status === 'PENDING') ?? null;

const has = (me: string, systemId: string, module: 'MISSION' | 'REPORTS' | 'SCHEDULING' | 'MONEY', letter: string, data: AccessData, now: Date) =>
  (lettersInSystem(me, systemId, data, now)[module] as string[]).includes(letter);

/** People who hold the unit's own approving office (the President), by their own office; the Church Leader reaches every system but is not the unit's approver. */
export function unitApproverIds(systemId: string, data: AccessData, now = new Date()): string[] {
  const ids = [...new Set((data.positions as Array<{ personId: string }>).map((x) => x.personId))];
  return ids.filter((id) =>
    liveHoldings(id, data, now).some((h) => h.via === 'OFFICE' && h.scope === 'UNIT' && h.systemId === systemId && ((h.letters.MISSION ?? []) as string[]).includes('A')),
  );
}

/** The President's step is skipped when the creator can approve in the unit already, or when nobody else holds that office. */
export function skipUnitLevel(creatorId: string, systemId: string, data: AccessData, now = new Date()): boolean {
  if (systemId === CHURCH_SYSTEM) return true;
  if (has(creatorId, systemId, 'MISSION', 'A', data, now)) return true;
  return unitApproverIds(systemId, data, now).filter((id) => id !== creatorId).length === 0;
}

/** Whoever may decide for the church: the Church Leader, or someone the Church Leader has lent the approving letter for a while. */
export function canDecideForChurch(me: string, data: AccessData, now = new Date()): boolean {
  return liveHoldings(me, data, now).some(
    (h) => h.scope === 'CHURCH' && ((h.letters.MISSION ?? []) as string[]).includes('A') && h.office === 'CHURCH_LEADER',
  );
}
const isChurchLeader = (me: string, data: AccessData, now: Date) => liveHoldings(me, data, now).some((h) => h.via === 'OFFICE' && h.office === 'CHURCH_LEADER');

export const canWritePlan = (me: string, systemId: string, data: AccessData, now = new Date()) => has(me, systemId, 'MISSION', 'W', data, now);
export const canComposeReport = (me: string, systemId: string, data: AccessData, now = new Date()) => has(me, systemId, 'REPORTS', 'W', data, now);
export const canPublishReport = (me: string, systemId: string, data: AccessData, now = new Date()) => has(me, systemId, 'REPORTS', 'P', data, now);

/**
 * Whether this person may decide the level now waiting. Nobody decides their own plan, except that the Church Leader
 * decides their own activity at the church's level (there is no one above). While away, the Church Leader lends the
 * approving letter by delegation and the stand-in decides.
 */
export function canApprove(p: PlanRow, me: string, data: AccessData, now = new Date()): boolean {
  if (p.status !== 'PENDING_APPROVAL') return false;
  const level = currentLevel(p);
  if (!level) return false;
  if (level.levelKey === 'CHURCH') {
    if (!canDecideForChurch(me, data, now)) return false;
    return p.createdById !== me || isChurchLeader(me, data, now);
  }
  // The Treasurer's step is an answer about the figures (checked or flagged), given by whoever holds the Money write letter.
  if (level.levelKey === 'TREASURER') return p.createdById !== me && has(me, level.systemId, 'MONEY', 'W', data, now);
  return p.createdById !== me && has(me, level.systemId, 'MISSION', 'A', data, now);
}

/** Everyone who holds a letter in a system right now, for telling the right people. */
export function holdersWith(systemId: string, module: 'MISSION' | 'MONEY', letter: string, data: AccessData, now = new Date()): string[] {
  const ids = [...new Set((data.positions as Array<{ personId: string }>).map((x) => x.personId))];
  return ids.filter((id) => has(id, systemId, module, letter, data, now));
}

/** Whether somebody other than the author holds the Treasurer's office here, so the check can be answered at all. */
export function treasurerExists(creatorId: string, systemId: string, data: AccessData, now = new Date()): boolean {
  const ids = [...new Set((data.positions as Array<{ personId: string }>).map((x) => x.personId))];
  return ids.some((id) => id !== creatorId && has(id, systemId, 'MONEY', 'W', data, now));
}

/** The five states people see: Draft, Waiting, Approved, Done and Cancelled. */
export type ActivityState = 'DRAFT' | 'WAITING' | 'APPROVED' | 'DONE' | 'CANCELLED';
export function stateOf(status: string): ActivityState {
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'PENDING_APPROVAL') return 'WAITING';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'CLOSING' || status === 'ENDED') return 'DONE';
  return 'APPROVED';
}

/** Everyone who could decide the waiting level, for the notice that asks them. */
export function approversOf(p: PlanRow, data: AccessData, now = new Date()): string[] {
  const ids = [...new Set((data.positions as Array<{ personId: string }>).map((x) => x.personId))];
  return ids.filter((id) => canApprove(p, id, data, now));
}

/** The creator, the leader, or anyone with W in the system, runs the plan. */
export const canManagePlan = (p: PlanRow, me: string, data: AccessData, now = new Date()): boolean =>
  !p.deletedAt && (p.createdById === me || p.leaderPersonId === me || canWritePlan(me, p.systemId, data, now));

export const isOnTeam = (p: PlanRow, me: string): boolean => p.leaderPersonId === me || p.createdById === me || teamOf(p).some((t) => t.personId === me);

/** Plans are seen by the same four visibility levels as light work; the team counts as the named people. */
export function asWorkRow(p: PlanRow): WorkRow {
  return {
    id: p.id,
    ownerPersonId: p.leaderPersonId,
    helperPersonIds: JSON.stringify(teamOf(p).map((t) => t.personId)),
    createdByPersonId: p.createdById,
    systemId: p.systemId,
    orgUnitId: p.orgUnitId,
    visibility: p.visibility,
    status: p.status,
    deletedAt: p.deletedAt,
  };
}
export const planVisibility = (p: Pick<PlanRow, 'visibility'>): Visibility => visibilityOf(p.visibility);

export type Action = 'submit' | 'withdraw' | 'reopen' | 'start' | 'close' | 'pause' | 'resume' | 'renew' | 'cancel' | 'edit' | 'delete' | 'compose' | 'publish';
const FROM: Record<Action, PlanStatus[]> = {
  submit: ['DRAFT'],
  withdraw: ['PENDING_APPROVAL'],
  reopen: ['SETUP'],
  start: ['SETUP'],
  close: ['RUNNING'],
  pause: ['RUNNING'],
  resume: ['PAUSED'],
  renew: ['CLOSING'],
  cancel: ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'RUNNING', 'PAUSED', 'CLOSING'],
  edit: ['DRAFT'],
  delete: ['DRAFT'],
  compose: ['CLOSING'],
  publish: ['CLOSING'],
};
export const stateProblem = (action: Action, status: string): 'WRONG_STATE' | null => ((FROM[action] as string[]).includes(status) ? null : 'WRONG_STATE');

/** What must be true before the report can be published. */
export function publishProblem(p: { planningSummary?: string | null; executionSummary?: string | null; outcome?: string | null }, checks: Array<{ done: boolean }>): 'REPORT_INCOMPLETE' | 'CHECKLIST_OPEN' | null {
  if (![p.planningSummary, p.executionSummary, p.outcome].every((x) => (x ?? '').trim())) return 'REPORT_INCOMPLETE';
  if (checks.some((c) => !c.done)) return 'CHECKLIST_OPEN';
  return null;
}

/** Which kinds of work may take a step that is not for all: holding is for projects and programs, renewing for programs. */
const ONLY: Partial<Record<Action, string[]>> = { pause: ['PROJECT', 'PROGRAM'], resume: ['PROJECT', 'PROGRAM'], renew: ['PROGRAM'] };
export const typeProblem = (action: Action, planType: string | null | undefined): 'WRONG_STATE' | null => {
  const only = ONLY[action];
  return only && !only.includes(planType ?? 'PROJECT') ? 'WRONG_STATE' : null;
};

/** Which kind of work may sit under which: a project under a program, an event under a program or a project. Links are always optional. */
const PARENTS: Record<string, string[]> = { PROJECT: ['PROGRAM'], EVENT: ['PROGRAM', 'PROJECT'] };
export const parentProblem = (childType: string | null | undefined, parentType: string | null | undefined): 'BAD_PARENT' | null =>
  (PARENTS[childType ?? 'PROJECT'] ?? []).includes(parentType ?? 'PROJECT') ? null : 'BAD_PARENT';

/** Every plan below this one, however deep, never looping. */
export function descendantsOf(id: string, rows: Array<{ id: string; parentId?: string | null }>): string[] {
  const out: string[] = [];
  const seen = new Set([id]);
  let front = [id];
  while (front.length) {
    const next = rows.filter((r) => r.parentId && front.includes(r.parentId) && !seen.has(r.id));
    next.forEach((r) => seen.add(r.id));
    out.push(...next.map((r) => r.id));
    front = next.map((r) => r.id);
  }
  return out;
}

/** An indicator's progress against its target, as a whole percentage (not capped, so exceeding shows). */
export const indicatorPercent = (current: number | null, target: number): number | null => (current === null || !target ? null : Math.round((current / target) * 100));
