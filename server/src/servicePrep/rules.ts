/**
 * Service preparation: what the church leader (and anyone he delegates) plans for one service.
 *
 * Pulpit roles and who fills them are edited here. The choir and the Protocol team are only READ from the
 * Music and Protocol schedules, so nothing is typed twice and the schedules stay the one source of truth.
 *
 * Who may do what:
 *  - edit: the Church Leader (any church-wide office with People W, the same people who could edit the old
 *    Pulpit plan) and the coordinators the leader names in ServicePrepEditor;
 *  - view: everyone who can edit, plus anyone with Scheduling R in Central Administration, Music or Protocol.
 */
import { lettersInSystem, liveHoldings, type AccessData } from '../capabilities/engine.js';

export const CHURCH = 'sys-main';
export const MUSIC = 'sys-music';
export const PROTOCOL = 'sys-protocol';
export const ENTRY_STATUSES = ['PLANNED', 'DONE', 'CANCELLED'] as const;
export const NAME_MAX = 80;
export const SHORT_MAX = 120;
/** The role every church starts with. Leaders rename it or add others; nothing else is built in. */
export const DEFAULT_ROLE = { id: 'pulpit-role-preacher', code: 'preacher', name: 'Preacher' } as const;

export const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const monthOf = (day: string) => day.slice(0, 7);

/** A church-wide leader: any live church-scoped office with People W. */
export const isLeader = (me: string, d: AccessData, now = new Date()) =>
  liveHoldings(me, d, now).some((h) => h.scope === 'CHURCH' && !!h.letters.PEOPLE?.includes('W'));

const scheduling = (me: string, systemId: string, d: AccessData, now: Date) => lettersInSystem(me, systemId, d, now).SCHEDULING as string[];

export const canWrite = (me: string, d: AccessData, editors: ReadonlySet<string>, now = new Date()) =>
  isLeader(me, d, now) || editors.has(me);

export const canRead = (me: string, d: AccessData, editors: ReadonlySet<string>, now = new Date()) =>
  canWrite(me, d, editors, now) ||
  [CHURCH, MUSIC, PROTOCOL].some((systemId) => scheduling(me, systemId, d, now).includes('R'));

/** Who fills a pulpit role: exactly one of a member, a registered guest, or a visiting speaker typed by name. */
export function whoProblem(w: { personId?: string | null; guestId?: string | null; guestName?: string | null }): string | null {
  const given = [w.personId, w.guestId, (w.guestName ?? '').trim() || null].filter(Boolean).length;
  return given === 1 ? null : given === 0 ? 'Choose who fills this role' : 'Choose a member, a guest or a visiting speaker, not several';
}

/** The services of a month are labelled by code (SS1, IGABURO); URLs and entries use it upper-case. */
export const codeKey = (code: string) => code.trim().toUpperCase();
