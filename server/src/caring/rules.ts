/**
 * Caring ministries (slice 3.9): Couples (pairs), Elderly (visit log) and Intercessors (prayer watches).
 * Couples need People letters; the visit log is sensitive so reading it needs People W as well;
 * watches use Scheduling letters, and any member who can enter the system may read the roster.
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const COUPLES = 'sys-couples';
export const ELDERLY = 'sys-elderly';
export const INTERCESSORS = 'sys-intercessors';
export const NAME_MAX = 80;
export const NOTE_MAX = 1000;
export const VISITORS_MAX = 10;
export const MEMBERS_MAX = 40;

const held = (me: string, s: string, mod: 'PEOPLE' | 'SCHEDULING', d: AccessData, now: Date) => lettersInSystem(me, s, d, now)[mod] as string[];
export const canReadCouples = (me: string, d: AccessData, now = new Date()) => held(me, COUPLES, 'PEOPLE', d, now).includes('R');
export const canWriteCouples = (me: string, d: AccessData, now = new Date()) => held(me, COUPLES, 'PEOPLE', d, now).includes('W');
/** Visits are private: only those who may change People records in Elderly may read or write them. */
export const canUseVisits = (me: string, d: AccessData, now = new Date()) => held(me, ELDERLY, 'PEOPLE', d, now).includes('W');
export const canReadWatches = (me: string, d: AccessData, now = new Date()) => held(me, INTERCESSORS, 'SCHEDULING', d, now).includes('R');
export const canWriteWatches = (me: string, d: AccessData, now = new Date()) => held(me, INTERCESSORS, 'SCHEDULING', d, now).includes('W');

export const timeOk = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** A watch must end after it starts, on the same day. */
export const watchTimesProblem = (start: string, end: string): 'BAD_TIMES' | null => (timeOk(start) && timeOk(end) && start < end ? null : 'BAD_TIMES');
export const samePair = (a: string, b: string) => a === b;
