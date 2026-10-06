/**
 * Event operating state — single UI signal from status + lifecyclePhase.
 */
import type {
  ChurchEvent,
  EventLifecyclePhase,
  EventRegistration,
} from './types';

export type EventOpState =
  | 'DRAFT'
  | 'PENDING'
  | 'READY'
  | 'LIVE'
  | 'CLOSING'
  | 'DONE'
  | 'CANCELLED';

export type EventVerb = {
  id: 'submit' | 'approve' | 'start' | 'close' | 'complete';
  label: string;
};

export function eventOpStateLabel(state: EventOpState): string {
  switch (state) {
    case 'DRAFT':
      return 'Draft';
    case 'PENDING':
      return 'Awaiting approval';
    case 'READY':
      return 'Ready';
    case 'LIVE':
      return 'Live';
    case 'CLOSING':
      return 'Closing';
    case 'DONE':
      return 'Done';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

/** Hours a waitlisted person has to keep a promoted seat. */
export const WAITLIST_OFFER_HOURS = 48;

export function eventOperatingState(event: ChurchEvent): EventOpState {
  if (event.status === 'CANCELLED') return 'CANCELLED';
  if (event.status === 'COMPLETED') return 'DONE';
  if (event.status === 'DRAFT') return 'DRAFT';
  if (event.status === 'PENDING_APPROVAL') return 'PENDING';
  const phase: EventLifecyclePhase = event.lifecyclePhase ?? 'PREPARE';
  if (phase === 'CLOSE') return 'CLOSING';
  if (phase === 'DELIVER' && event.status === 'CONFIRMED') return 'LIVE';
  if (event.status === 'CONFIRMED' || event.status === 'PLANNED') return 'READY';
  return 'READY';
}

export function eventPrimaryVerbs(
  state: EventOpState,
  opts: { canManage: boolean; canApprove?: boolean },
): EventVerb[] {
  if (!opts.canManage && !opts.canApprove) return [];
  const verbs: EventVerb[] = [];
  if (state === 'DRAFT' && opts.canManage) {
    verbs.push({ id: 'submit', label: 'Submit for approval' });
  }
  if (state === 'PENDING' && opts.canApprove) {
    verbs.push({ id: 'approve', label: 'Approve' });
  }
  if (state === 'READY' && opts.canManage) {
    verbs.push({ id: 'start', label: 'Start (deliver)' });
  }
  if (state === 'LIVE' && opts.canManage) {
    verbs.push({ id: 'close', label: 'Enter close-out' });
    verbs.push({ id: 'complete', label: 'Complete event' });
  }
  if (state === 'CLOSING' && opts.canManage) {
    verbs.push({ id: 'complete', label: 'Complete event' });
  }
  return verbs;
}

export function seatedCount(regs: EventRegistration[]): number {
  return regs.filter(
    (r) => r.status === 'REGISTERED' || r.status === 'ATTENDED',
  ).length;
}

export function waitlistCount(regs: EventRegistration[]): number {
  return regs.filter((r) => r.status === 'WAITLIST').length;
}

export function expectedCheckIn(regs: EventRegistration[]): EventRegistration[] {
  return regs.filter(
    (r) =>
      r.status === 'REGISTERED' ||
      r.status === 'ATTENDED' ||
      r.status === 'NO_SHOW',
  );
}

export function checkedInCount(regs: EventRegistration[]): number {
  return regs.filter((r) => r.status === 'ATTENDED').length;
}

export function offerExpired(reg: EventRegistration, now = Date.now()): boolean {
  if (!reg.offerExpiresAt) return false;
  if (reg.status !== 'REGISTERED') return false;
  return new Date(reg.offerExpiresAt).getTime() < now;
}

export function offerWindowLabel(reg: EventRegistration): string | null {
  if (!reg.offerExpiresAt || reg.status !== 'REGISTERED') return null;
  const ms = new Date(reg.offerExpiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Offer expired';
  const hours = Math.ceil(ms / 3600000);
  return `Accept seat · ${hours}h left`;
}
