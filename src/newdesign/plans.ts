import type { PlanDetail, PlanItem, WorkPlanStatus } from '../api/frontDoorApi';

export const planStatusKey = (s: WorkPlanStatus) => `door.plan.status.${s}` as const;

/** The two phases the six steps belong to, so the screen can show where a plan stands. */
export const PLAN_STEPS: WorkPlanStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'RUNNING', 'CLOSING', 'ENDED'];
export const phaseOf = (s: WorkPlanStatus): 'planning' | 'execution' | 'cancelled' => (s === 'CANCELLED' ? 'cancelled' : PLAN_STEPS.indexOf(s) <= 2 ? 'planning' : 'execution');
export const stepIndex = (s: WorkPlanStatus): number => PLAN_STEPS.indexOf(s);

export type PlanAction = 'submit' | 'withdraw' | 'reopen' | 'start' | 'close';
/** The simple next-step buttons; approving, sending back, cancelling and the report have their own forms. */
export function planActions(p: Pick<PlanDetail, 'canSubmit' | 'canWithdraw' | 'canReopen' | 'canStart' | 'canClose'>): PlanAction[] {
  const out: PlanAction[] = [];
  if (p.canSubmit) out.push('submit');
  if (p.canWithdraw) out.push('withdraw');
  if (p.canStart) out.push('start');
  if (p.canReopen) out.push('reopen');
  if (p.canClose) out.push('close');
  return out;
}

/** Open plans first (in step order), then closed ones. */
export function sortPlans(list: PlanItem[]): PlanItem[] {
  const rank = (s: WorkPlanStatus) => (s === 'ENDED' ? 100 : s === 'CANCELLED' ? 101 : stepIndex(s));
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
