import type { ChipTone } from './kit/StatusChip';
import type { ActivityState, PlanDetail, PlanItem, PlanType, WorkPlanStatus } from '../api/frontDoorApi';

/** A status in the words of its kind of work: an event is "In progress", a project "Active", a program "Active" or "Suspended". */
export const planStatusKey = (s: WorkPlanStatus, type?: PlanType) => (type ? (`door.plan.status.${type}.${s}` as const) : (`door.plan.status.${s}` as const));

/** The engine's steps, in order. "On hold" sits beside Running. */
export const PLAN_STEPS: WorkPlanStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'RUNNING', 'CLOSING', 'ENDED'];
const RANK: Record<WorkPlanStatus, number> = { DRAFT: 0, PENDING_APPROVAL: 1, SETUP: 2, RUNNING: 3, PAUSED: 3, CLOSING: 4, ENDED: 5, CANCELLED: -1 };
export const stepIndex = (s: WorkPlanStatus): number => RANK[s];

/** Every activity is approved by the Church Leader before it runs, whatever its kind or size. */
export const needsApproval = (_type?: PlanType, _beyondUnit?: boolean) => true;

export type PlanAction = 'submit' | 'withdraw' | 'reopen' | 'start' | 'close' | 'pause' | 'resume' | 'renew';
/** The simple next-step buttons; approving, sending back, cancelling and the report have their own forms. */
export function planActions(p: Pick<PlanDetail, 'canSubmit' | 'canWithdraw' | 'canReopen' | 'canStart' | 'canClose' | 'canPause' | 'canResume' | 'canRenew'>): PlanAction[] {
  const out: PlanAction[] = [];
  if (p.canSubmit) out.push('submit');
  if (p.canWithdraw) out.push('withdraw');
  if (p.canReopen) out.push('reopen');
  if (p.canResume) out.push('resume');
  if (p.canClose) out.push('close');
  if (p.canRenew) out.push('renew');
  if (p.canPause) out.push('pause');
  return out;
}

const TYPED_ACTIONS: Record<string, PlanType[]> = {
  submit: ['EVENT', 'PROJECT', 'PROGRAM'], start: ['EVENT', 'PROJECT', 'PROGRAM'], close: ['EVENT', 'PROJECT', 'PROGRAM'],
  pause: ['PROJECT', 'PROGRAM'], resume: ['PROJECT', 'PROGRAM'], renew: ['PROGRAM'],
};
/** A button's words in the language of its kind of work ("Launch the program", "Put on hold"), else the plain ones. An event with nothing to approve says "Ready to prepare". */
export function actionKey(a: PlanAction, type: PlanType, _beyondUnit?: boolean): string {
  if (a === 'submit') return 'door.plan.action.submit';
  return TYPED_ACTIONS[a]?.includes(type) ? `door.plan.action.${a}.${type}` : `door.plan.action.${a}`;
}

/** Open plans first (in step order), then closed ones. */
export function sortPlans<T extends PlanItem>(list: T[]): T[] {
  const rank = (s: WorkPlanStatus) => (s === 'ENDED' ? 100 : s === 'CANCELLED' ? 101 : stepIndex(s) + (s === 'PAUSED' ? 0.5 : 0));
  return [...list].sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title));
}

const ERROR_KEYS: Record<string, string> = {
  TARGET_NEEDED: 'door.fr.err.target',
  FUNDRAISING_EVENT_ONLY: 'door.fr.err.eventOnly',
  NOT_FUNDRAISING: 'door.fr.err.notFundraising',
  NOT_APPROVED: 'door.fr.err.notApproved',
  INSUFFICIENT_PROGRAM_BUDGET: 'door.mr.err.budget',
  MORE_THAN_GAP: 'door.mr.err.gap',
  SUPPORT_PENDING: 'door.mr.err.pending',
  USE_CHANGE_REQUEST: 'door.mr.err.useChange',
  SETTLED: 'door.fr.err.settled',
  NOT_DONE: 'door.fr.err.notDone',
  AMOUNT: 'door.fr.err.amount',
  PLAN_LOCKED: 'door.plan.err.locked',
  WRONG_STATE: 'door.plan.err.wrongState',
  OWN_ENTRY: 'door.plan.err.ownEntry',
  REASON_REQUIRED: 'door.plan.err.reason',
  REPORT_INCOMPLETE: 'door.plan.err.reportIncomplete',
  CHECKLIST_OPEN: 'door.plan.err.checklistOpen',
  TOO_MANY: 'door.plan.err.tooMany',
  EVENT_FULL: 'door.plan.err.full',
  BAD_PARENT: 'door.plan.err.parent',
  ALREADY_REGISTERED: 'door.plan.err.already',
  BAD_FORM_URL: 'door.plan.err.formUrl',
  NOT_REGISTERED: 'door.plan.public.notRegistered',
  CHECKIN_CLOSED: 'door.plan.public.checkinClosed',
  REGISTRATION_CLOSED: 'door.plan.err.regClosed',
  ALREADY_ATTENDED: 'door.plan.err.attended',
  BAD_DATES: 'door.gov.err.badDates',
  BAD_TIME: 'door.when.err.time',
  BAD_REPEAT: 'door.when.err.repeat',
  DATE_REQUIRED: 'door.when.err.date',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
  UNIT_HAS_NO_SYSTEM: 'door.gov.err.noSystem',
  FUNDING_GAP: 'door.plan.err.fundingGap',
  INSUFFICIENT_FUNDS: 'door.plan.err.insufficient',
  USE_MONEY_CHECK: 'door.plan.err.useCheck',
  FLAG_REASON_REQUIRED: 'door.plan.err.flagReason',
  MONEY_LOCKED: 'door.plan.err.locked2',
  LINES_NOT_VERIFIED: 'door.plan.err.notChecked',
  NOTE_REQUIRED: 'door.plan.err.noteNeeded',
  USE_ITS_OWN_RECORD: 'door.funds.err.useOwn',
  CYCLE_REQUIRED: 'door.pm.err.cycle',
  ONGOING_NEEDS_PROGRAM: 'door.pm.err.ongoing',
  AMENDMENT_OPEN: 'door.pm.err.amendOpen',
  NO_CHANGE: 'door.pm.err.noChange',
  NO_PREVIOUS: 'door.plan.err.noPrevious',
  USE_AMENDMENT: 'door.plan.err.useAmendment',
  BAD_LINE: 'door.money.err.badLine',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
};
export const planErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** "2026-10" from a plan's start, or "none" when it has no date. Church time is UTC+2. */
export function monthKeyOf(iso: string | null): string {
  if (!iso) return 'none';
  const d = new Date(new Date(iso).getTime() + 2 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The address a guest opens to register for an event. */
export const publicEventUrl = (token: string): string => `${window.location.origin}/e/${token}`;

/** The address behind the attendance code at the door. */
export const publicCheckinUrl = (token: string): string => `${window.location.origin}/e/${token}/here`;

/** The four states people see (and Cancelled): the status chip's tone for each. */
export const stateTone = (s: ActivityState): 'neutral' | 'warn' | 'info' | 'success' | 'danger' =>
  s === 'WAITING' ? 'warn' : s === 'APPROVED' ? 'info' : s === 'DONE' ? 'success' : s === 'CANCELLED' ? 'danger' : 'neutral';

/**
 * The colour of an activity's status, one per step people see: Draft grey, Waiting amber, Set up blue,
 * Active green, On hold orange, Done violet, Cancelled red. The words always say the same thing.
 */
export const planTone = (state: ActivityState, status?: WorkPlanStatus): ChipTone =>
  state === 'APPROVED' ? (status === 'PAUSED' ? 'paused' : status === 'SETUP' ? 'info' : 'success') : state === 'DONE' ? 'done' : stateTone(state);

/** An approved activity runs from its approval; only an older plan can still be waiting to be started. */
