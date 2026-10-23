/**
 * Evangelism (slice 3.10): contacts and follow-up, and the Pulpit plan with guest preachers.
 * Contacts and guest details are personal, so they need People letters in Evangelism; the Church
 * Leader holds them church-wide and so can change anything Evangelism's own leaders can.
 * The preaching plan itself may be read by anyone who can enter Evangelism (Scheduling R).
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const EVANGELISM = 'sys-evangelism';
export const NAME_MAX = 80;
export const SHORT_MAX = 120;
export const NOTE_MAX = 1000;
export const CONTACT_STATUSES = ['NEW', 'FOLLOWING', 'JOINED', 'CLOSED'] as const;
export const SLOT_STATUSES = ['PLANNED', 'DONE', 'CANCELLED'] as const;
/** The plan shows services from this many days back, so a month can be reviewed. */
export const PLAN_LOOKBACK_DAYS = 31;

const held = (me: string, mod: 'PEOPLE' | 'SCHEDULING', d: AccessData, now: Date) => lettersInSystem(me, EVANGELISM, d, now)[mod] as string[];
export const canReadContacts = (me: string, d: AccessData, now = new Date()) => held(me, 'PEOPLE', d, now).includes('R');
export const canWriteContacts = (me: string, d: AccessData, now = new Date()) => held(me, 'PEOPLE', d, now).includes('W');
export const canReadPlan = (me: string, d: AccessData, now = new Date()) => held(me, 'SCHEDULING', d, now).includes('R');
export const canWritePlan = canWriteContacts;
export const canReadGuests = canReadContacts;

/** A phone number with only digits, spaces, + - ( ) and between 6 and 20 characters; empty is fine. */
export const phoneOk = (v: string | null | undefined) => !v || (/^[0-9+\-() ]+$/.test(v) && v.replace(/\D/g, '').length >= 6 && v.length <= 20);
export const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
