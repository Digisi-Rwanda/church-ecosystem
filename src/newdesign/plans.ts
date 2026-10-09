import type { PlanDetail, PlanItem, PlanType, WorkPlanStatus } from '../api/frontDoorApi';

/** A status in the words of its kind of work: an event is "In progress", a project "Active", a program "Active" or "Suspended". */
export const planStatusKey = (s: WorkPlanStatus, type?: PlanType) => (type ? (`door.plan.status.${type}.${s}` as const) : (`door.plan.status.${s}` as const));

/** The engine's steps, in order. "On hold" sits beside Running. */
export const PLAN_STEPS: WorkPlanStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'RUNNING', 'CLOSING', 'ENDED'];
const RANK: Record<WorkPlanStatus, number> = { DRAFT: 0, PENDING_APPROVAL: 1, SETUP: 2, RUNNING: 3, PAUSED: 3, CLOSING: 4, ENDED: 5, CANCELLED: -1 };
export const phaseOf = (s: WorkPlanStatus): 'planning' | 'execution' | 'cancelled' => (s === 'CANCELLED' ? 'cancelled' : RANK[s] <= 2 ? 'planning' : 'execution');
export const stepIndex = (s: WorkPlanStatus): number => RANK[s];

/**
 * The steps of each kind of work, as the church lives them. Each step belongs to one or more statuses of the shared
 * engine; the status the plan is in lights the steps that belong to it. An event has six steps, a project seven, a program eight.
 */
const STAGES: Record<PlanType, WorkPlanStatus[][]> = {
  EVENT: [['DRAFT'], ['DRAFT', 'PENDING_APPROVAL'], ['SETUP'], ['SETUP'], ['RUNNING', 'PAUSED'], ['CLOSING']],
  PROJECT: [['DRAFT'], ['DRAFT'], ['DRAFT'], ['PENDING_APPROVAL', 'SETUP'], ['RUNNING', 'PAUSED'], ['RUNNING', 'PAUSED'], ['CLOSING']],
  PROGRAM: [['DRAFT'], ['DRAFT'], ['DRAFT'], ['DRAFT', 'PENDING_APPROVAL'], ['SETUP'], ['RUNNING', 'PAUSED'], ['RUNNING', 'PAUSED'], ['CLOSING']],
};
export type StageView = { n: number; labelKey: string; descKey: string; state: 'done' | 'current' | 'todo' };
export function stagesOf(type: PlanType, status: WorkPlanStatus): StageView[] {
  const r = RANK[status];
  return STAGES[type].map((statuses, i) => {
    const n = i + 1;
    const ranks = statuses.map((x) => RANK[x]);
    const state = status === 'CANCELLED' ? 'todo' : status === 'ENDED' || r > Math.max(...ranks) ? 'done' : statuses.includes(status) ? 'current' : 'todo';
    return { n, labelKey: `door.plan.stage.${type}.${n}`, descKey: `door.plan.stage.${type}.${n}.d`, state };
  });
}

/** Whether a plan of this kind and reach is sent for approval: an event only when it reaches beyond its unit. */
export const needsApproval = (type: PlanType, beyondUnit: boolean) => type !== 'EVENT' || beyondUnit;

export type PlanAction = 'submit' | 'withdraw' | 'reopen' | 'start' | 'close' | 'pause' | 'resume' | 'renew';
/** The simple next-step buttons; approving, sending back, cancelling and the report have their own forms. */
export function planActions(p: Pick<PlanDetail, 'canSubmit' | 'canWithdraw' | 'canReopen' | 'canStart' | 'canClose' | 'canPause' | 'canResume' | 'canRenew'>): PlanAction[] {
  const out: PlanAction[] = [];
  if (p.canSubmit) out.push('submit');
  if (p.canWithdraw) out.push('withdraw');
  if (p.canStart) out.push('start');
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
export function actionKey(a: PlanAction, type: PlanType, beyondUnit: boolean): string {
  if (a === 'submit' && type === 'EVENT' && beyondUnit) return 'door.plan.action.submit';
  return TYPED_ACTIONS[a]?.includes(type) ? `door.plan.action.${a}.${type}` : `door.plan.action.${a}`;
}

/** Open plans first (in step order), then closed ones. */
export function sortPlans(list: PlanItem[]): PlanItem[] {
  const rank = (s: WorkPlanStatus) => (s === 'ENDED' ? 100 : s === 'CANCELLED' ? 101 : stepIndex(s) + (s === 'PAUSED' ? 0.5 : 0));
  return [...list].sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title));
}

const ERROR_KEYS: Record<string, string> = {
  PLAN_LOCKED: 'door.plan.err.locked',
  WRONG_STATE: 'door.plan.err.wrongState',
  OWN_ENTRY: 'door.plan.err.ownEntry',
  REASON_REQUIRED: 'door.plan.err.reason',
  REPORT_INCOMPLETE: 'door.plan.err.reportIncomplete',
  CHECKLIST_OPEN: 'door.plan.err.checklistOpen',
  TOO_MANY: 'door.plan.err.tooMany',
  BAD_DATES: 'door.gov.err.badDates',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
  UNIT_HAS_NO_SYSTEM: 'door.gov.err.noSystem',
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
