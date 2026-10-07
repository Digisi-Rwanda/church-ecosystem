/**
 * Music ministry (slice 3.12): the choirs and their register, the month plan of which choir serves
 * at which service, and an oversight summary. Rules follow the old engine: children's choirs only at
 * the first Sunday service, the worship team only on Tuesday, a choir at most once per service.
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const MUSIC = 'sys-music';
export const ROLES = ['PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP'] as const;
export const SERVICE_KINDS = ['SS1', 'SS2', 'TUESDAY', 'FRIDAY', 'IGABURO'] as const;
export type ChoirRole = (typeof ROLES)[number];
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const NAME_MAX = 80;
export const LABEL_MAX = 80;

const ALLOWED: Record<ServiceKind, readonly ChoirRole[]> = {
  SS1: ['PRIMARY', 'SECONDARY', 'CHILDREN'],
  SS2: ['PRIMARY', 'SECONDARY'],
  TUESDAY: ['PRIMARY', 'SECONDARY', 'WORSHIP'],
  FRIDAY: ['PRIMARY', 'SECONDARY'],
  IGABURO: ['PRIMARY', 'SECONDARY'],
};
export const roleMayServe = (role: string, kind: string): boolean => (ALLOWED[kind as ServiceKind] as readonly string[] | undefined)?.includes(role) ?? false;

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const monthOf = (day: string) => day.slice(0, 7);

const held = (me: string, s: string, mod: 'PEOPLE' | 'SCHEDULING', d: AccessData, now: Date) => lettersInSystem(me, s, d, now)[mod] as string[];
/** The Music ministry's own offices run the plan and the register of every choir. */
export const canReadPlan = (me: string, d: AccessData, now = new Date()) => held(me, MUSIC, 'SCHEDULING', d, now).includes('R');
export const canWritePlan = (me: string, d: AccessData, now = new Date()) => held(me, MUSIC, 'SCHEDULING', d, now).includes('W');
export const canOversee = (me: string, d: AccessData, now = new Date()) => held(me, MUSIC, 'PEOPLE', d, now).includes('R');
export const canManageChoirs = (me: string, d: AccessData, now = new Date()) => held(me, MUSIC, 'PEOPLE', d, now).includes('W');
/** A choir's own leaders (People W in the choir's system) may read and change its register too. */
export const canReadChoir = (me: string, systemId: string | null | undefined, d: AccessData, now = new Date()) =>
  canOversee(me, d, now) || (!!systemId && systemId !== MUSIC && held(me, systemId, 'PEOPLE', d, now).includes('R'));
export const canWriteChoir = (me: string, systemId: string | null | undefined, d: AccessData, now = new Date()) =>
  canManageChoirs(me, d, now) || (!!systemId && systemId !== MUSIC && held(me, systemId, 'PEOPLE', d, now).includes('W'));
